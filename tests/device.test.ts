import { describe, expect, it } from 'vitest';
import { playerSlots } from '../src/config/controls';
import { defaultSettings, loadSettings, type KeyValueStore } from '../src/config/settings';
import { lockTypeFor, shouldSuggestInstall } from '../src/platform/Device';
import { cacheIdFor, precacheList, serviceWorkerSource } from '../src/platform/serviceWorker';

describe('dispositivo', () => {
  it("blocca l'orizzontale attuale, non uno generico", () => {
    expect(lockTypeFor('landscape-primary')).toBe('landscape-primary');
    expect(lockTypeFor('landscape-secondary')).toBe('landscape-secondary');
    expect(lockTypeFor('portrait-primary')).toBe('landscape');
    expect(lockTypeFor(undefined)).toBe('landscape');
  });

  it('suggerisce "Aggiungi a Home" solo col touch, senza schermo intero e non installato', () => {
    expect(shouldSuggestInstall({ touch: true, fullscreenApi: false, standalone: false })).toBe(
      true,
    );
    expect(shouldSuggestInstall({ touch: true, fullscreenApi: true, standalone: false })).toBe(
      false,
    );
    expect(shouldSuggestInstall({ touch: true, fullscreenApi: false, standalone: true })).toBe(
      false,
    );
    expect(shouldSuggestInstall({ touch: false, fullscreenApi: false, standalone: false })).toBe(
      false,
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
