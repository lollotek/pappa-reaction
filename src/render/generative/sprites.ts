import type * as THREE from 'three';
import { hash, makeCanvasTexture, shade, type Painter } from './canvasTexture';

/** Pixel di sprite per unità mondo (per dimensionare i billboard). */
export const SPRITE_PX_PER_UNIT = 16;

export interface Sprite {
  texture: THREE.CanvasTexture;
  /** Dimensione in pixel della texture. */
  width: number;
  height: number;
}

function sprite(width: number, height: number, draw: (p: Painter) => void): Sprite {
  return { texture: makeCanvasTexture(width, height, draw), width, height };
}

const OUTLINE = '#2b1f24';

/** Fiorellino in vaso. */
export function flowerPot(petal: string): Sprite {
  return sprite(16, 24, (p) => {
    p.rect(7, 6, 2, 10, '#3f7d3a');
    p.rect(4, 10, 3, 2, '#5aa04f');
    p.rect(9, 12, 3, 2, '#5aa04f');
    p.rect(5, 2, 6, 6, petal);
    p.rect(5, 2, 6, 1, shade(petal, 30));
    p.rect(7, 4, 2, 2, '#f7e26b');
    p.rect(3, 16, 10, 2, '#a4522e');
    p.rect(4, 18, 8, 6, '#c8693a');
    p.rect(4, 18, 2, 6, '#e08a55');
  });
}

/** Pianta grande da appartamento in vaso. */
export function bigPlant(): Sprite {
  return sprite(32, 46, (p) => {
    const leaves: [number, number, number, number][] = [
      [9, 14, 7, 5],
      [22, 12, 7, 5],
      [15, 6, 6, 6],
      [7, 24, 6, 4],
      [25, 23, 6, 4],
      [16, 18, 7, 5],
    ];
    // Steli.
    for (const [x, y] of leaves) {
      const steps = 30 - y;
      for (let i = 0; i < steps; i++) {
        p.dot(Math.round(16 + ((x - 16) * i) / steps), 30 - i, '#3d6b35');
      }
    }
    for (const [x, y, rx, ry] of leaves) {
      p.ellipse(x, y, rx + 1, ry + 1, '#244a2a');
      p.ellipse(x, y, rx, ry, '#4f9a4a');
      p.ellipse(x - 1, y - 1, rx - 2, ry - 2, '#67b35a');
      p.rect(x - rx + 2, y, rx * 2 - 4, 1, '#3d7a3a'); // nervatura
    }
    // Vaso di terracotta.
    p.rect(8, 30, 16, 3, '#9b4a2c');
    p.rect(9, 33, 14, 13, '#c2643a');
    p.rect(9, 33, 3, 13, '#da8455');
    p.rect(20, 33, 3, 13, '#a7532f');
  });
}

/** Tiragraffi a due piani con pallina appesa. */
export function catTree(): Sprite {
  return sprite(28, 64, (p) => {
    const sisal = (x: number, y: number, h: number) => {
      for (let i = 0; i < h; i++) p.rect(x, y + i, 6, 1, i % 2 ? '#c9a873' : '#b8955f');
      p.rect(x, y, 1, h, '#8f7045');
    };
    sisal(5, 22, 34);
    sisal(17, 6, 52);
    // Piattaforme e base in moquette.
    const pad = (x: number, y: number, w: number) => {
      p.rect(x, y, w, 4, '#7d8fb3');
      p.rect(x, y, w, 1, '#9fb0d2');
      p.rect(x, y + 3, w, 1, '#5d6d8f');
    };
    pad(13, 2, 14);
    pad(1, 18, 16);
    pad(10, 32, 16);
    p.rect(0, 56, 28, 8, '#6a7ca0');
    p.rect(0, 56, 28, 1, '#9fb0d2');
    // Cordino e pallina.
    p.rect(3, 22, 1, 10, '#e9e2d0');
    p.ellipse(3.5, 34, 2.5, 2.5, '#e2574c');
    p.dot(2, 33, '#ff9a8a');
  });
}

