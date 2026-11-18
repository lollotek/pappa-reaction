import type * as THREE from 'three';
import type { GameInfo } from '../games/registry';
import { hash, makeCanvasTexture, shade, type Painter } from '../render/generative/canvasTexture';

const W = 96;
const H = 128;

/** Faccia di una scheda dell'hub, in pixel art: titolo, disegno, eventuale fascia. */
export function cardTexture(game: GameInfo): THREE.CanvasTexture {
  return makeCanvasTexture(W, H, (p) => {
    const { bg, dark, ink } = game.colors;
    // Sfondo a bande con puntini.
    for (let y = 0; y < H; y++) p.rect(0, y, W, 1, y < 44 ? dark : bg);
    for (let y = 46; y < H - 4; y += 6) {
      for (let x = (y / 6) % 2 ? 2 : 5; x < W; x += 6) {
        if (hash(x, y, 7) < 0.6) p.dot(x, y, shade(bg, 14));
      }
    }
    // Cornice.
    p.rect(0, 0, W, 2, ink);
    p.rect(0, H - 2, W, 2, ink);
    p.rect(0, 0, 2, H, ink);
    p.rect(W - 2, 0, 2, H, ink);

    if (game.id === 'pappa') drawBowl(p);
    else drawBall(p);

    crispText(p, game.title[0], W / 2, 17, 16, ink);
    crispText(p, game.title[1], W / 2, 34, 14, '#ffffff');

    if (game.status === 'soon') {
      // Velo scuro e fascia "prossimamente".
      for (let y = 44; y < H - 2; y++) {
        for (let x = 2; x < W - 2; x++) if ((x + y) % 2 === 0) p.dot(x, y, 'rgba(0,0,0,0.55)');
      }
      p.rect(2, 74, W - 4, 18, '#1a1522');
      p.rect(2, 74, W - 4, 1, ink);
      p.rect(2, 91, W - 4, 1, ink);
      crispText(p, 'PROSSIMAMENTE', W / 2, 83, 10, ink);
    }
  });
}

/** Ciotola con il coperchio sollevato e una crocchetta. */
function drawBowl(p: Painter): void {
  const cx = W / 2;
  p.ellipse(cx, 112, 30, 5, 'rgba(0,0,0,0.35)');
  // Ciotola.
  p.ellipse(cx, 98, 26, 7, '#7a2f2f');
  for (let y = 98; y < 111; y++) {
    const half = 26 - (y - 98) * 0.6;
    p.rect(cx - half, y, half * 2, 1, y < 101 ? '#d9534f' : '#c0443f');
  }
  p.rect(cx - 18, 108, 36, 2, '#8c2f2b');
  p.ellipse(cx, 98, 22, 5, '#f2c26b');
  for (let k = 0; k < 9; k++) {
    p.ellipse(cx - 16 + k * 4, 97 + (k % 2), 2, 1.5, k % 3 ? '#b8743a' : '#9a5d2c');
  }
  // Coperchio sollevato e inclinato, con il pomello.
  for (let x = -24; x <= 24; x++) {
    const y = 74 - x * 0.18 - Math.sqrt(Math.max(0, 1 - (x / 24) ** 2)) * 7;
    p.rect(cx + x, y, 1, 4, x < -12 ? '#d6dbe3' : '#b9c0cc');
  }
  p.rect(cx - 2, 63, 5, 4, '#8a93a3');
  // Lineette di movimento.
  p.rect(cx - 30, 80, 6, 1, '#ffffff');
  p.rect(cx + 26, 76, 6, 1, '#ffffff');
  p.rect(cx - 28, 86, 4, 1, '#ffffff');
}

/** Palla a spicchi su un prato con le righe del campo. */
function drawBall(p: Painter): void {
  const cx = W / 2;
  for (let y = 60; y < H - 2; y++) p.rect(2, y, W - 4, 1, y % 8 < 4 ? '#5fa045' : '#559a3e');
  p.rect(2, 60, W - 4, 1, '#f4efe4');
  p.ellipse(cx, 98, 22, 9, '#f4efe4');
  p.ellipse(cx, 98, 20, 7.5, '#5a9c42');
  p.ellipse(cx, 112, 15, 4, 'rgba(0,0,0,0.35)');
  // Palla.
  p.ellipse(cx, 92, 15, 15, '#2b2236');
  p.ellipse(cx, 92, 14, 14, '#f4efe4');
  p.ellipse(cx + 1, 92, 5, 5, '#e04848');
  for (const [dx, dy] of [
    [-9, -7],
    [9, -7],
    [-10, 6],
    [10, 6],
    [0, 12],
  ] as const) {
    p.ellipse(cx + dx, 92 + dy, 3, 3, '#e04848');
  }
  p.ellipse(cx - 5, 85, 3, 2, '#ffffff');
}

/**
 * Testo centrato con contorno, senza sfumature: si disegna a parte e si
 * tengono solo i pixel "pieni", così resta netto come il resto della pixel art.
 */
function crispText(
  p: Painter,
  text: string,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const ctx = off.getContext('2d');
  if (!ctx) return;
  ctx.font = `700 ${size}px Fredoka, 'Trebuchet MS', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, cx, cy);
  const mask = ctx.getImageData(0, 0, W, H).data;
  const on = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && mask[(y * W + x) * 4 + 3] > 110;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (on(x, y)) continue;
      if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) || on(x, y - 2)) {
        p.dot(x, y, '#120c18');
      }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) p.dot(x, y, color);
}
