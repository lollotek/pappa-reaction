import type { AudioOut } from '../../audio/AudioEngine';
import type { Controller } from '../../config/settings';
import { Rng } from '../../core/Rng';
import { GameClock } from '../../game/GameClock';
import type { AudioStatus, GameSession, SessionDeps, SessionRequest } from '../../game/GameDef';
import type { FrameInput } from '../../input/InputSource';
import { ScacciaCpu } from './ai/ScacciaCpu';
import {
  IDLE_CONTROL,
  ScacciaMatch,
  assignSides,
  paddleRange,
  type PaddleControl,
  type ScacciaEvent,
  type Side,
  type SmashPress,
} from './core/ScacciaMatch';
import type { ScacciaScene } from './render/ScacciaScene';
import { ScacciaHud } from './ScacciaHud';
import { scacciaTuning } from './tuning';

/** Musica: andatura normale, ultimi 30 secondi a tempo, spareggio. */
const TEMPO = 126;
const TEMPO_HURRY = 150;
const TEMPO_SUDDEN = 168;
const HURRY_MS = 30_000;

/**
 * Una partita di Scaccia la palla: ScacciaMatch + CPU + HUD + audio, con
 * orologio che si può mettere in pausa. La scena 3D è condivisa.
 */
export class ScacciaSession implements GameSession {
  readonly clock = new GameClock();
  match!: ScacciaMatch;
  seed = 0;
  readonly sides: Side[];
  private cpus: ScacciaCpu[] = [];
  private readonly hud: ScacciaHud | null;
  private tempo = 0;

  constructor(
    private readonly deps: SessionDeps,
    private readonly scene: ScacciaScene,
    private readonly request: SessionRequest,
    realNow: number,
  ) {
    this.sides = assignSides(request.players);
    this.hud = request.showHud
      ? new ScacciaHud(
          deps.container,
          deps.slots,
          this.sides,
          request.players.map((c) => (c === 'cpu' ? `CPU ${request.difficulty}` : null)),
          request.settings.keys,
        )
      : null;
    this.restart(realNow, request.seed);
  }

  get players(): readonly Controller[] {
    return this.request.players;
  }

  get finished(): boolean {
    return this.match.phase === 'final';
  }

  get paused(): boolean {
    return this.clock.paused;
  }

  restart(realNow: number, seed?: number): void {
    this.seed = (seed ?? Math.random() * 2 ** 32) >>> 0;
    const now = this.clock.now(realNow);
    const demo = !this.request.showHud;
    const s = this.request.settings;
    this.match = new ScacciaMatch(
      {
        playerCount: this.deps.slots.length,
        sides: this.sides,
        target: demo ? 5 : s.targetScore,
        timeLimitMs: !demo && s.timeLimit ? scacciaTuning.match.timeLimit * 1000 : null,
      },
      new Rng(this.seed),
      now,
    );
    const profile = scacciaTuning.cpu[this.request.difficulty];
    this.cpus = this.request.players.flatMap((c, p) =>
      c === 'cpu' ? [new ScacciaCpu(p, profile, new Rng(this.seed + 7919 * (p + 1)))] : [],
    );
    this.deps.audio.stopMusic();
    this.tempo = 0;
    this.scene.effects = this.request.screenEffects;
    this.scene.setSides(
      this.sides,
      this.request.players.map((c) => !demo && c === 'human'),
    );
    this.hud?.reset();
    this.handle(this.match.drainEvents());
  }

  pause(realNow: number): void {
    this.clock.pause(realNow);
  }

  resume(realNow: number): void {
    this.clock.resume(realNow);
  }

  controlsEnabled(): boolean {
    return this.match.phase !== 'final';
  }

