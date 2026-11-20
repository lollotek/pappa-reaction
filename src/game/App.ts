import type { AudioEngine, AudioOut } from '../audio/AudioEngine';
import { silentAudio } from '../audio/SilentAudio';
import type { PlayerSlot } from '../config/controls';
import { keyLabel } from '../config/keyLabel';
import {
  DIFFICULTIES,
  assignKey,
  defaultSettings,
  saveSettings,
  type KeyValueStore,
  type Settings,
} from '../config/settings';
import { Gamepads, type PadFrame } from '../input/Gamepads';
import {
  MergedInput,
  TouchInput,
  type Axis,
  type FrameInput,
  type InputSource,
} from '../input/InputSource';
import type { Keyboard } from '../input/Keyboard';
import {
  singleLayout,
  stickLayout,
  stripLayout,
  touchLayout,
  type Insets,
} from '../input/touchLayout';
import { BackButton } from '../platform/BackButton';
import { Device, installMode } from '../platform/Device';
import { MobileShell } from '../platform/MobileShell';
import { diagnosticsLine } from '../platform/diagnostics';
import { backToHub } from '../platform/navigation';
import {
  MAX_TOUCH_HUMANS,
  TOUCH_PREFS,
  limitHumans,
  resolveTouchMode,
  touchHumans,
} from '../platform/touchMode';
import type { PixelRenderer } from '../render/PixelRenderer';
import { ButtonTest } from '../ui/ButtonTest';
import { KeyTest } from '../ui/KeyTest';
import { MenuModel, type MenuItem, type MenuKey } from '../ui/MenuModel';
import { MenuView } from '../ui/MenuView';
import { PauseButton } from '../ui/PauseButton';
import { TouchButtons } from '../ui/TouchButtons';
import type { GameDef, GameSession, SessionDeps, SessionRequest, SettingsAccess } from './GameDef';

type Mode = 'menu' | 'keytest' | 'match' | 'paused';

const MENU_KEYS: Record<string, MenuKey> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'enter',
  Space: 'enter',
  NumpadEnter: 'enter',
  Escape: 'back',
  Backspace: 'back',
};

/** Pausa prima che la demo dietro al menu ricominci dopo la classifica. */
const DEMO_RESTART_MS = 4000;

/** Scritta sul pulsante principale e posizione dei comandi touch, per tipo di gioco. */
const TOUCH_LABEL = {
  buttons: 'SCATTO',
  strip: 'SMASH',
  single: 'ZAMPATA',
  stick: 'CACCA',
} as const;
const TOUCH_LAYOUT = {
  buttons: touchLayout,
  strip: stripLayout,
  single: singleLayout,
  stick: stickLayout,
} as const;

export interface AppDeps<S extends GameSession> {
  container: HTMLElement;
  slots: readonly PlayerSlot[];
  /** Il minigioco: partite, voci di menu e testi propri. */
  game: GameDef<S>;
  pixel: PixelRenderer;
  audio: AudioEngine;
  keyboard: Keyboard;
  store: KeyValueStore | null;
  settings: Settings;
  /** Indirizzo dell'hub di Priamo Stadium ("Torna all'hub"). */
  hubUrl: string;
}

/**
 * Flusso comune dei minigiochi: titolo e menu (con una partita dimostrativa tra
 * CPU sullo sfondo), partita, pausa, classifica e rivincita. Tastiera, tocco e
 * controller; quel che cambia da un gioco all'altro sta nel suo `GameDef`.
 */
