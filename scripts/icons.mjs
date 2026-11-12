// Genera le icone PNG della PWA da public/favicon.svg (testa di gatto in pixel 16×16).
// Uso: `npm run icons` (le icone generate sono già nel repository).
// PNG scritto a mano con zlib di Node: nessuna dipendenza in più.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const svg = readFileSync(join(root, 'public', 'favicon.svg'), 'utf8');
const BACKGROUND = '#2b2236';
const GRID = 16;

/** Poligoni dei <path> (solo comandi M, h, v, H, V, z). */
function parsePaths(text) {
  const shapes = [];
  for (const m of text.matchAll(/<path fill="(#[0-9a-fA-F]{3,6})" d="([^"]+)"/g)) {
    const polys = [];
    let poly = null;
    let x = 0;
    let y = 0;
    for (const [, cmd, a, b] of m[2].matchAll(/([MhvHVz])\s*(-?\d+)?(?:[\s,]+(-?\d+))?/g)) {
      if (cmd === 'M') {
        x = Number(a);
        y = Number(b);
        poly = [[x, y]];
        polys.push(poly);
        continue;
      }
      if (cmd === 'z') continue;
      if (cmd === 'h') x += Number(a);
      if (cmd === 'H') x = Number(a);
      if (cmd === 'v') y += Number(a);
      if (cmd === 'V') y = Number(a);
      poly.push([x, y]);
    }
    shapes.push({ color: m[1], polys });
  }
  return shapes;
}

/** Pari-dispari su tutti i sotto-percorsi (come `fill-rule` di default per questi poligoni). */
function inside(polys, px, py) {
  let c = false;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
    }
  }
  return c;
}

const hex = (h) => {
  const s = h.length === 4 ? [...h.slice(1)].map((c) => c + c).join('') : h.slice(1);
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};

/** Griglia 16×16 di colori (o null = trasparente). */
const shapes = parsePaths(svg);
const grid = Array.from({ length: GRID }, (_, y) =>
  Array.from({ length: GRID }, (_, x) => {
    let color = null;
    for (const s of shapes) if (inside(s.polys, x + 0.5, y + 0.5)) color = s.color;
    return color;
  }),
);

function png(size, catPixels) {
  const scale = Math.floor(catPixels / GRID);
  const offset = Math.floor((size - GRID * scale) / 2);
  const bg = hex(BACKGROUND);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro "none"
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - offset) / scale);
      const gy = Math.floor((y - offset) / scale);
      const c = grid[gy]?.[gx];
      const [r, g, b] = c ? hex(c) : bg;
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit per canale
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });
// Icone normali: gatto grande. "maskable": gatto nel 60% centrale (zona sicura di Android).
const icons = {
  'icon-192.png': [192, 176],
  'icon-512.png': [512, 448],
  'maskable-512.png': [512, 304],
  'apple-touch-icon.png': [180, 160],
};
for (const [name, [size, cat]] of Object.entries(icons)) {
  writeFileSync(join(out, name), png(size, cat));
  console.log(`public/icons/${name} (${size}×${size})`);
}