/** Lampada da terra con paralume. */
export function floorLamp(): Sprite {
  return sprite(18, 60, (p) => {
    for (let y = 0; y < 14; y++) {
      const half = 4 + Math.floor(y / 3);
      p.rect(9 - half, y + 2, half * 2, 1, y < 2 ? '#fff1c9' : '#f1d9a0');
    }
    p.rect(2, 15, 14, 1, '#c9a96a');
    p.rect(8, 16, 2, 40, '#3b3a3f');
    p.rect(8, 16, 1, 40, '#5c5b62');
    p.ellipse(9, 58, 6, 2, '#3b3a3f');
  });
}

/** Libreria bassa con libri colorati. */
export function bookshelf(): Sprite {
  const bookColors = ['#b5563f', '#5f8a8b', '#d9a441', '#7d9a6a', '#8a6fa8', '#e6c88a', '#c97b6b'];
  return sprite(44, 56, (p) => {
    p.rect(0, 0, 44, 56, '#6b4a2f');
    p.rect(1, 1, 42, 54, '#83593a');
    for (let shelf = 0; shelf < 3; shelf++) {
      const y0 = 3 + shelf * 17;
      p.rect(3, y0, 38, 14, '#4a321f');
      let x = 4;
      let i = shelf * 5;
      while (x < 39) {
        const w = 2 + Math.floor(hash(i, shelf, 7) * 3);
        const h = 9 + Math.floor(hash(shelf, i, 9) * 5);
        const color = bookColors[i % bookColors.length];
        if (x + w > 40) break;
        p.rect(x, y0 + 14 - h, w, h, color);
        p.rect(x, y0 + 14 - h, 1, h, shade(color, 25));
        p.rect(x, y0 + 16 - h, w, 1, shade(color, -40));
        x += w + (hash(i, 3, 1) < 0.2 ? 1 : 0);
        i++;
      }
      p.rect(2, y0 + 14, 40, 2, '#a0704d');
    }
  });
}

/** Gomitolo di lana con filo libero. */
export function yarnBall(color: string): Sprite {
  return sprite(16, 12, (p) => {
    p.ellipse(6, 6, 5.5, 5.5, shade(color, -45));
    p.ellipse(6, 6, 4.5, 4.5, color);
    for (let i = -3; i <= 3; i += 2) p.rect(6 + i, 2, 1, 8, shade(color, -25));
    p.dot(4, 3, shade(color, 50));
    p.rect(10, 10, 5, 1, color);
    p.rect(14, 9, 1, 1, color);
  });
}

/** Cuscino da pavimento con bottone centrale. */
export function cushion(color: string): Sprite {
  return sprite(26, 14, (p) => {
    p.ellipse(13, 8, 12.5, 6, OUTLINE);
    p.ellipse(13, 8, 11.5, 5, color);
    p.ellipse(11, 6, 7, 2.5, shade(color, 25));
    p.rect(12, 7, 2, 2, shade(color, -50));
  });
}

/** Freccina che indica il gatto di un giocatore umano (punta in basso). */
export function playerArrow(color: string): Sprite {
  // # contorno, o colore del giocatore, h riflesso, - ombra.
  const rows = [
    '..#####..',
    '..#hoo#..',
    '..#hoo#..',
    '..#hoo#..',
    '###hoo###',
    '#hooooo-#',
    '.#hooo-#.',
    '..#ho-#..',
    '...#o#...',
    '....#....',
  ];
  const colors: Record<string, string> = {
    '#': OUTLINE,
    o: color,
    h: shade(color, 60),
    '-': shade(color, -45),
  };
  return sprite(rows[0].length, rows.length, (p) => {
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (colors[ch]) p.dot(x, y, colors[ch]);
      }),
    );
  });
}