export class App<S extends GameSession = GameSession> {
  private mode: Mode = 'menu';
  private settings: Settings;
  private session: S | null = null;
  private demo: S | null = null;
  private demoFinishedAt: number | null = null;
  private menu: MenuModel | null = null;
  private readonly view: MenuView;
  private readonly keyTest: KeyTest;
  private readonly logo: HTMLElement;
  /** Tastiera e pulsanti touch insieme. */
  private readonly input: InputSource;
  private readonly gamepads = new Gamepads();
  private readonly touch = new TouchInput();
  private readonly touchButtons: TouchButtons;
  private readonly pauseButton: PauseButton;
  private readonly buttonTest: ButtonTest;
  private readonly backButton: BackButton;
  private readonly device: Device;
  private readonly shell: MobileShell;
  private readonly portrait = window.matchMedia?.('(orientation: portrait)');
  /** Modalità touch attiva (pulsanti a schermo, menu adattati). */
  private touchMode = false;
  private sawTouch = false;
  private readonly coarse = window.matchMedia?.('(pointer: coarse)');
  private readonly fine = window.matchMedia?.('(pointer: fine)');
  /** Menu del titolo aperto (da rifare quando cambia il pulsante "Installa"). */
  private titleMenu: MenuModel | null = null;
  /** Stato dei comandi touch già applicato (per non rifare il DOM a ogni frame). */
  private touchUiKey = '';
  /** L'audio era già sbloccato prima di questo tocco (vedi indicatore audio). */
  private audioWasUnlocked = false;

