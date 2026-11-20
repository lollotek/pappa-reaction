import type { AudioOut } from '../../audio/AudioEngine';
import type { Controller } from '../../config/settings';
import { Rng } from '../../core/Rng';
import { GameClock } from '../../game/GameClock';
import type { AudioStatus, GameSession, SessionDeps, SessionRequest } from '../../game/GameDef';
import type { Axis, FrameInput } from '../../input/InputSource';
import { CorsaCpu } from './ai/CorsaCpu';
import { CorsaMatch, NO_DIRECTION, type CorsaEvent, type DropPress } from './core/CorsaMatch';
import { CorsaHud } from './CorsaHud';
import type { CorsaScene } from './render/CorsaScene';
import { corsaTuning } from './tuning';

/** Musica: andatura normale e ultimo giro. */
const TEMPO = 132;
const TEMPO_LAST_LAP = 156;
/** Giri della demo dietro al menu. */
const DEMO_LAPS = 3;

/**
 * Una partita di Corsa pazza: CorsaMatch + CPU + HUD + audio, con orologio che
 * si può mettere in pausa. La scena 3D è condivisa.
 */
export class CorsaSession implements GameSession {
  readonly clock = new GameClock();
  match!: CorsaMatch;
  seed = 0;
  private cpus: CorsaCpu[] = [];
  private readonly hud: CorsaHud | null;
  private tempo = 0;

  constructor(
    private readonly deps: SessionDeps,
    private readonly scene: CorsaScene,
    private readonly request: SessionRequest,
    realNow: number,
  ) {
    this.hud = request.showHud
      ? new CorsaHud(
          deps.container,
          deps.slots,
          request.players.map((c) => (c === 'cpu' ? `CPU ${request.difficulty}` : null)),
          request.settings.keys,
          request.settings.lapCount,
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
    this.match = new CorsaMatch(
      {
        playerCount: this.deps.slots.length,
        laps: demo ? DEMO_LAPS : this.request.settings.lapCount,
      },
      new Rng(this.seed),
      now,
    );
    const profile = corsaTuning.cpu[this.request.difficulty];
    this.cpus = this.request.players.flatMap((c, p) =>
      c === 'cpu'
        ? [new CorsaCpu(p, profile, new Rng(this.seed + 7919 * (p + 1)), corsaTuning)]
        : [],
    );
    this.deps.audio.stopMusic();
    this.tempo = 0;
    this.scene.effects = this.request.screenEffects;
    this.scene.setPlayers(this.request.players.map((c) => !demo && c === 'human'));
    this.hud?.reset();
    this.handle(this.match.drainEvents());
  }

  pause(realNow: number): void {
    this.clock.pause(realNow);
  }

  resume(realNow: number): void {
    this.clock.resume(realNow);
  }

  controlsEnabled(player: number, realNow: number): boolean {
    return this.match.phase !== 'final' && !this.match.stunned(player, this.clock.now(realNow));
  }

  frame(realNow: number, input: FrameInput): void {
    const { pixel } = this.deps;
    const now = this.clock.now(realNow);
    const m = this.match;

    if (!this.clock.paused) {
      // Cacchette dei gatti umani (il tasto principale), nel tempo di gioco.
      const drops: DropPress[] = input.presses
        .filter((i) => i.action === 'dash' && this.request.players[i.player] === 'human')
        .map((i) => ({ player: i.player, t: this.clock.toGame(i.t) }));
      const cpuAxes = new Map<number, Axis>();
      for (const cpu of this.cpus) {
        cpuAxes.set(cpu.player, cpu.control(m, m.time));
        drops.push(...cpu.drainDrops());
      }
      const controls = (p: number): Axis =>
        cpuAxes.get(p) ??
        (this.request.players[p] === 'human' ? (input.axes[p] ?? NO_DIRECTION) : NO_DIRECTION);
      m.advanceTo(now, controls, drops);
      this.handle(m.drainEvents());
    }

    this.scene.update(now, m);
    pixel.render(this.scene.scene, this.scene.camera);
    this.hud?.update(now, m, this.scene, pixel.layout);
  }

  private handle(events: readonly CorsaEvent[]): void {
    for (const e of events) {
      this.scene.onEvent(e, this.match);
      this.hud?.onEvent(e, this.match);
      this.sound(e);
    }
  }

  /** Regia sonora (riusa i suoni degli altri giochi). */
  private sound(e: CorsaEvent): void {
    const out = this.deps.audio;
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
      case 'lap':
        if (e.gained > 0) out.sfx('spawn');
        break;
      case 'lastLap':
        out.sfx('roundStartFinal');
        this.setTempo(TEMPO_LAST_LAP);
        break;
      case 'drop':
        out.sfx('poop');
        break;
      case 'stun':
        out.sfx('phew');
        out.meow(e.player, 'annoyed');
        break;
      case 'bump':
        out.sfx('bonk');
        break;
      case 'finish':
      case 'expire':
        break;
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
