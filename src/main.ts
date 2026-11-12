import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import './style.css';
import { AudioEngine } from './audio/AudioEngine';
import { playerSlots } from './config/controls';
import { parseMatchSetup } from './config/matchSetup';
import { loadSettings, type KeyValueStore } from './config/settings';
import { tuning } from './config/tuning';
import { App } from './game/App';
import { Keyboard } from './input/Keyboard';
import { PixelRenderer } from './render/PixelRenderer';
import { MatchScene } from './scenes/MatchScene';
import { Showroom } from './scenes/Showroom';

const container = document.getElementById('app');
if (!container) throw new Error('#app mancante');

const pixel = new PixelRenderer(container, tuning.render.targetHeight);
const params = new URLSearchParams(location.search);

// Overlay di debug (fps, risoluzione, seed, fase): solo con `?debug`, poi F3 lo mostra/nasconde.
const debug = document.getElementById('debug')!;
const debugAllowed = params.has('debug');
let showDebug = debugAllowed;
debug.hidden = !showDebug;
window.addEventListener('keydown', (e) => {
  if (e.code === 'F3' && debugAllowed) {
    e.preventDefault();
    showDebug = !showDebug;
    debug.hidden = !showDebug;
  }
});

// Vetrina dei gatti (?vetrina): modelli e pose da vicino, per la revisione grafica.
if (params.has('vetrina')) startShowroom(container);
else startGame(container);

function startShowroom(root: HTMLElement): void {
  const showroom = new Showroom(playerSlots, root);
  pixel.attachCamera(showroom.camera);
  const loop = (now: number) => {
    showroom.update(now);
    pixel.render(showroom.scene, showroom.camera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function startGame(root: HTMLElement): void {
  const store = safeStorage();
  const settings = loadSettings(store, playerSlots);
  const scene = new MatchScene(playerSlots);
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
  });

  // Parametri di sviluppo (?cpu=2,3,4&diff=normale&seed=123): si salta il menu.
  if (params.has('cpu') || params.has('diff') || params.has('seed')) {
    const setup = parseMatchSetup(location.search, playerSlots.length);
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
    if (showDebug && session) {
      const m = session.machine;
      const l = pixel.layout;
      const left = Math.max(0, m.phaseEndsAt() - session.clock.now(now));
      debug.textContent =
        `${fps} fps · ${l.width}×${l.height} ×${l.scale} · seed ${session.seed}\n` +
        `round ${m.round}${m.suddenDeath ? ' (spareggio)' : ''} · ${m.phase} · ` +
        `${Number.isFinite(left) ? (left / 1000).toFixed(2) + 's' : '…'} · ${m.content.id}` +
        (session.paused ? ' · PAUSA' : '');
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function safeStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