  frame(realNow: number, input: FrameInput): void {
    const { pixel } = this.deps;
    const now = this.clock.now(realNow);
    const m = this.match;

    if (!this.clock.paused) {
      // Smash dei gatti umani (lo scatto dei tasti), nel tempo di gioco.
      const smashes: SmashPress[] = input.presses
        .filter((i) => i.action === 'dash' && this.request.players[i.player] === 'human')
        .map((i) => ({ player: i.player, t: this.clock.toGame(i.t) }));
      const cpuControls = new Map<number, PaddleControl>();
      for (const cpu of this.cpus) {
        cpuControls.set(cpu.player, cpu.control(m.time, m));
        smashes.push(...cpu.drainSmashes());
      }
      const controls = (p: number): PaddleControl =>
        cpuControls.get(p) ?? this.humanControl(p, input);
      m.advanceTo(now, controls, smashes);
      this.handle(m.drainEvents());
      this.updateTempo(now);
    }

    this.scene.update(now, m);
    pixel.render(this.scene.scene, this.scene.camera);
    this.hud?.update(now, m, this.scene, pixel.layout);
  }

  /**
   * Comandi di un umano. In basso e in alto: sinistra/destra. Ai lati il
   * cuscino va su e giù: "sinistra" sale, "destra" scende (anche ↑/↓ e la
   * levetta in verticale). La striscia touch dà direttamente la posizione.
   */
  private humanControl(p: number, input: FrameInput): PaddleControl {
    const side = this.sides[p];
    const strip = input.strips[p];
    if (strip !== null && strip !== undefined) {
      const range = paddleRange(this.match.t);
      return { axis: 0, target: (strip * 2 - 1) * range };
    }
    const a = input.axes[p];
    if (!a) return IDLE_CONTROL;
    const vertical = side === 1 || side === 3;
    const axis = vertical ? Math.max(-1, Math.min(1, a.y + a.x)) : a.x;
    return { axis, target: null };
  }

  private handle(events: readonly ScacciaEvent[]): void {
    for (const e of events) {
      this.scene.onEvent(e, this.match);
      this.hud?.onEvent(e, this.match);
      this.sound(e);
    }
  }

  /** Regia sonora. */
  private sound(e: ScacciaEvent): void {
    const out = this.deps.audio;
    const kindOf = (id: number) => this.match.balls.find((b) => b.id === id)?.kind;
    switch (e.type) {
      case 'phase':
        if (e.phase === 'intro') {
          out.stopMusic();
          out.sfx('roundStart');
        } else if (e.phase === 'play') {
          out.sfx('go');
          this.setTempo(TEMPO);
        } else if (e.phase === 'final') {
          out.stopMusic();
          this.tempo = 0;
          out.sfx('fanfare');
          if (this.match.winner !== null) out.meow(this.match.winner, 'happy');
        }
        break;
      case 'spawn':
        out.sfx('spawn');
        break;
      case 'swing':
        out.sfx('swing', e.player);
        break;
      case 'hit':
        out.sfx(e.smash ? 'smash' : 'hit', e.player);
        if (kindOf(e.ball) === 'sonaglio') out.sfx('jingle');
        break;
      case 'wall':
        out.sfx('wall');
        if (kindOf(e.ball) === 'sonaglio') out.sfx('jingle');
        break;
      case 'goal':
        out.sfx('goal');
        out.meow(e.conceder, e.scorer === null ? 'sad' : 'annoyed');
        if (e.scorer !== null) out.meow(e.scorer, 'happy');
        break;
      case 'suddenDeath':
        out.sfx('roundStartFinal');
        this.setTempo(TEMPO_SUDDEN);
        break;
      case 'launch':
        break;
    }
  }

  /** Ultimi 30 secondi della partita a tempo: musica più veloce. */
  private updateTempo(now: number): void {
    const left = this.match.timeLeft(now);
    if (
      this.match.phase === 'play' &&
      !this.match.suddenDeath &&
      left !== null &&
      left < HURRY_MS
    ) {
      this.setTempo(TEMPO_HURRY);
    }
  }

  private setTempo(bpm: number): void {
    if (this.tempo === bpm) return;
    this.tempo = bpm;
    this.deps.audio.startMusic(bpm);
  }

  resumeMusicIfNeeded(audio: AudioOut & { musicPlaying: boolean; ready: boolean }): void {
    if (audio.ready && this.match.phase === 'play' && !audio.musicPlaying && this.tempo > 0) {
      audio.startMusic(this.tempo);
    }
  }

  setAudioStatus(status: AudioStatus): void {
    this.hud?.setAudioStatus(status);
  }

  dispose(): void {
    this.deps.audio.stopMusic();
    this.hud?.dispose();
  }
}
