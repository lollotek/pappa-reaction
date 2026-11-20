import type * as THREE from 'three';
import { hash, makeCanvasTexture } from '../../../render/generative/canvasTexture';
import { project, roundBox, type Vec } from '../core/track';
import { corsaTuning as T } from '../tuning';

/** Texel per unità mondo e area coperta dalla texture della pista. */
export const TRACK_PX = 10;
export const TRACK_HALF = { x: 9.2, y: 6.2 };

/** Freccia di marcia dipinta sulla terra: (cx, cy) in unità mondo, `angle` in rad (0 = verso +x). */
const ARROWS: { at: Vec; angle: number }[] = [
  { at: { x: -3.2, y: 3.6 }, angle: 0 },
  { at: { x: 6.6, y: 1.4 }, angle: -Math.PI / 2 },
  { at: { x: 3.2, y: -3.6 }, angle: Math.PI },
  { at: { x: -6.6, y: -1.4 }, angle: Math.PI / 2 },
];

/**
 * Pista di terra battuta: anello tra i due steccati (trasparente fuori), con
 * la corsia centrale più battuta, sassolini, le frecce di marcia e il
 * traguardo a scacchi nel rettilineo in basso.
 */
export function trackTexture(): THREE.CanvasTexture {
  const w = Math.round(2 * TRACK_HALF.x * TRACK_PX);
  const h = Math.round(2 * TRACK_HALF.y * TRACK_PX);
  return makeCanvasTexture(w, h, (p) => {
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const x = -TRACK_HALF.x + (px + 0.5) / TRACK_PX;
        const y = -TRACK_HALF.y + (py + 0.5) / TRACK_PX;
        const outer = roundBox({ x, y }, T.track.outer).d;
        const inner = roundBox({ x, y }, T.track.inner).d;
        // Un filo oltre lo steccato, così non si vede il prato tra terra e legno.
        if (outer > 0.2 || inner < -0.2) continue;
        const n = hash(px, py, 52);
        let color = n < 0.15 ? '#9a7048' : n > 0.9 ? '#c49a6a' : '#ae8256';
        const off = Math.abs(project({ x, y }).off);
        if (off < 0.5) color = n < 0.2 ? '#8a6040' : '#9c7049';
        if (outer > -0.25 || inner < 0.25) color = n < 0.5 ? '#8f6a40' : '#82603a';
        if (hash(px >> 1, py >> 1, 53) < 0.012) color = '#d8cbb2'; // sassolini
        p.dot(px, py, color);
      }
    }

    // Frecce di marcia, verde chiaro sulla terra.
    const arrow = (cx: number, cy: number, angle: number) => {
      const ctx = p.ctx;
      ctx.save();
      ctx.translate((cx + TRACK_HALF.x) * TRACK_PX, (cy + TRACK_HALF.y) * TRACK_PX);
      ctx.rotate(angle);
      ctx.fillStyle = '#7cc243';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(2, -9);
      ctx.lineTo(2, -3.5);
      ctx.lineTo(-14, -3.5);
      ctx.lineTo(-14, 3.5);
      ctx.lineTo(2, 3.5);
      ctx.lineTo(2, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    for (const a of ARROWS) arrow(a.at.x, a.at.y, a.angle);

    // Traguardo a scacchi: una striscia larga come la pista, attraverso il rettilineo in basso.
    const square = 3;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const x = -TRACK_HALF.x + (px + 0.5) / TRACK_PX;
        const y = -TRACK_HALF.y + (py + 0.5) / TRACK_PX;
        if (y < 0 || Math.abs(x) > (square * 1.5) / TRACK_PX) continue;
        if (roundBox({ x, y }, T.track.outer).d > -0.25) continue;
        if (roundBox({ x, y }, T.track.inner).d < 0.25) continue;
        const cx = Math.floor((x * TRACK_PX + square * 1.5) / square);
        const cy = Math.floor((y * TRACK_PX) / square);
        p.dot(px, py, (cx + cy) % 2 === 0 ? '#f4efe4' : '#2b2236');
      }
    }
  });
}
