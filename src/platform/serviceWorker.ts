/**
 * Codice del service worker, generato a ogni build con l'elenco dei file
 * (vedi `vite.config.ts`). Serve a giocare offline dopo la prima visita.
 *
 * - Pagina, codice, stili e font della build vengono scaricati subito in cache.
 * - Gli altri file (icone, manifest) finiscono in cache la prima volta che servono.
 * - I file con hash si servono dalla cache; la pagina si chiede prima alla rete
 *   (così gli aggiornamenti arrivano subito) e, senza rete, si usa quella in cache.
 * - A ogni build cambia il nome della cache: quella vecchia viene cancellata.
 * - Le pagine sono le voci dell'elenco che finiscono con `/` (hub e giochi).
 */
export function serviceWorkerSource(files: readonly string[], cacheId: string): string {
  const unique = [...new Set(files)].sort();
  const list = JSON.stringify(unique, null, 2);
  // Dalla più lunga: `./pappa/` va riconosciuta prima di `./`.
  const pages = JSON.stringify(
    unique.filter((f) => f.endsWith('/')).sort((a, b) => b.length - a.length),
  );
  return `// Generato da vite.config.ts: non modificare a mano.
const CACHE = ${JSON.stringify(`priamo-${cacheId}`)};
const FILES = ${list};
const PAGES = ${pages}.map((p) => new URL(p, self.location.href).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
              .filter((k) => (k.startsWith('priamo-') || k.startsWith('pappa-')) && k !== CACHE)
              .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Dalla rete, salvando una copia in cache per quando si è offline. */
function fromNetwork(req, key) {
  return fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(key, copy));
    }
    return res;
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Una copia per pagina (hub, /pappa/…): qualunque parametro (?debug, ?cpu=…) usa la stessa.
    const path = url.origin + url.pathname + '/';
    const page = PAGES.find((p) => path.startsWith(p)) || new URL('./', self.location.href).href;
    event.respondWith(
      fromNetwork(req, page).catch(() =>
        caches.match(page, { ignoreVary: true }).then((r) => r || Response.error()),
      ),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((cached) => cached || fromNetwork(req, req)),
  );
});
`;
}

/**
 * Percorsi da scaricare subito, relativi alla cartella del gioco ("./...").
 * `pages`: le pagine HTML della build (hub e giochi), che si salvano col loro
 * indirizzo ("./", "./pappa/") e non col nome del file.
 */
export function precacheList(
  bundleFiles: readonly string[],
  pages: readonly string[] = ['index.html'],
): string[] {
  const rel = (f: string) => `./${f.replace(/\\/g, '/').replace(/^\.?\//, '')}`;
  return [
    ...new Set(['./', ...pages.map((f) => rel(f.replace(/index\.html$/, '')))]),
    ...bundleFiles
      // .woff: solo per browser vecchi senza woff2 (che non hanno nemmeno i service worker).
      .filter((f) => !/\.(map|woff|html)$/.test(f) && f !== 'sw.js')
      .map(rel),
  ];
}

/** Identificativo della cache: cambia quando cambia un file (i nomi hanno l'hash). */
export function cacheIdFor(files: readonly string[]): string {
  // FNV-1a a 32 bit: basta per distinguere una build dall'altra.
  let h = 0x811c9dc5;
  for (const ch of [...files].sort().join('\n')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
