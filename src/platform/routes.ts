/**
 * Percorsi: l'hub sta nella cartella del sito (`/…/`), ogni gioco in una
 * sottocartella (`/…/pappa/`). Funziona anche quando il sito non è alla
 * radice del dominio (GitHub Pages, itch.io).
 */
export interface Route {
  /** Gioco della pagina, o null per l'hub. */
  game: string | null;
  /** Percorso dell'hub, sempre con la `/` finale. */
  base: string;
}

export function parseRoute(pathname: string, gameIds: readonly string[]): Route {
  const path = pathname.replace(/index\.html$/, '');
  for (const id of gameIds) {
    const m = path.match(new RegExp(`^(.*/)${id}/?$`));
    if (m) return { game: id, base: m[1] };
  }
  return { game: null, base: path.slice(0, path.lastIndexOf('/') + 1) || '/' };
}

export function gamePath(base: string, id: string): string {
  return `${base}${id}/`;
}

/** Parametri di Pappa Reaction che un tempo si davano alla pagina principale. */
const LEGACY_PAPPA_PARAMS = ['cpu', 'diff', 'seed', 'mappa'];

/**
 * Vecchi link (`/?cpu=2,3&seed=1`, di prima dell'hub): indirizzo della pagina
 * di Pappa con gli stessi parametri, o null se non serve spostarsi.
 */
export function legacyRedirect(route: Route, search: string): string | null {
  if (route.game !== null) return null;
  const params = new URLSearchParams(search);
  if (!LEGACY_PAPPA_PARAMS.some((p) => params.has(p))) return null;
  return gamePath(route.base, 'pappa') + search;
}
