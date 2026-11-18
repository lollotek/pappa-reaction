import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/700.css';
import './style.css';
import { playerSlots } from './config/controls';
import type { KeyValueStore } from './config/settings';
import { tuning } from './config/tuning';
import { PLAYABLE_IDS } from './games/registry';
import { legacyRedirect, parseRoute } from './platform/routes';
import { PixelRenderer } from './render/PixelRenderer';

const container = document.getElementById('app');
if (!container) throw new Error('#app mancante');

const params = new URLSearchParams(location.search);
const route = parseRoute(location.pathname, PLAYABLE_IDS);
const hubUrl = `${location.origin}${route.base}`;

// Vecchi link con i parametri di Pappa sulla pagina principale: si va a /pappa/.
const redirect = legacyRedirect(route, location.search);
if (redirect) location.replace(redirect);
else boot(container);

function boot(root: HTMLElement): void {
  const pixel = new PixelRenderer(root, tuning.render.targetHeight);

  // Overlay di debug (fps, risoluzione, seed, fase): solo con `?debug`, poi F3 lo mostra/nasconde.
  const debugEl = document.getElementById('debug')!;
  const debugAllowed = params.has('debug');
  let showDebug = debugAllowed;
  debugEl.hidden = !showDebug;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3' && debugAllowed) {
      e.preventDefault();
      showDebug = !showDebug;
      debugEl.hidden = !showDebug;
    }
  });
  const debug = debugAllowed ? { el: debugEl, visible: () => showDebug } : null;

  // Vetrina dei gatti (?vetrina): modelli e pose da vicino, per la revisione grafica.
  if (params.has('vetrina')) {
    void import('./scenes/Showroom').then(({ Showroom }) => {
      const showroom = new Showroom(playerSlots, root);
      pixel.attachCamera(showroom.camera);
      const loop = (now: number) => {
        showroom.update(now);
        pixel.render(showroom.scene, showroom.camera);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  } else if (route.game === 'pappa') {
    void import('./games/pappa/startPappa').then(({ startPappa }) =>
      startPappa({ root, pixel, params, store: safeStorage(), hubUrl, debug }),
    );
  } else if (route.game === 'scaccia') {
    void import('./games/scaccia/startScaccia').then(({ startScaccia }) =>
      startScaccia({ root, pixel, params, store: safeStorage(), hubUrl, debug }),
    );
  } else if (route.game === 'graffio') {
    void import('./games/graffio/startGraffio').then(({ startGraffio }) =>
      startGraffio({ root, pixel, params, store: safeStorage(), hubUrl, debug }),
    );
  } else {
    // Le scritte delle schede si disegnano col font del gioco: prima va caricato.
    const font = document.fonts?.load("700 16px 'Fredoka'").catch(() => []);
    void Promise.all([import('./hub/Hub'), font]).then(([{ Hub }]) =>
      new Hub(root, pixel, route.base, debug).start(),
    );
  }
}

// PWA: service worker per giocare offline (solo nella build pubblicata, su https o localhost).
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${route.base}sw.js`).catch(() => {
      /* senza service worker il gioco funziona lo stesso, solo non offline */
    });
  });
}

function safeStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
