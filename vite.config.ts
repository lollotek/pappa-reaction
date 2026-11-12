import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { cacheIdFor, precacheList, serviceWorkerSource } from './src/platform/serviceWorker';

/** Genera dist/sw.js con l'elenco dei file della build (PWA offline, M10). */
function serviceWorker(): Plugin {
  return {
    name: 'pappa-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = precacheList(Object.keys(bundle));
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
  build: { chunkSizeWarningLimit: 800 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
