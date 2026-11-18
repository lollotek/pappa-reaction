import { describe, expect, it } from 'vitest';
import { gamePath, legacyRedirect, parseRoute } from '../src/platform/routes';

const IDS = ['pappa'];

describe('percorsi di hub e giochi', () => {
  it('riconosce l’hub alla radice e in una sottocartella', () => {
    expect(parseRoute('/', IDS)).toEqual({ game: null, base: '/' });
    expect(parseRoute('/index.html', IDS)).toEqual({ game: null, base: '/' });
    expect(parseRoute('/priamo/', IDS)).toEqual({ game: null, base: '/priamo/' });
  });

  it('riconosce la pagina di un gioco, con o senza barra finale', () => {
    expect(parseRoute('/pappa/', IDS)).toEqual({ game: 'pappa', base: '/' });
    expect(parseRoute('/pappa', IDS)).toEqual({ game: 'pappa', base: '/' });
    expect(parseRoute('/pappa/index.html', IDS)).toEqual({ game: 'pappa', base: '/' });
    expect(parseRoute('/priamo/pappa/', IDS)).toEqual({ game: 'pappa', base: '/priamo/' });
  });

  it('non confonde nomi simili', () => {
    expect(parseRoute('/pappagallo/', IDS).game).toBeNull();
  });

  it('costruisce il percorso di un gioco', () => {
    expect(gamePath('/priamo/', 'pappa')).toBe('/priamo/pappa/');
  });

  it('sposta i vecchi link con i parametri di Pappa sulla pagina del gioco', () => {
    const hub = parseRoute('/priamo/', IDS);
    expect(legacyRedirect(hub, '?cpu=2,3&seed=7')).toBe('/priamo/pappa/?cpu=2,3&seed=7');
    expect(legacyRedirect(hub, '?mappa=giardino')).toBe('/priamo/pappa/?mappa=giardino');
    expect(legacyRedirect(hub, '?debug')).toBeNull();
    expect(legacyRedirect(hub, '')).toBeNull();
    expect(legacyRedirect(parseRoute('/pappa/', IDS), '?cpu=2')).toBeNull();
  });
});
