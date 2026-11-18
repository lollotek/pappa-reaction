import type { Controller } from '../../config/settings';
import { Rng } from '../../core/Rng';
import { GameClock } from '../../game/GameClock';
import type { AudioStatus, GameSession, SessionDeps, SessionRequest } from '../../game/GameDef';
import type { FrameInput } from '../../input/InputSource';
import { GraffioCpu } from './ai/GraffioCpu';
import { GraffioMatch, type GraffioEvent, type GraffioPress } from './core/GraffioMatch';
import { GraffioHud } from './GraffioHud';
import type { GraffioScene } from './render/GraffioScene';
import { graffioTuning } from './tuning';

/**
 * Una partita di Graffio Killer: GraffioMatch + CPU + HUD + audio, con
 * orologio che si può mettere in pausa. La scena 3D è condivisa.
 */
export class GraffioSession implements GameSession {
  readonly clock = new GameClock();
  match!: GraffioMatch;
  seed = 0;
  private cpus: GraffioCpu[] = [];
  private readonly hud: GraffioHud | null;

  constructor(
    private readonly deps: SessionDeps,
    private readonly scene: GraffioScene,
    private readonly request: SessionRequest,
    realNow: number,
  ) {
    this.hud = request.showHud
      ? new GraffioHud(
          deps.container,
          deps.slots,
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
    this.match = new GraffioMatch(
      {
        playerCount: this.deps.slots.length,
        rounds: demo ? 5 : this.request.settings.roundCount,
      },
      new Rng(this.seed),
      now,
    );
    const profile = graffioTuning.cpu[this.request.difficulty];
    this.cpus = this.request.players.flatMap((c, p) =>
      c === 'cpu' ? [new GraffioCpu(p, profile, new Rng(this.seed + 7919 * (p + 1)))] : [],
    );
    this.deps.audio.stopMusic();
    this.scene.effects = this.request.screenEffects;
    this.scene.setHumans(this.request.players.map((c) => !demo && c === 'human'));
    this.hud?.reset();
    this.handle(this.match.drainEvents());
  }

  pause(realNow: number): void {
    this.clock.pause(realNow);
  }

  resume(realNow: number): void {
    this.clock.resume(realNow);
  }

  /** I pulsanti touch si spengono per chi ha già dato la zampata. */
  controlsEnabled(player: number): boolean {
    const m = this.match;
    return m.phase !== 'final' && !m.hasCut(player);
  }

  frame(realNow: number, input: FrameInput): void {
    const { pixel } = this.deps;
    const now = this.clock.now(realNow);
    const m = this.match;

    if (!this.clock.paused) {
      // Zampate degli umani, con l'istante esatto della pressione (nel tempo di gioco).
      const presses: GraffioPress[] = input.presses
        .filter((i) => i.action === 'dash' && this.request.players[i.player] === 'human')
        .map((i) => ({ player: i.player, t: Math.min(now, this.clock.toGame(i.t)) }));
      for (const cpu of this.cpus) presses.push(...cpu.drain(m, now));
      m.advanceTo(now, presses);
      this.handle(m.drainEvents());
    }

    this.scene.update(now, m);
    pixel.render(this.scene.scene, this.scene.camera);
    this.hud?.update(now, m, this.scene, pixel.layout);
  }

  private handle(events: readonly GraffioEvent[]): void {
    for (const e of events) {
      this.scene.onEvent(e);
      this.hud?.onEvent(e, this.match);
      this.sound(e);
    }
  }

  /** Regia sonora. */
  private sound(e: GraffioEvent): void {
    const out = this.deps.audio;
    switch (e.type) {
      case 'phase':
        if (e.phase === 'show') out.sfx('roundStart');
        else if (e.phase === 'lift') out.sfx('lidOpen');
        else if (e.phase === 'drop') out.sfx('go');
        else if (e.phase === 'final') {
          out.sfx('fanfare');
          for (const w of this.match.winners) out.meow(w, 'happy');
        }
        break;
      case 'cut': {
        const r = e.result;
        out.sfx('swing', r.player);
        if (r.whiff !== null) {
          out.sfx('bonk');
          out.meow(r.player, 'sad');
        } else if (r.points >= 7) {
          out.sfx('smash', r.player);
          out.sfx('jingle');
          out.meow(r.player, 'happy');
        } else if (r.points > 0) {
          out.sfx('hit', r.player);
        } else {
          out.sfx('wall');
          out.meow(r.player, 'annoyed');
        }
        break;
      }
    }
  }

  resumeMusicIfNeeded(): void {
    // Niente musica durante i round: il silenzio fa sentire il tempismo.
  }

  setAudioStatus(status: AudioStatus): void {
    this.hud?.setAudioStatus(status);
  }

  dispose(): void {
    this.deps.audio.stopMusic();
    this.hud?.dispose();
  }
}
