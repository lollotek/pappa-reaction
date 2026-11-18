import { AudioEngine } from '../../audio/AudioEngine';
import { playerSlots } from '../../config/controls';
import { parseMatchSetup } from '../../config/matchSetup';
import { loadSettings } from '../../config/settings';
import { App } from '../../game/App';
import { Keyboard } from '../../input/Keyboard';
import type { PappaBoot } from '../pappa/startPappa';
import { ScacciaScene } from './render/ScacciaScene';
import { scacciaGame } from './scacciaGame';

/** Scaccia la palla: titolo con demo, menu, partite. Stessi parametri URL di Pappa. */
export function startScaccia({ root, pixel, params, store, hubUrl, debug }: PappaBoot): void {
  document.body.classList.add('game-scaccia');
  const settings = loadSettings(store, playerSlots);
  const scene = new ScacciaScene(playerSlots);
  pixel.attachCamera(scene.camera);
  const audio = new AudioEngine();
  const keyboard = new Keyboard(settings.keys);
  const app = new App({
    container: root,
    slots: playerSlots,
    game: scacciaGame(scene),
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

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __scaccia: {
        app,
        audio,
        scene,
        get match() {
          return app.currentSession?.match;
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
      const m = session.match;
      const l = pixel.layout;
      debug.el.textContent =
        `${fps} fps · ${l.width}×${l.height} ×${l.scale} · seed ${session.seed}\n` +
        `${m.phase}${m.suddenDeath ? ' (spareggio)' : ''} · palle ${m.balls.length} · ` +
        `punti ${m.scores.join('-')}` +
        (session.paused ? ' · PAUSA' : '');
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
