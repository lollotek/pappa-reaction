import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { cacheIdFor, precacheList, serviceWorkerSource } from './src/platform/serviceWorker';

/** Pagine della build: l'hub e una per ogni gioco pronto (sottopercorso con i suoi parametri). */
const PAGES = {
  hub: 'index.html',
  pappa: 'pappa/index.html',
  scaccia: 'scaccia/index.html',
  graffio: 'graffio/index.html',
};

/** Genera dist/sw.js con l'elenco dei file della build (PWA offline, M10). */
function serviceWorker(): Plugin {
  return {
    name: 'priamo-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = precacheList(Object.keys(bundle), Object.values(PAGES));
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource(files, cacheIdFor(files)),
      });
    },
  };
}

export default defineConfig({
  base: './',
  server: { port: 5173 },
  plugins: [serviceWorker()],
  // Three.js da solo supera i 500 kB: atteso.
  build: {
    chunkSizeWarningLimit: 800,
    // Percorsi relativi alla cartella del progetto (root di Vite).
    rollupOptions: { input: PAGES },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
