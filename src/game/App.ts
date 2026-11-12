import type { AudioEngine, AudioOut } from '../audio/AudioEngine';
import { silentAudio } from '../audio/SilentAudio';
import type { PlayerSlot } from '../config/controls';
import { keyLabel } from '../config/keyLabel';
import {
  DIFFICULTIES,
  ROUND_OPTIONS,
  assignKey,
  defaultSettings,
  saveSettings,
  type KeyAction,
  type KeyValueStore,
  type Settings,
} from '../config/settings';
import { MergedInput, TouchInput, type InputSource } from '../input/InputSource';
import type { Keyboard } from '../input/Keyboard';
import { touchLayout, type Insets } from '../input/touchLayout';
import { BackButton } from '../platform/BackButton';
import {
  MAX_TOUCH_HUMANS,
  TOUCH_PREFS,
  limitHumans,
  resolveTouchMode,
  touchHumans,
} from '../platform/touchMode';
import type { PixelRenderer } from '../render/PixelRenderer';
import type { MatchScene } from '../scenes/MatchScene';
import { ButtonTest } from '../ui/ButtonTest';
import { KeyTest } from '../ui/KeyTest';
import { MenuModel, type MenuItem, type MenuKey } from '../ui/MenuModel';
import { MenuView } from '../ui/MenuView';
import { PauseButton } from '../ui/PauseButton';
import { TouchButtons } from '../ui/TouchButtons';
import { MatchSession, type SessionDeps, type SessionOptions } from './MatchSession';

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

export interface AppDeps {
  container: HTMLElement;
  slots: readonly PlayerSlot[];
  scene: MatchScene;
  pixel: PixelRenderer;
  audio: AudioEngine;
  keyboard: Keyboard;
  store: KeyValueStore | null;
  settings: Settings;
}

/**
 * Flusso del gioco: titolo e menu (con una partita dimostrativa tra CPU
 * sullo sfondo), partita, pausa, classifica e rivincita.
 */
export class App {
  private mode: Mode = 'menu';
  private settings: Settings;
  private session: MatchSession | null = null;
  private demo: MatchSession | null = null;
  private demoFinishedAt: number | null = null;
  private menu: MenuModel | null = null;
  private readonly view: MenuView;
  private readonly keyTest: KeyTest;
  private readonly logo: HTMLElement;
  /** Tastiera e pulsanti touch insieme. */
  private readonly input: InputSource;
  private readonly touch = new TouchInput();
  private readonly touchButtons: TouchButtons;
  private readonly pauseButton: PauseButton;
  private readonly buttonTest: ButtonTest;
  private readonly backButton: BackButton;
  /** Modalità touch attiva (pulsanti a schermo, menu adattati). */
  private touchMode = false;
  private sawTouch = false;
  private readonly coarse = window.matchMedia?.('(pointer: coarse)');
  /** Stato dei comandi touch già applicato (per non rifare il DOM a ogni frame). */
  private touchUiKey = '';
  /** L'audio era già sbloccato prima di questo tocco (vedi indicatore audio). */
  private audioWasUnlocked = false;

