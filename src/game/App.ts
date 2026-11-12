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
import type { Keyboard } from '../input/Keyboard';
import type { PixelRenderer } from '../render/PixelRenderer';
import type { MatchScene } from '../scenes/MatchScene';
import { KeyTest } from '../ui/KeyTest';
import { MenuModel, type MenuItem, type MenuKey } from '../ui/MenuModel';
import { MenuView } from '../ui/MenuView';
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

  constructor(private readonly deps: AppDeps) {
    this.settings = deps.settings;
    this.view = new MenuView(deps.container, () => this.afterMenuChange());
    this.keyTest = new KeyTest(deps.container, deps.slots);
    this.logo = document.createElement('div');
    this.logo.className = 'title-logo';
    this.logo.innerHTML = '<h1>Pappa Reaction</h1><p>Priamo Stadium</p>';
    deps.container.appendChild(this.logo);

    this.applyAudioSettings();
    deps.keyboard.setBindings(this.settings.keys);
    deps.audio.onChange(() => this.refreshAudio());
    window.addEventListener('keydown', (e) => this.onKey(e));

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
    const inputs = this.deps.keyboard.drain();
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
        players: s.players,
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
    this.deps.keyboard.clear();
    this.mode = 'match';
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
    this.deps.keyboard.clear(); // niente scatti "rimasti in coda" dalla pausa
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
        set: (v) =>
          this.update({
            players: this.settings.players.map((p, k) =>
              k === i ? (v === 0 ? 'human' : 'cpu') : p,
            ),
          }),
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
    this.mode = 'menu';
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
    this.keyTest.show(this.settings.keys);
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
        kind: 'info',
        label: 'Arbitro furbo: alle finte del coperchio la musica fa un singhiozzo.',
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
      RULES_HTML,
      'menu-wide',
    );
  }

  // ---------------------------------------------------------------- supporto

  private openMenu(model: MenuModel, extra: string | (() => string) = '', variant = ''): void {
    this.keyTest.hide();
    if (this.mode !== 'paused' || !this.session) this.mode = 'menu';
    this.logo.hidden = variant !== 'menu-title';
    this.menu = model;
    this.view.show(model, extra, variant);
  }

  private closeMenus(): void {
    this.menu = null;
    this.view.hide();
    this.keyTest.hide();
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

  private humanKeysHtml(): string {
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
