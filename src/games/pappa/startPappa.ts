import { AudioEngine } from '../../audio/AudioEngine';
import { playerSlots } from '../../config/controls';
import { parseMatchSetup } from '../../config/matchSetup';
import { loadSettings, type KeyValueStore } from '../../config/settings';
import { App } from '../../game/App';
import { Keyboard } from '../../input/Keyboard';
import type { PixelRenderer } from '../../render/PixelRenderer';
import { ARENA_MAPS, type ArenaMap } from '../../render/Arena';
import { MatchScene } from '../../scenes/MatchScene';

export interface PappaBoot {
  root: HTMLElement;
  pixel: PixelRenderer;
  params: URLSearchParams;
  store: KeyValueStore | null;
  /** Indirizzo dell'hub, per "Torna all'hub". */
  hubUrl: string;
  /** Overlay di debug: null se non richiesto (`?debug`). */
  debug: { el: HTMLElement; visible: () => boolean } | null;
}

/** Pappa Reaction: titolo con demo, menu, partite. */
export function startPappa({ root, pixel, params, store, hubUrl, debug }: PappaBoot): void {
  const settings = loadSettings(store, playerSlots);
  // Mappa a caso a ogni partita; `?mappa=balcone` (salotto, giardino) la forza per i test.
  const mapParam = params.get('mappa');
  const map = ARENA_MAPS.find((id): id is ArenaMap => id === mapParam);
  const scene = new MatchScene(playerSlots, map);
  pixel.attachCamera(scene.camera);
  const audio = new AudioEngine();
  const keyboard = new Keyboard(settings.keys);
  const app = new App({
    container: root,
    slots: playerSlots,
    scene,
    pixel,
    audio,
    keyboard,
    store,
    settings,
    hubUrl,
  });

  // Parametri di sviluppo (?cpu=2,3,4&diff=normale&seed=123): si salta il menu.
  if (params.has('cpu') || params.has('diff') || params.has('seed')) {
    const setup = parseMatchSetup(`?${params.toString()}`, playerSlots.length);
    app.startDirect({
      players: setup.cpu.map((c) => (c ? 'cpu' : 'human')),
      difficulty: setup.difficulty,
      seed: setup.seed,
    });
  } else {
    app.start();
  }

  // Solo in sviluppo: accesso da console per test e debug.
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __pappa: {
        app,
        audio,
        renderer: pixel.renderer,
        get machine() {
          return app.currentSession?.machine;
        },
      },
    });
  }

  let fpsFrames = 0;
  let fpsSince = performance.now();
  let fps = 0;
  const frame = (now: number) => {
    app.frame(now);

    fpsFrames++;
    if (now - fpsSince >= 500) {
      fps = Math.round((fpsFrames * 1000) / (now - fpsSince));
      fpsFrames = 0;
      fpsSince = now;
    }
    const session = app.currentSession;
    if (debug?.visible() && session) {
      const m = session.machine;
      const l = pixel.layout;
      const left = Math.max(0, m.phaseEndsAt() - session.clock.now(now));
      debug.el.textContent =
        `${fps} fps · ${l.width}×${l.height} ×${l.scale} · seed ${session.seed}\n` +
        `round ${m.round}${m.suddenDeath ? ' (spareggio)' : ''} · ${m.phase} · ` +
        `${Number.isFinite(left) ? (left / 1000).toFixed(2) + 's' : '…'} · ${m.content.id}` +
        (session.paused ? ' · PAUSA' : '');
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
