import * as THREE from 'three';
import { hash, makeCanvasTexture, shade } from '../../../render/generative/canvasTexture';

/** Mescola un colore con un altro (0 = tutto `a`, 1 = tutto `b`). */
export function mix(a: string, b: string, k: number): string {
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const c = (s: number) => Math.round(ch(pa, s) * (1 - k) + ch(pb, s) * k);
  return `#${[16, 8, 0].map((s) => c(s).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Tappeto quadrato intrecciato, diviso in quattro spicchi diagonali nei colori
 * dei gatti (`colors[lato]`: 0 in basso, 1 a destra, 2 in alto, 3 a sinistra),
 * con un cerchio al centro da cui partono le palline. `cornerCut` (0..1 del
 * mezzo lato) è lo smusso degli angoli, coperto dai cuscini.
 */
export function squareRugTexture(
  colors: readonly string[],
  cornerCut: number,
  size = 128,
): THREE.CanvasTexture {
  return makeCanvasTexture(size, size, (p) => {
    const c = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        const ax = Math.abs(dx) / c;
        const ay = Math.abs(dy) / c;
        const side = ax > ay ? (dx > 0 ? 1 : 3) : dy > 0 ? 0 : 2;
        const ring = Math.floor(Math.max(Math.abs(dx), Math.abs(dy)) / 3);
        const r = Math.hypot(dx, dy) / c;
        let color: string;
        if (ax + ay > 2 - cornerCut * 0.98) color = '#6b4a3a';
        else if (Math.max(ax, ay) > 0.955) color = '#6b3a28';
        else if (Math.abs(ax - ay) < 0.025)
          color = '#efe0bd'; // cucitura sulle diagonali
        else if (r < 0.16) color = ring % 2 ? '#efe0bd' : '#e3cfa5';
        else if (r < 0.19) color = '#8a5a3c';
        else {
          const base = mix(colors[side], '#efe0bd', 0.42);
          color = ring % 3 === 0 ? shade(base, -16) : base;
          // Fascia della porta: più scura vicino al bordo.
          if (Math.max(ax, ay) > 0.86) color = shade(mix(colors[side], '#3b2a20', 0.15), -6);
        }
        // Trama a treccia.
        const braid = (x + y + ring) % 4 === 0 || hash(x, y, 11) < 0.05;
        p.dot(x, y, braid ? shade(color, -14) : color);
      }
    }
  });
}

/** Righe del cuscino a salsicciotto: colore del gatto e crema. */
export function bolsterTexture(color: string): THREE.CanvasTexture {
  const tex = makeCanvasTexture(16, 8, (p) => {
    for (let x = 0; x < 16; x++) {
      const stripe = Math.floor(x / 4) % 2 === 0 ? color : '#f4efe4';
      for (let y = 0; y < 8; y++) p.dot(x, y, hash(x, y, 5) < 0.12 ? shade(stripe, -18) : stripe);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
