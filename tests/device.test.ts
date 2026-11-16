import { describe, expect, it } from 'vitest';
import { playerSlots } from '../src/config/controls';
import { defaultSettings, loadSettings, type KeyValueStore } from '../src/config/settings';
import { installMode, isIosDevice, lockTypeFor } from '../src/platform/Device';
import { describeBrowser, diagnosticsLine } from '../src/platform/diagnostics';
import { cacheIdFor, precacheList, serviceWorkerSource } from '../src/platform/serviceWorker';

describe('dispositivo', () => {
  it("blocca l'orizzontale attuale, non uno generico", () => {
    expect(lockTypeFor('landscape-primary')).toBe('landscape-primary');
    expect(lockTypeFor('landscape-secondary')).toBe('landscape-secondary');
    expect(lockTypeFor('portrait-primary')).toBe('landscape');
    expect(lockTypeFor(undefined)).toBe('landscape');
  });

  it('pulsante Installa: finestra del browser, istruzioni o niente', () => {
    expect(installMode({ canPrompt: true, touch: false, standalone: false })).toBe('prompt');
    expect(installMode({ canPrompt: true, touch: true, standalone: false })).toBe('prompt');
    expect(installMode({ canPrompt: false, touch: true, standalone: false })).toBe('manual');
    expect(installMode({ canPrompt: false, touch: false, standalone: false })).toBeNull();
    expect(installMode({ canPrompt: true, touch: true, standalone: true })).toBeNull();
  });

  it('riconosce iPhone e iPad (anche quello che si presenta come Mac)', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', 5)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe(false);
  });

  it('descrive browser e sistema per la diagnosi', () => {
    expect(
      describeBrowser(
        'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome 131 · Android 14');
    // "Sito desktop" di Chrome: sembra un PC Linux.
    expect(
      describeBrowser(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome 131 · Linux');
    expect(
      describeBrowser(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari 17 · iOS 17');
    expect(
      describeBrowser(
        'Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 Instagram 300.0',
      ),
    ).toBe('Chrome 130 in Instagram · Android 13');
    expect(
      describeBrowser(
        'Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome 130 in WebView · Android 13');
  });

  it('riga di diagnosi completa', () => {
    expect(
      diagnosticsLine({
        ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/131.0.0.0 Mobile Safari/537.36',
        pointer: 'dito',
        maxTouchPoints: 5,
        sawTouch: true,
        touchPref: 'auto',
        touchMode: true,
        fullscreenApi: true,
        standalone: false,
        canPromptInstall: true,
        width: 915,
        height: 412,
      }),
    ).toBe(
      'Chrome 131 · Android 14 · 915×412 · puntatore dito, 5 tocchi · tocco visto sì · touch auto→sì · schermo intero sì · app installabile',
    );
  });

  it('schermo intero: predefinito sì, salvato nelle impostazioni', () => {
    const data = new Map<string, string>();
    const store: KeyValueStore = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    };
    expect(defaultSettings(playerSlots).fullscreen).toBe(true);
    store.setItem('pappa.settings', JSON.stringify({ fullscreen: false }));
    expect(loadSettings(store, playerSlots).fullscreen).toBe(false);
    store.setItem('pappa.settings', JSON.stringify({ fullscreen: 'forse' }));
    expect(loadSettings(store, playerSlots).fullscreen).toBe(true);
  });
});

describe('service worker', () => {
  const bundle = [
    'index.html',
    'assets/index-abc.js',
    'assets/index-abc.js.map',
    'assets/index-def.css',
    'assets/font-latin.woff2',
    'assets/font-latin.woff',
    'sw.js',
  ];

  it('scarica subito pagina, codice, stili e font woff2', () => {
    expect(precacheList(bundle)).toEqual([
      './',
      './assets/index-abc.js',
      './assets/index-def.css',
      './assets/font-latin.woff2',
    ]);
  });

  it('il nome della cache cambia quando cambia un file', () => {
    const a = cacheIdFor(precacheList(bundle));
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(cacheIdFor(precacheList(bundle))).toBe(a);
    expect(cacheIdFor(precacheList(['assets/index-xyz.js']))).not.toBe(a);
  });

  it('il codice generato è JavaScript valido e contiene cache ed elenco', () => {
    const src = serviceWorkerSource(['./', './assets/a.js'], '1234abcd');
    expect(() => new Function(src)).not.toThrow();
    expect(src).toContain('"pappa-1234abcd"');
    expect(src).toContain('"./assets/a.js"');
  });
});