  constructor(private readonly deps: AppDeps) {
    this.settings = deps.settings;
    this.input = new MergedInput([deps.keyboard, this.touch]);
    this.view = new MenuView(deps.container, () => this.afterMenuChange());
    this.keyTest = new KeyTest(deps.container, deps.slots);
    this.touchButtons = new TouchButtons(deps.container, deps.slots);
    this.touchButtons.onPress = (p, a, t) => {
      if (this.mode === 'match') this.touch.press(p, a, t);
    };
    this.pauseButton = new PauseButton(deps.container, () => {
      if (this.mode === 'match' && this.session && !this.session.finished) this.pause();
    });
    this.buttonTest = new ButtonTest(deps.container, this.touchButtons, () => this.showControls());
    this.backButton = new BackButton(() => this.handleBack());
    this.logo = document.createElement('div');
    this.logo.className = 'title-logo';
    this.logo.innerHTML = '<h1>Pappa Reaction</h1><p>Priamo Stadium</p>';
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
  get currentSession(): MatchSession | null {
    return this.session ?? this.demo;
  }

  /** Avvio normale: titolo con demo sullo sfondo. */
  start(): void {
    this.showTitle();
  }

  /** Avvio diretto in partita (parametri URL di sviluppo). */
  startDirect(overrides: Partial<SessionOptions>): void {
    this.startMatch(overrides);
  }

  frame(realNow: number): void {
    const inputs = this.input.drain();
    this.updateTouchUi(realNow);
    if (this.session) {
      this.session.frame(realNow, this.mode === 'match' ? inputs : []);
      return;
    }
    // Menu: la demo gira sullo sfondo; i tasti dei gatti non contano.
    if (!this.demo) this.demo = this.createDemo(realNow);
    this.demo.frame(realNow, []);
    if (this.demo.finished) {
      this.demoFinishedAt ??= realNow;
      if (realNow - this.demoFinishedAt > DEMO_RESTART_MS) {
        this.demo.restart(realNow);
        this.demoFinishedAt = null;
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

  private afterMenuChange(): void {
    this.view.render();
  }

  // ---------------------------------------------------------------- partita

  private startMatch(overrides: Partial<SessionOptions> = {}): void {
    this.demo?.dispose();
    this.demo = null;
    this.closeMenus();
    const s = this.settings;
    this.session = new MatchSession(
      this.sessionDeps(this.deps.audio),
      {
        players: this.touchMode ? limitHumans(s.players, MAX_TOUCH_HUMANS) : s.players,
        difficulty: s.difficulty,
        roundCount: s.roundCount,
        keys: s.keys,
        trickyReferee: s.trickyReferee,
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

  private createDemo(realNow: number): MatchSession {
    return new MatchSession(
      this.sessionDeps(silentAudio),
      {
        players: this.deps.slots.map(() => 'cpu'),
        difficulty: 'normale',
        roundCount: 5,
        keys: this.settings.keys,
        trickyReferee: false,
        screenEffects: false,
        showHud: false,
      },
      realNow,
    );
  }

  private sessionDeps(audio: AudioOut): SessionDeps {
    const { container, slots, scene, pixel } = this.deps;
    return { container, slots, scene, pixel, audio };
  }

  // ---------------------------------------------------------------- schermate

  private showTitle(): void {
    this.logo.hidden = false;
    this.openMenu(
      new MenuModel('', [
        { kind: 'action', label: 'Gioca', onSelect: () => this.showSetup(), accent: true },
        { kind: 'action', label: 'Regole', onSelect: () => this.showRules() },
        { kind: 'action', label: 'Comandi', onSelect: () => this.showControls() },
        { kind: 'action', label: 'Opzioni', onSelect: () => this.showOptions() },
      ]),
      '',
      'menu-title',
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
      {
        kind: 'choice',
        label: 'Round',
        options: ROUND_OPTIONS.map(String),
        get: () => ROUND_OPTIONS.indexOf(this.settings.roundCount as 3 | 5 | 7),
        set: (v) => this.update({ roundCount: ROUND_OPTIONS[v] }),
      },
      { kind: 'action', label: 'Inizia!', onSelect: () => this.startMatch(), accent: true },
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
        TOUCH_CONTROLS_HTML,
      );
      return;
    }
    const items: MenuItem[] = [];
    this.deps.slots.forEach((slot, i) => {
      (['dash', 'fake'] as KeyAction[]).forEach((action) =>
        items.push({
          kind: 'key',
          label: `${slot.name} · ${action === 'dash' ? 'scatto' : 'finta'}`,
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
      '<p class="menu-text">INVIO su un tasto e premi quello nuovo. Se è già usato, i due si scambiano.</p>',
      'menu-wide',
    );
  }

  private showKeyTest(): void {
    this.view.hide();
    this.menu = null;
    this.mode = 'keytest';
    this.backButton.arm();
    if (this.touchMode) this.buttonTest.show();
    else this.keyTest.show(this.settings.keys);
  }

  private showOptions(): void {
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
      {
        kind: 'choice',
        label: 'Arbitro',
        options: ['normale', 'furbo'],
        get: () => (this.settings.trickyReferee ? 1 : 0),
        set: (v) => this.update({ trickyReferee: v === 1 }),
      },
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
        kind: 'info',
        label: 'Arbitro furbo: alle finte del coperchio la musica fa un singhiozzo.',
      },
      {
        kind: 'info',
        label: 'Pulsanti touch "auto": compaiono al primo tocco sullo schermo.',
      },
      { kind: 'action', label: 'Indietro', onSelect: () => this.showTitle() },
    ];
    this.openMenu(new MenuModel('Opzioni', items, () => this.showTitle()));
  }

  private showRules(): void {
    this.openMenu(
      new MenuModel(
        'Regole',
        [{ kind: 'action', label: 'Indietro', onSelect: () => this.showTitle() }],
        () => this.showTitle(),
      ),
      () => RULES_HTML + (this.touchMode ? RULES_TOUCH_HTML : ''),
      'menu-wide',
    );
  }

  // ---------------------------------------------------------------- supporto

  private openMenu(model: MenuModel, extra: string | (() => string) = '', variant = ''): void {
    this.keyTest.hide();
    this.buttonTest.hide();
    if (variant !== 'menu-title') this.backButton.arm();
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
        if (e.pointerType === 'touch' && !this.sawTouch) {
          this.sawTouch = true;
          this.updateTouchMode();
        }
      },
      { capture: true },
    );
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

  /** Ricalcola la modalità touch (preferenza, primo tocco, tipo di puntatore). */
  private updateTouchMode(): void {
    const on = resolveTouchMode(this.settings.touch, this.sawTouch, this.coarse?.matches ?? false);
    if (on === this.touchMode) return;
    this.touchMode = on;
    document.body.classList.toggle('touch-mode', on);
    if (on) {
      const players = limitHumans(this.settings.players, MAX_TOUCH_HUMANS);
      if (players.some((p, i) => p !== this.settings.players[i])) this.update({ players });
    }
    this.view.render();
  }

  /** Mostra/nasconde pulsanti e pausa touch secondo la schermata; stati per frame. */
  private updateTouchUi(realNow: number): void {
    const session = this.session;
    const playing =
      this.touchMode && this.mode === 'match' && session !== null && !session.finished;
    const testing = this.mode === 'keytest' && this.buttonTest.visible;
    const humans = testing ? [0, 1] : playing ? touchHumans(session.options.players) : [];
    const w = this.deps.container.clientWidth;
    const h = this.deps.container.clientHeight;
    const key = `${playing}|${testing}|${humans.join(',')}|${w}x${h}`;
    if (key !== this.touchUiKey) {
      this.touchUiKey = key;
      if (playing || testing) {
        this.touchButtons.setLayout(touchLayout(w, h, humans, safeInsets()));
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
      const m = session.machine;
      const now = session.now(realNow);
      for (const p of humans) {
        const st = m.players[p];
        this.touchButtons.setEnabled(p, st.active && now >= st.stunnedUntil);
      }
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
    if (humans.length === 1) {
      return `<p class="menu-keys">${tag(humans[0])} SCATTO a destra · FINTA a sinistra</p>`;
    }
    return `<p class="menu-keys">${tag(humans[0])} pulsanti a sinistra · ${tag(humans[1])} a destra</p>
      <p class="menu-text">Al massimo 2 giocatori con i pulsanti touch.</p>`;
  }

  private humanKeysHtml(): string {
    if (this.touchMode) return this.humanTouchHtml();
    const humans = this.deps.slots.flatMap((slot, i) =>
      this.settings.players[i] === 'human'
        ? [
            `<span style="--accent:${slot.badgeColor}">${slot.name} <kbd>${keyLabel(this.settings.keys[i].dash)}</kbd> <kbd>${keyLabel(this.settings.keys[i].fake)}</kbd></span>`,
          ]
        : [],
    );
    return humans.length
      ? `<p class="menu-keys">${humans.join('')}</p>`
      : '<p class="menu-text">Solo CPU: guardi la partita.</p>';
  }
}

const TOUCH_CONTROLS_HTML = `
<p class="menu-text">Si gioca con i pulsanti ai lati dello schermo, in orizzontale.
  Da soli: <b>SCATTO</b> sotto il pollice destro, <b>FINTA</b> sotto il sinistro.
  In due: una colonna di pulsanti per lato.</p>
<p class="menu-text">Per cambiare i tasti della tastiera metti <b>Pulsanti touch: no</b> in Opzioni.</p>`;

const RULES_TOUCH_HTML = `
<div class="menu-rules">
  <p><b>Su telefono e tablet.</b> Tieni il dispositivo in orizzontale. Da soli: SCATTO a destra,
    FINTA a sinistra. In due: ognuno ha una colonna di pulsanti sul suo lato.
    Per la pausa tieni premuto il pulsante in alto al centro.</p>
</div>`;

const RULES_HTML = `
<div class="menu-rules">
  <p><b>Lo scopo.</b> I gatti girano attorno alla ciotola. Quando la mano alza il coperchio
    e la musica si ferma, premi <b>SCATTO</b>: il più veloce prende la pappa.</p>
  <p><b>La pappa.</b> Crocchette 1 punto, tonno 2, salmone 3, gamberetto d'oro 5.
    Se due gatti sono più veloci entro 3 centesimi, se la dividono.</p>
  <p><b>Falsa partenza.</b> Se scatti con il coperchio chiuso sbatti contro il coperchio
    e resti stordito per 1,5 secondi.</p>
  <p><b>Le finte.</b> A volte la mano solleva appena il coperchio: è una finta, e la musica
    continua! Con <b>FINTA</b> puoi far finta di scattare per ingannare gli altri.</p>
  <p><b>La cacchetta.</b> Se sotto il coperchio c'è la cacchetta, <b>non scattare</b>:
    chi scatta salta il round dopo (all'ultimo round perde 1 punto).</p>
  <p><b>La partita.</b> Vince chi ha più punti dopo l'ultimo round. In caso di parità
    si va allo spareggio tra i primi.</p>
</div>`;

/** Aree sicure dello schermo (notch, angoli arrotondati) lette dal CSS. */
function safeInsets(): Insets {
  const css = getComputedStyle(document.documentElement);
  const px = (name: string) => Number.parseFloat(css.getPropertyValue(name)) || 0;
  return { top: px('--sat'), right: px('--sar'), bottom: px('--sab'), left: px('--sal') };
}