  constructor(private readonly deps: AppDeps<S>) {
    this.settings = deps.settings;
    this.input = new MergedInput([deps.keyboard, this.touch]);
    this.view = new MenuView(
      deps.container,
      () => this.afterMenuChange(),
      (activated) => deps.audio.sfx(activated ? 'confirm' : 'click'),
    );
    this.keyTest = new KeyTest(deps.container, deps.slots, () => this.showControls());
    this.touchButtons = new TouchButtons(
      deps.container,
      deps.slots,
      TOUCH_LABEL[deps.game.touchControls],
    );
    this.touchButtons.onPress = (p, a, t) => {
      if (this.mode === 'match') this.touch.press(p, a, t);
    };
    this.pauseButton = new PauseButton(deps.container, () => {
      if (this.mode === 'match' && this.session && !this.session.finished) this.pause();
    });
    this.buttonTest = new ButtonTest(deps.container, this.touchButtons, () => this.showControls());
    this.backButton = new BackButton(() => this.handleBack());
    // Schermo intero chiuso (gesto Indietro, notifica…) durante la partita: pausa.
    this.device = new Device(
      () => this.autoPauseTouch(),
      () => this.refreshTitle(),
    );
    // Avviso di rotazione, schermo intero al primo tocco e pulsante per forzarlo (come nell'hub).
    this.shell = new MobileShell(deps.container, this.device, {
      touch: () => this.touchMode,
      auto: () => this.settings.fullscreen,
      allowButton: () => this.mode !== 'match',
    });

    this.logo = document.createElement('div');
    this.logo.className = 'title-logo';
    this.logo.innerHTML = `<h1>${deps.game.title}</h1><p>Priamo Stadium</p>`;
    deps.container.appendChild(this.logo);

    this.applyAudioSettings();
    deps.keyboard.setBindings(this.settings.keys);
    deps.audio.onChange(() => this.refreshAudio());
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.listenTouch(deps.container);
    this.updateTouchMode();

    // Pausa automatica: con la finestra in secondo piano il browser smette di
    // disegnare ma il tempo reale scorre, e al ritorno i round sarebbero passati.
    const autoPause = () => {
      if (this.mode === 'match' && this.session && !this.session.finished) this.pause();
    };
    window.addEventListener('blur', autoPause);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) autoPause();
    });
  }

  /** Partita attiva (o demo), per il debug. */
  get currentSession(): S | null {
    return this.session ?? this.demo;
  }

  /** Avvio normale: titolo con demo sullo sfondo. */
  start(): void {
    this.showTitle();
  }

  /** Avvio diretto in partita (parametri URL di sviluppo). */
  startDirect(overrides: Partial<SessionRequest>): void {
    this.startMatch(overrides);
  }

  frame(realNow: number): void {
    const pad = this.gamepads.poll(realNow);
    this.onPad(pad);
    const input = this.frameInput(pad);
    // In verticale non si gioca: pausa (l'avviso "ruota il dispositivo" copre lo schermo).
    if (this.portrait?.matches) this.autoPauseTouch();
    this.updateTouchUi(realNow);
    this.shell.update();
    if (this.session) {
      this.session.frame(realNow, this.mode === 'match' ? input : EMPTY);
      return;
    }
    // Menu: la demo gira sullo sfondo; i tasti dei gatti non contano.
    if (!this.demo) this.demo = this.createDemo(realNow);
    this.demo.frame(realNow, EMPTY);
    if (this.demo.finished) {
      this.demoFinishedAt ??= realNow;
      if (realNow - this.demoFinishedAt > DEMO_RESTART_MS) {
        this.demo.restart(realNow);
        this.demoFinishedAt = null;
      }
    }
  }

  /**
   * Comandi del frame: tastiera, tocco e controller. Il k-esimo controller va
   * al k-esimo gatto umano della partita.
   */
  private frameInput(pad: PadFrame): FrameInput {
    const presses = this.input.drain();
    const humans = (this.session?.players ?? []).flatMap((c, i) => (c === 'human' ? [i] : []));
    const fromPads = Gamepads.toInputs(pad, humans);
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const axes = this.deps.slots.map((_, p): Axis => {
      const k = this.deps.keyboard.axis(p);
      const padIndex = humans.indexOf(p);
      const g = padIndex >= 0 ? this.gamepads.axis(padIndex) : { x: 0, y: 0 };
      const t = this.touchButtons.stickAxis(p) ?? { x: 0, y: 0 };
      return { x: clamp(k.x + g.x + t.x), y: clamp(k.y + g.y + t.y) };
    });
    return {
      presses: fromPads.length ? [...presses, ...fromPads].sort((a, b) => a.t - b.t) : presses,
      axes,
      strips: this.deps.slots.map((_, p) => this.touchButtons.stripValue(p)),
    };
  }

  /** Controller nei menu: frecce, A conferma, B indietro, START pausa/riprendi. */
  private onPad(pad: PadFrame): void {
    if (pad.menu.length === 0 && !pad.start) return;
    if (this.mode === 'keytest') {
      if (pad.menu.includes('back')) this.showControls();
      return;
    }
    if (this.menu && (this.mode === 'menu' || this.mode === 'paused')) {
      if (this.menu.capturing) {
        if (pad.menu.includes('back') && this.menu.press('back')) this.afterMenuChange();
        return;
      }
      if (pad.start && this.mode === 'paused') return this.resume();
      const keys: MenuKey[] = pad.start ? [...pad.menu, 'enter'] : pad.menu;
      // Una voce può cambiare schermata: i comandi dopo vanno al menu nuovo.
      for (const key of keys) {
        this.menuSound(key);
        if (this.menu?.press(key)) this.afterMenuChange();
      }
      return;
    }
    if (this.mode === 'match' && this.session) {
      if (this.session.finished) {
        if (pad.menu.includes('enter') || pad.start) this.session.restart(performance.now());
        else if (pad.menu.includes('back')) this.quitToTitle();
      } else if (pad.start) {
        this.pause();
      }
    }
  }

  // ---------------------------------------------------------------- tastiera

  private onKey(e: KeyboardEvent): void {
    if (e.code === 'F3') return;

    if (this.mode === 'keytest') {
      if (e.code === 'Escape') this.showControls();
      return;
    }

    if (this.menu && (this.mode === 'menu' || this.mode === 'paused')) {
      if (this.menu.capturing) {
        e.preventDefault();
        if (e.code === 'Escape') this.menu.press('back');
        else this.menu.capture(e.code);
        this.afterMenuChange();
        return;
      }
      if (e.code === 'KeyM' && !e.repeat) return this.deps.audio.toggleMute();
      const key = MENU_KEYS[e.code];
      if (!key) return;
      e.preventDefault();
      if (!e.repeat || key !== 'enter') this.menuSound(key);
      if (this.menu.press(key)) this.afterMenuChange();
      return;
    }

    if (this.mode === 'match' && this.session) {
      if (e.code === 'KeyM' && !e.repeat) return this.deps.audio.toggleMute();
      if (this.session.finished) {
        if (e.code === 'Enter') this.session.restart(e.timeStamp);
        else if (e.code === 'Escape') this.quitToTitle();
        return;
      }
      if (e.code === 'Escape') this.pause();
    }
  }

  /** Click per ogni tasto dei menu, bip più pieno alla conferma. */
  private menuSound(key: MenuKey): void {
    this.deps.audio.sfx(key === 'enter' ? 'confirm' : 'click');
  }

  private afterMenuChange(): void {
    this.view.render();
  }

  // ---------------------------------------------------------------- partita

  private startMatch(overrides: Partial<SessionRequest> = {}): void {
    this.demo?.dispose();
    this.demo = null;
    this.closeMenus();
    const s = this.settings;
    this.session = this.deps.game.createSession(
      this.sessionDeps(this.deps.audio),
      {
        players: this.touchMode ? limitHumans(s.players, MAX_TOUCH_HUMANS) : s.players,
        difficulty: s.difficulty,
        settings: s,
        screenEffects: s.screenEffects,
        showHud: true,
        ...overrides,
      },
      performance.now(),
    );
    this.input.clear();
    this.mode = 'match';
    this.backButton.arm();
    this.refreshAudio();
  }

  private pause(): void {
    if (!this.session) return;
    this.session.pause(performance.now());
    this.deps.audio.suspend();
    this.mode = 'paused';
    this.openMenu(
      new MenuModel(
        'Pausa',
        [
          { kind: 'action', label: 'Riprendi', onSelect: () => this.resume(), accent: true },
          {
            kind: 'action',
            label: 'Ricomincia la partita',
            onSelect: () => {
              this.resume();
              this.session?.restart(performance.now());
            },
          },
          { kind: 'action', label: 'Torna al menu', onSelect: () => this.quitToTitle() },
        ],
        () => this.resume(),
      ),
      '',
      'menu-pause',
    );
  }

  private resume(): void {
    if (!this.session) return;
    this.enterFullscreenIfWanted();
    this.closeMenus();
    this.session.resume(performance.now());
    this.deps.audio.resume();
    this.input.clear(); // niente scatti "rimasti in coda" dalla pausa
    this.mode = 'match';
  }

  private quitToTitle(): void {
    this.deps.audio.resume();
    this.session?.dispose();
    this.session = null;
    this.showTitle();
  }

  private createDemo(realNow: number): S {
    return this.deps.game.createSession(
      this.sessionDeps(silentAudio),
      {
        players: this.deps.slots.map(() => 'cpu'),
        difficulty: 'normale',
        settings: this.settings,
        screenEffects: false,
        showHud: false,
      },
      realNow,
    );
  }

  private sessionDeps(audio: AudioOut): SessionDeps {
    const { container, slots, pixel } = this.deps;
    return { container, slots, pixel, audio };
  }

  /** Impostazioni per le voci di menu dei giochi. */
  private readonly access: SettingsAccess = {
    get: () => this.settings,
    update: (patch) => this.update(patch),
  };

  // ---------------------------------------------------------------- schermate

  private showTitle(): void {
    this.logo.hidden = false;
    this.openMenu(
      new MenuModel(
        '',
        [
          {
            kind: 'action',
            label: 'Gioca',
            onSelect: () => {
              this.enterFullscreenIfWanted();
              this.showSetup();
            },
            accent: true,
          },
          { kind: 'action', label: 'Regole', onSelect: () => this.showRules() },
          { kind: 'action', label: 'Comandi', onSelect: () => this.showControls() },
          { kind: 'action', label: 'Opzioni', onSelect: () => this.showOptions() },
          ...this.installItems(),
          { kind: 'action', label: "Torna all'hub", onSelect: () => this.goToHub() },
        ],
        // ESC e Indietro (Android) dal titolo riportano all'hub.
        () => this.goToHub(),
      ),
      '',
      'menu-title',
    );
    this.titleMenu = this.menu;
  }

  private goToHub(): void {
    this.closeMenus();
    backToHub(this.deps.hubUrl, this.backButton.extraEntries);
  }

  /** Rifà il menu del titolo se è aperto (es. il browser ora permette di installare). */
  private refreshTitle(): void {
    if (this.menu && this.menu === this.titleMenu) {
      const selected = this.menu.selected;
      this.showTitle();
      if (this.menu.items[selected]) this.menu.selected = selected;
      this.view.render();
    }
  }

  /** Voce "Installa": finestra del browser dove c'è, altrimenti le istruzioni. */
  private installItems(): MenuItem[] {
    const mode = installMode({
      canPrompt: this.device.canPromptInstall,
      // Non solo `touchMode`: il pulsante non deve comparire sotto il dito al primo tocco.
      touch: this.touchMode || this.coarse?.matches === true || navigator.maxTouchPoints > 0,
      standalone: this.device.standalone,
    });
    if (!mode) return [];
    return [
      {
        kind: 'action',
        label: 'Installa',
        onSelect: () => {
          if (mode === 'prompt') {
            void this.device.promptInstall().then(() => this.refreshTitle());
          } else {
            this.showInstallHelp();
          }
        },
      },
    ];
  }

  private showInstallHelp(): void {
    const steps = this.device.isIos
      ? '<p class="menu-text">In <b>Safari</b> tocca <b>Condividi</b> (il quadrato con la freccia), poi <b>Aggiungi alla schermata Home</b>. Apri Priamo Stadium dalla sua icona: su iPhone è l’unico modo per giocare a schermo intero.</p>' +
        '<p class="menu-text">Se il link si è aperto dentro un’app (WhatsApp, Instagram…), aprilo prima in Safari.</p>'
      : '<p class="menu-text">Apri il menu del browser (<b>⋮</b>) e scegli <b>Installa app</b> o <b>Aggiungi a schermata Home</b>, poi apri Priamo Stadium dalla sua icona.</p>' +
        '<p class="menu-text">Se il link si è aperto dentro un’app (WhatsApp, Instagram…), aprilo prima in Chrome.</p>';
    this.openMenu(
      new MenuModel(
        'Installa',
        [{ kind: 'action', label: 'Indietro', onSelect: () => this.showTitle() }],
        () => this.showTitle(),
      ),
      `<div class="menu-rules">${steps}</div>`,
      'menu-wide',
    );
  }

  private showSetup(): void {
    // Sempre `this.settings` (non una copia): ogni modifica crea un nuovo oggetto.
    const items: MenuItem[] = [
      ...this.deps.slots.map((slot, i): MenuItem => ({
        kind: 'choice',
        label: slot.name,
        options: ['Umano', 'CPU'],
        get: () => (this.settings.players[i] === 'human' ? 0 : 1),
        set: (v) => {
          const players = this.settings.players.map((p, k) =>
            k === i ? (v === 0 ? 'human' : 'cpu') : p,
          );
          // In modalità touch al massimo 2 umani: chi c'era da prima torna CPU.
          this.update({
            players: this.touchMode ? limitHumans(players, MAX_TOUCH_HUMANS, i) : players,
          });
        },
        color: slot.badgeColor,
      })),
      {
        kind: 'choice',
        label: 'Difficoltà CPU',
        options: DIFFICULTIES,
        get: () => DIFFICULTIES.indexOf(this.settings.difficulty),
        set: (v) => this.update({ difficulty: DIFFICULTIES[v] }),
      },
      ...this.deps.game.setupItems(this.access),
      {
        kind: 'action',
        label: 'Inizia!',
        onSelect: () => {
          this.enterFullscreenIfWanted();
          this.startMatch();
        },
        accent: true,
      },
      { kind: 'action', label: 'Indietro', onSelect: () => this.showTitle() },
    ];
    this.openMenu(new MenuModel('Nuova partita', items, () => this.showTitle()), () =>
      this.humanKeysHtml(),
    );
  }

  private showControls(): void {
    this.keyTest.hide();
    this.buttonTest.hide();
    this.mode = 'menu';
    if (this.touchMode) {
      this.openMenu(
        new MenuModel(
          'Comandi',
          [
            {
              kind: 'action',
              label: 'Prova i pulsanti',
              onSelect: () => this.showKeyTest(),
              accent: true,
            },
            { kind: 'action', label: 'Indietro', onSelect: () => this.showTitle() },
          ],
          () => this.showTitle(),
        ),
        this.deps.game.touchControlsHtml + TOUCH_KEYBOARD_NOTE,
      );
      return;
    }
    const items: MenuItem[] = [];
    this.deps.slots.forEach((slot, i) => {
      this.deps.game.keyActions.forEach(({ action, label }) =>
        items.push({
          kind: 'key',
          label: `${slot.name} · ${label}`,
          get: () => this.settings.keys[i][action],
          capture: (code) => {
            const r = assignKey(this.settings.keys, i, action, code);
            if (!r.ok) return r.error;
            this.update({ keys: r.keys });
            return null;
          },
          color: slot.badgeColor,
        }),
      );
    });
    items.push(
      { kind: 'action', label: 'Prova i tasti', onSelect: () => this.showKeyTest(), accent: true },
      {
        kind: 'action',
        label: 'Ripristina predefiniti',
        onSelect: () => this.update({ keys: defaultSettings(this.deps.slots).keys }),
      },
      { kind: 'action', label: 'Indietro', onSelect: () => this.showTitle() },
    );
    this.openMenu(
      new MenuModel('Comandi', items, () => this.showTitle()),
      '<p class="menu-text">INVIO su un tasto e premi quello nuovo. Se è già usato, i due si scambiano. ' +
        'Con i controller: il primo comanda il primo gatto umano, il secondo il secondo…</p>',
      'menu-wide',
    );
  }

  private showKeyTest(): void {
    this.view.hide();
    this.menu = null;
    this.mode = 'keytest';
    this.backButton.arm();
    if (this.touchMode) this.buttonTest.show();
    else this.keyTest.show(this.settings.keys, this.deps.game.keyActions);
  }

  private showOptions(): void {
    const gameOptions = this.deps.game.optionItems(this.access);
    const items: MenuItem[] = [
      {
        kind: 'slider',
        label: 'Volume musica',
        min: 0,
        max: 10,
        get: () => this.settings.musicVolume,
        set: (v) => this.update({ musicVolume: v }),
      },
      {
        kind: 'slider',
        label: 'Volume effetti',
        min: 0,
        max: 10,
        get: () => this.settings.sfxVolume,
        set: (v) => this.update({ sfxVolume: v }),
      },
      {
        kind: 'choice',
        label: 'Audio',
        options: ['sì', 'no'],
        get: () => (this.deps.audio.muted ? 1 : 0),
        set: () => this.deps.audio.toggleMute(),
      },
      ...gameOptions.items,
      {
        kind: 'choice',
        label: 'Lampi e scosse',
        options: ['sì', 'no'],
        get: () => (this.settings.screenEffects ? 0 : 1),
        set: (v) => this.update({ screenEffects: v === 0 }),
      },
      {
        kind: 'choice',
        label: 'Pulsanti touch',
        options: ['auto', 'sì', 'no'],
        get: () => TOUCH_PREFS.indexOf(this.settings.touch),
        set: (v) => {
          this.update({ touch: TOUCH_PREFS[v] });
          this.updateTouchMode();
        },
      },
      {
        kind: 'choice',
        label: 'Schermo intero',
        options: ['sì', 'no'],
        get: () => (this.settings.fullscreen ? 0 : 1),
        set: (v) => {
          this.update({ fullscreen: v === 0 });
          if (v === 0) void this.device.exitFullscreen();
          else this.enterFullscreenIfWanted();
        },
      },
      // Indietro prima delle note: su due colonne sta accanto a "Schermo intero".
      { kind: 'action', label: 'Indietro', onSelect: () => this.showTitle() },
      ...gameOptions.notes.map((label): MenuItem => ({ kind: 'info', label })),
      {
        kind: 'info',
        label: 'Pulsanti touch "auto": compaiono al primo tocco.',
      },
      {
        kind: 'info',
        label: 'Schermo intero: solo col touch; blocca la rotazione.',
      },
    ];
    const diagnostics = () => this.diagnostics();
    items.push({
      kind: 'info',
      wide: true,
      // Ricalcolata a ogni disegno: cambia con "Pulsanti touch" e al primo tocco.
      get label() {
        return diagnostics();
      },
    });
    this.openMenu(new MenuModel('Opzioni', items, () => this.showTitle()));
  }

  private showRules(): void {
    this.openMenu(
      new MenuModel(
        'Regole',
        [{ kind: 'action', label: 'Indietro', onSelect: () => this.showTitle() }],
        () => this.showTitle(),
      ),
      () =>
        `<div class="menu-rules">${this.deps.game.rulesHtml}${
          this.touchMode ? this.deps.game.rulesTouchHtml : ''
        }</div>`,
      'menu-wide',
    );
  }

  // ---------------------------------------------------------------- supporto

  /** Stato del dispositivo in una riga, per gli screenshot dei playtester. */
  private diagnostics(): string {
    return diagnosticsLine({
      ua: navigator.userAgent,
      pointer: this.coarse?.matches ? 'dito' : this.fine?.matches ? 'mouse' : 'nessuno',
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      sawTouch: this.sawTouch,
      touchPref: this.settings.touch,
      touchMode: this.touchMode,
      fullscreenApi: this.device.fullscreenSupported,
      standalone: this.device.standalone,
      canPromptInstall: this.device.canPromptInstall,
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }

  private openMenu(model: MenuModel, extra: string | (() => string) = '', variant = ''): void {
    this.keyTest.hide();
    this.buttonTest.hide();
    // Anche sul titolo: lì l'Indietro torna all'hub (che a sua volta esce dall'app).
    this.backButton.arm();
    if (this.mode !== 'paused' || !this.session) this.mode = 'menu';
    this.logo.hidden = variant !== 'menu-title';
    this.menu = model;
    this.view.show(model, extra, variant);
  }

  private closeMenus(): void {
    this.menu = null;
    this.view.hide();
    this.keyTest.hide();
    this.buttonTest.hide();
    this.logo.hidden = true;
  }

  private update(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.deps.store, this.settings);
    if (patch.keys) this.deps.keyboard.setBindings(this.settings.keys);
    this.applyAudioSettings();
  }

  private applyAudioSettings(): void {
    this.deps.audio.setVolumes(this.settings.musicVolume, this.settings.sfxVolume);
  }

  private refreshAudio(): void {
    const a = this.deps.audio;
    const status = !a.unlocked ? 'locked' : a.muted ? 'off' : 'on';
    this.session?.setAudioStatus(status);
    if (this.mode === 'match') this.session?.resumeMusicIfNeeded(a);
    this.view.render();
  }

  // ---------------------------------------------------------------- touch

  private listenTouch(container: HTMLElement): void {
    // Fase di cattura: arriva prima dello sblocco dell'audio (AudioEngine).
    window.addEventListener(
      'pointerdown',
      (e) => {
        this.audioWasUnlocked = this.deps.audio.unlocked;
        if (e.pointerType === 'touch') this.markTouch();
      },
      { capture: true },
    );
    // Riserva: `touchstart` arriva solo da un dito vero, anche dove il browser
    // segnala il tocco come mouse (es. "sito desktop" o WebView particolari).
    window.addEventListener('touchstart', () => this.markTouch(), {
      capture: true,
      passive: true,
    });
    this.coarse?.addEventListener?.('change', () => this.updateTouchMode());
    // Niente menu contestuale (tocco lungo) sul gioco.
    container.addEventListener('contextmenu', (e) => e.preventDefault());

    // Pulsanti dell'HUD: fine partita e indicatore audio.
    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const final = target.closest<HTMLElement>('[data-final]')?.dataset.final;
      if (final && this.mode === 'match' && this.session?.finished) {
        if (final === 'rematch') this.session.restart(performance.now());
        else this.quitToTitle();
        return;
      }
      if (target.closest('[data-audio-toggle]') && this.audioWasUnlocked) {
        this.deps.audio.toggleMute();
      }
    });
  }

  private markTouch(): void {
    if (this.sawTouch) return;
    this.sawTouch = true;
    this.updateTouchMode();
  }

  /** Ricalcola la modalità touch (preferenza, primo tocco, tipo di puntatore). */
  private updateTouchMode(): void {
    const on = resolveTouchMode(this.settings.touch, this.sawTouch, this.coarse?.matches ?? false);
    if (on === this.touchMode) return;
    this.touchMode = on;
    document.body.classList.toggle('touch-mode', on);
    this.view.setInput(on ? 'touch' : 'key');
    // Niente standby mentre si gioca col dito (il dispositivo non riceve tasti).
    this.device.keepAwake(on);
    if (on) {
      const players = limitHumans(this.settings.players, MAX_TOUCH_HUMANS);
      if (players.some((p, i) => p !== this.settings.players[i])) this.update({ players });
    }
    this.view.render();
  }

  /** Schermo intero e blocco della rotazione, se in modalità touch e voluto (serve un gesto). */
  private enterFullscreenIfWanted(): void {
    if (this.touchMode && this.settings.fullscreen) void this.device.enterFullscreen();
  }

  /** Pausa per motivi del dispositivo (verticale, schermo intero chiuso). */
  private autoPauseTouch(): void {
    if (this.touchMode && this.mode === 'match' && this.session && !this.session.finished) {
      this.pause();
    }
  }

  /** Mostra/nasconde pulsanti e pausa touch secondo la schermata; stati per frame. */
  private updateTouchUi(realNow: number): void {
    const session = this.session;
    const playing =
      this.touchMode && this.mode === 'match' && session !== null && !session.finished;
    const testing = this.mode === 'keytest' && this.buttonTest.visible;
    const humans = testing ? [0, 1] : playing ? touchHumans(session.players) : [];
    const w = this.deps.container.clientWidth;
    const h = this.deps.container.clientHeight;
    const key = `${playing}|${testing}|${humans.join(',')}|${w}x${h}`;
    if (key !== this.touchUiKey) {
      this.touchUiKey = key;
      if (playing || testing) {
        const layout = TOUCH_LAYOUT[this.deps.game.touchControls];
        this.touchButtons.setLayout(layout(w, h, humans, safeInsets()));
        this.touchButtons.show();
      } else {
        this.touchButtons.hide();
      }
      if (playing) this.pauseButton.show();
      else this.pauseButton.hide();
      if (testing) humans.forEach((p) => this.touchButtons.setEnabled(p, true));
    }
    if (playing) {
      // Pulsanti spenti da storditi e in panchina.
      for (const p of humans) this.touchButtons.setEnabled(p, session.controlsEnabled(p, realNow));
    }
  }

  /** Indietro (Android o browser): true se gestito dal gioco. */
  private handleBack(): boolean {
    if (this.mode === 'keytest') {
      this.showControls();
      return true;
    }
    if (this.mode === 'match' && this.session) {
      if (this.session.finished) this.quitToTitle();
      else this.pause();
      return true;
    }
    if (this.menu && (this.mode === 'menu' || this.mode === 'paused')) {
      if (this.menu.capturing) return this.menu.press('back');
      const handled = this.menu.press('back');
      if (handled) this.afterMenuChange();
      return handled;
    }
    return false;
  }

  private humanTouchHtml(): string {
    const humans = touchHumans(this.settings.players).map((i) => this.deps.slots[i]);
    const tag = (s: PlayerSlot) => `<span style="--accent:${s.badgeColor}">${s.name}</span>`;
    if (humans.length === 0) return '<p class="menu-text">Solo CPU: guardi la partita.</p>';
    return this.deps.game.touchHumansHtml(humans.map(tag));
  }

  private humanKeysHtml(): string {
    if (this.touchMode) return this.humanTouchHtml();
    const actions = this.deps.game.keyActions;
    const humans = this.deps.slots.flatMap((slot, i) =>
      this.settings.players[i] === 'human'
        ? [
            `<span style="--accent:${slot.badgeColor}">${slot.name} ${actions
              .map(({ action }) => `<kbd>${keyLabel(this.settings.keys[i][action]) || '–'}</kbd>`)
              .join(' ')}</span>`,
          ]
        : [],
    );
    const pads = this.gamepads.count;
    const padNote = pads
      ? `<p class="menu-text">${pads} controller: ${
          pads === 1 ? 'comanda il primo gatto umano' : 'comandano i primi gatti umani, in ordine'
        }.</p>`
      : '';
    return humans.length
      ? `<p class="menu-keys">${humans.join('')}</p>${padNote}`
      : '<p class="menu-text">Solo CPU: guardi la partita.</p>';
  }
}

const TOUCH_KEYBOARD_NOTE =
  '<p class="menu-text">Per cambiare i tasti della tastiera metti <b>Pulsanti touch: no</b> in Opzioni.</p>';

const EMPTY: FrameInput = { presses: [], axes: [], strips: [] };

/** Aree sicure dello schermo (notch, angoli arrotondati) lette dal CSS. */
function safeInsets(): Insets {
  const css = getComputedStyle(document.documentElement);
  const px = (name: string) => Number.parseFloat(css.getPropertyValue(name)) || 0;
  return { top: px('--sat'), right: px('--sar'), bottom: px('--sab'), left: px('--sal') };
}
