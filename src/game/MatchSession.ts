import { CpuPlayer } from '../ai/CpuPlayer';
import type { AudioOut } from '../audio/AudioEngine';
import { GameAudio } from '../audio/GameAudio';
import { musicTempo } from '../audio/notes';
import type { PlayerSlot } from '../config/controls';
import type { Controller, KeyPair } from '../config/settings';
import { tuning, type Difficulty } from '../config/tuning';
import { createMatchConfig } from '../core/matchConfig';
import { MatchMachine, type TimedInput } from '../core/MatchMachine';
import { Rng } from '../core/Rng';
import { Hud } from '../render/Hud';
import type { PixelRenderer } from '../render/PixelRenderer';
import type { MatchScene } from '../scenes/MatchScene';
import { GameClock } from './GameClock';
import { MatchDriver } from './MatchDriver';

export interface SessionOptions {
  players: readonly Controller[];
  difficulty: Difficulty;
  roundCount: number;
  keys: readonly KeyPair[];
  trickyReferee: boolean;
  /** Lampi, scosse e zoom (accessibilità: si possono spegnere). */
  screenEffects: boolean;
  seed?: number;
  /** Demo dietro al menu: niente HUD. */
  showHud: boolean;
}

export interface SessionDeps {
  container: HTMLElement;
  slots: readonly PlayerSlot[];
  scene: MatchScene;
  pixel: PixelRenderer;
  audio: AudioOut;
}

/**
 * Una partita: MatchMachine + CPU + HUD + regia sonora, con orologio
 * che si può mettere in pausa. La scena 3D è condivisa tra le sessioni.
 */
export class MatchSession {
  readonly clock = new GameClock();
  machine!: MatchMachine;
  seed = 0;
  private driver!: MatchDriver;
  private readonly hud: Hud | null;
  private readonly gameAudio: GameAudio;

  constructor(
    private readonly deps: SessionDeps,
    readonly options: SessionOptions,
    realNow: number,
  ) {
    this.hud = options.showHud
      ? new Hud(
          deps.container,
          deps.slots,
          options.players.map((c) => (c === 'cpu' ? `CPU ${options.difficulty}` : null)),
          options.keys,
        )
      : null;
    if (this.hud) this.hud.effects = options.screenEffects;
    this.gameAudio = new GameAudio(deps.audio, { hiccupOnFakeLid: options.trickyReferee });
    this.restart(realNow, options.seed);
  }

  /** Nuova partita con gli stessi giocatori (rivincita). */
  restart(realNow: number, seed?: number): void {
    this.seed = (seed ?? Math.random() * 2 ** 32) >>> 0;
    const now = this.clock.now(realNow);
    const config = createMatchConfig(this.deps.slots.length, this.options.roundCount);
    this.machine = new MatchMachine(config, new Rng(this.seed), now);
    // Ogni CPU ha il suo Rng derivato dal seed: la stessa partita si può rigiocare.
    const cpus = this.options.players.flatMap((c, p) =>
      c === 'cpu'
        ? [
            new CpuPlayer(
              p,
              tuning.cpu[this.options.difficulty],
              new Rng(this.seed + 7919 * (p + 1)),
            ),
          ]
        : [],
    );
    this.driver = new MatchDriver(this.machine, cpus);
    this.deps.audio.stopMusic();
    this.deps.scene.reset();
    // Freccina sopra i gatti umani (non nella demo del titolo, che non ha HUD).
    this.deps.scene.setMarkers(
      this.options.players.map((c) => this.options.showHud && c === 'human'),
    );
    this.deps.scene.effects = this.options.screenEffects;
    this.hud?.reset();
  }

  get finished(): boolean {
    return this.machine.phase === 'final';
  }

  get paused(): boolean {
    return this.clock.paused;
  }

  pause(realNow: number): void {
    this.clock.pause(realNow);
  }

  resume(realNow: number): void {
    this.clock.resume(realNow);
  }

  /** Un frame: input → logica → animazioni → rendering. */
  frame(realNow: number, inputs: readonly TimedInput[]): void {
    const { scene, pixel } = this.deps;
    const now = this.clock.now(realNow);

    if (!this.clock.paused) {
      // Timestamp dei tasti convertiti nel tempo di gioco (le pause non contano).
      const timed = inputs.map((i) => ({ ...i, t: this.clock.toGame(i.t) }));
      for (const e of this.driver.step(now, timed)) {
        scene.onEvent(e);
        this.hud?.onEvent(e, this.machine);
        this.gameAudio.onEvent(e, this.machine);
      }
    }

    scene.update(now, this.machine);
    pixel.render(scene.scene, scene.camera);
    this.hud?.update(now, this.machine, scene, pixel.layout);

    // Il primo frame che mostra il coperchio aperto è il t0 delle reazioni.
    if (!this.clock.paused) this.driver.afterRender(now, scene.lidIsOpen);
  }

  /** Audio sbloccato a giro già iniziato: la musica parte subito. */
  resumeMusicIfNeeded(audio: AudioOut & { musicPlaying: boolean; ready: boolean }): void {
    if (audio.ready && this.machine.phase === 'circling' && !audio.musicPlaying) {
      audio.startMusic(musicTempo(this.machine.round, this.machine.suddenDeath));
    }
  }

  setAudioStatus(status: 'locked' | 'on' | 'off'): void {
    this.hud?.setAudioStatus(status);
  }

  dispose(): void {
    this.deps.audio.stopMusic();
    this.hud?.dispose();
  }
}
