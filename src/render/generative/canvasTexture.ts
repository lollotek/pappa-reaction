import * as THREE from 'three';

/**
 * Texture pixel art disegnate via codice su canvas.
 * Filtri `nearest` e niente mipmap: i pixel restano netti.
 * Densità di riferimento: ~13–16 texel per unità mondo, simile ai pixel a schermo.
 */
export function makeCanvasTexture(
  width: number,
  height: number,
  draw: (p: Painter) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D non disponibile');
  ctx.imageSmoothingEnabled = false;
  draw(new Painter(ctx, width, height));

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Piccolo "pennello" per pixel art: rettangoli, punti, ellissi piene. */
export class Painter {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly w: number,
    readonly h: number,
  ) {}

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  dot(x: number, y: number, color: string): void {
    this.rect(x, y, 1, 1, color);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.dot(x, y, color);
      }
    }
  }
}

/** Rumore deterministico 0..1 per variare i pixel in modo riproducibile. */
export function hash(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Parquet a listoni sfalsati. Da ripetere (RepeatWrapping). */
export function floorTexture(): THREE.CanvasTexture {
  const planks = ['#8a5a3c', '#7e5236', '#946243', '#83563a'];
  const tex = makeCanvasTexture(64, 64, (p) => {
    for (let row = 0; row < 4; row++) {
      const y0 = row * 16;
      const offset = (row % 2) * 24 + row * 7;
      for (let x = 0; x < 64; x++) {
        const plankIndex = Math.floor((x + offset) / 48);
        const base = planks[(row * 3 + plankIndex) % planks.length];
        for (let y = y0; y < y0 + 16; y++) {
          const grain = hash(x >> 2, y, row) < 0.18 ? '#6e4630' : base;
          p.dot(x, y, grain);
        }
        if ((x + offset) % 48 === 0) p.rect(x, y0, 1, 16, '#4e301f');
      }
      p.rect(0, y0, 64, 1, '#4e301f');
      p.rect(0, y0 + 1, 64, 1, '#a0704d');
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Parete del salotto: carta da parati, battiscopa, finestra e quadretti. */
export function wallTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(256, 64, (p) => {
    // Carta da parati a righe con motivo a puntini.
    for (let x = 0; x < 256; x++) p.rect(x, 0, 1, 64, x % 12 < 6 ? '#c9b98f' : '#c2b086');
    for (let y = 4; y < 54; y += 8) {
      for (let x = (y / 8) % 2 ? 3 : 9; x < 256; x += 12) p.dot(x, y, '#ad9a6f');
    }
    // Battiscopa.
    p.rect(0, 54, 256, 10, '#ece3d2');
    p.rect(0, 54, 256, 1, '#fff8ea');
    p.rect(0, 63, 256, 1, '#8f8471');

    // Finestra con cielo e nuvole.
    p.rect(98, 6, 60, 42, '#f4efe4');
    p.rect(102, 10, 52, 34, '#8fc3e6');
    p.rect(102, 10, 52, 8, '#7ab3db');
    p.ellipse(116, 28, 8, 3, '#ffffff');
    p.ellipse(122, 26, 6, 3, '#ffffff');
    p.ellipse(142, 20, 6, 2, '#eef6fb');
    p.rect(127, 10, 2, 34, '#f4efe4');
    p.rect(102, 26, 52, 2, '#f4efe4');
    p.rect(96, 47, 64, 3, '#e3d8c3');
    // Tende.
    p.rect(90, 4, 8, 46, '#b5563f');
    p.rect(158, 4, 8, 46, '#b5563f');
    for (let y = 4; y < 50; y += 3) {
      p.dot(92, y, '#9a4533');
      p.dot(161, y, '#9a4533');
    }

    // Quadretto con pesce.
    p.rect(34, 14, 26, 20, '#6b4a2f');
    p.rect(36, 16, 22, 16, '#e9f0ee');
    p.ellipse(46, 24, 6, 3, '#e98a4f');
    p.rect(52, 22, 3, 5, '#e98a4f');
    p.dot(43, 23, '#222');
    // Quadretto con zampina.
    p.rect(196, 18, 20, 18, '#6b4a2f');
    p.rect(198, 20, 16, 14, '#f3e6e8');
    p.ellipse(206, 29, 3, 3, '#d98f96');
    for (const dx of [-4, -1, 2, 5]) p.ellipse(205.5 + dx, 24, 1.3, 1.6, '#d98f96');
  });
}

/**
 * Tappeto rotondo intrecciato (anelli concentrici).
 * La fascia più chiara è la pista su cui corrono i gatti.
 */
export function rugTexture(size = 128, trackInner = 0.58, trackOuter = 0.78): THREE.CanvasTexture {
  const rings = ['#b4553c', '#d9a441', '#7d9a6a', '#c97b6b', '#e6c88a', '#5f8a8b'];
  return makeCanvasTexture(size, size, (p) => {
    const c = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        const r = Math.hypot(dx, dy) / c;
        if (r > 1) continue;
        const px = r * c;
        const ring = Math.floor(px / 3);
        // Trama a treccia: chiaro/scuro alternato in diagonale lungo l'anello.
        const along = Math.floor(((Math.atan2(dy, dx) + Math.PI) * px) / 2.2);
        const braid = (along + ring) % 3 === 0;

        let color: string;
        if (r > 0.97) color = '#6b3a28';
        else if (r >= trackInner && r <= trackOuter) {
          // Pista: anelli crema/sabbia alternati.
          color = ring % 2 ? '#efe0bd' : '#e3cfa5';
          if (r < trackInner + 0.015 || r > trackOuter - 0.015) color = '#8a5a3c';
        } else if (r < 0.32) color = ring % 2 ? '#c99a5c' : '#bb8a4e';
        else color = rings[ring % rings.length];

        p.dot(x, y, braid ? shade(color, -18) : color);
      }
    }
  });
}

/** Doghe di legno per il coperchio. */
export function woodTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(32, 16, (p) => {
    const staves = ['#b07a45', '#a06c3b', '#bb854e', '#9a6537'];
    for (let x = 0; x < 32; x++) {
      const base = staves[Math.floor(x / 4) % staves.length];
      for (let y = 0; y < 16; y++) p.dot(x, y, hash(x, y >> 1, 3) < 0.15 ? shade(base, -20) : base);
      if (x % 4 === 0) p.rect(x, 0, 1, 16, '#6e4428');
    }
  });
}

/** Schiarisce/scurisce un colore esadecimale di `amount` (−255..255). */
export function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, v + amount));
  const r = ch(n >> 16);
  const g = ch((n >> 8) & 0xff);
  const b = ch(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Piastrelle quadrate color mattone (cotto) con fughe chiare. Da ripetere. */
export function tileTexture(): THREE.CanvasTexture {
  const tiles = ['#b4583a', '#a9512f', '#bd6141', '#ad5536'];
  const tex = makeCanvasTexture(64, 64, (p) => {
    for (let ty = 0; ty < 4; ty++) {
      for (let tx = 0; tx < 4; tx++) {
        const base = tiles[(tx * 3 + ty * 5) % tiles.length];
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) {
            const n = hash(tx * 16 + x, ty * 16 + y, 11);
            const c = n < 0.12 ? shade(base, -16) : n > 0.94 ? shade(base, 14) : base;
            p.dot(tx * 16 + x, ty * 16 + y, c);
          }
        }
        // Fuga di malta e bordino in luce.
        p.rect(tx * 16, ty * 16, 16, 1, '#d8c3a5');
        p.rect(tx * 16, ty * 16, 1, 16, '#d8c3a5');
        p.rect(tx * 16 + 1, ty * 16 + 1, 14, 1, shade(base, 18));
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Facciata di casa vista dal balcone: intonaco, portafinestra con persiane, vasi alla finestra. */
export function balconyWallTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(256, 64, (p) => {
    // Intonaco caldo con macchioline.
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 256; x++) {
        p.dot(x, y, hash(x >> 1, y >> 1, 5) < 0.08 ? '#e2b77e' : '#ecc48c');
      }
    }
    // Zoccolo in pietra.
    p.rect(0, 56, 256, 8, '#cdb898');
    p.rect(0, 56, 256, 1, '#efe2c8');
    p.rect(0, 63, 256, 1, '#8f7e66');

    // Portafinestra centrale con vetri e tenda.
    p.rect(104, 6, 48, 50, '#f4efe4');
    p.rect(108, 10, 40, 46, '#5d7f99');
    p.rect(108, 10, 40, 6, '#4b6c86');
    p.rect(127, 10, 2, 46, '#f4efe4');
    for (const y of [24, 38]) p.rect(108, y, 40, 2, '#f4efe4');
    p.rect(110, 18, 3, 6, '#9cc0d9'); // riflesso
    p.rect(131, 32, 3, 5, '#9cc0d9');
    // Persiane verdi aperte.
    for (const x0 of [88, 152]) {
      p.rect(x0, 6, 16, 50, '#3f7a52');
      for (let y = 8; y < 54; y += 3) p.rect(x0 + 2, y, 12, 1, '#2f5e3e');
      p.rect(x0, 6, 16, 1, '#5b9a6c');
    }

    // Finestrelle laterali con davanzale fiorito.
    for (const x0 of [22, 206]) {
      p.rect(x0, 10, 28, 24, '#f4efe4');
      p.rect(x0 + 3, 13, 22, 18, '#5d7f99');
      p.rect(x0 + 13, 13, 2, 18, '#f4efe4');
      p.rect(x0 - 2, 34, 32, 3, '#e3d8c3');
      p.rect(x0, 37, 28, 5, '#b05a36');
      for (let k = 0; k < 6; k++) {
        const fx = x0 + 2 + k * 4.5;
        p.rect(fx, 32, 3, 3, k % 2 ? '#e2574c' : '#f08aa8');
        p.dot(fx + 1, 35, '#3f7d3a');
      }
    }
  });
}

/** Acqua della piscinetta: azzurro con increspature chiare. */
export function waterTexture(size = 128): THREE.CanvasTexture {
  return makeCanvasTexture(size, size, (p) => {
    const c = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const r = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
        if (r > 1) continue;
        let color = r > 0.9 ? '#3fa6cf' : '#56bde3';
        if (hash(x >> 2, y, 21) < 0.06) color = '#a9e4f5';
        else if (hash(x >> 3, y >> 1, 22) < 0.05) color = '#7fd0ec';
        p.dot(x, y, color);
      }
    }
  });
}

/** Prato: verde a ciuffi con qualche fiorellino. Da ripetere. */
export function grassTexture(): THREE.CanvasTexture {
  const greens = ['#5f9e45', '#6aa94c', '#578f3f'];
  const tex = makeCanvasTexture(64, 64, (p) => {
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const n = hash(x >> 1, y >> 1, 31);
        p.dot(x, y, greens[Math.floor(n * greens.length)]);
      }
    }
    // Fili d'erba: trattini verticali chiari e scuri.
    for (let k = 0; k < 90; k++) {
      const x = Math.floor(hash(k, 1, 32) * 64);
      const y = Math.floor(hash(k, 2, 32) * 62);
      p.rect(x, y, 1, 2, k % 2 ? '#86c25e' : '#447a33');
    }
    // Fiorellini.
    for (let k = 0; k < 5; k++) {
      const x = Math.floor(hash(k, 3, 33) * 62);
      const y = Math.floor(hash(k, 4, 33) * 62);
      p.rect(x, y, 2, 2, k % 2 ? '#f4efe4' : '#f2d04a');
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Fondale del giardino: cielo, chiome d'albero, siepe e steccato di legno. */
export function gardenBackTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(256, 64, (p) => {
    for (let y = 0; y < 64; y++) p.rect(0, y, 256, 1, y < 14 ? '#8cc6ea' : '#a3d3ef');
    p.ellipse(40, 8, 10, 3, '#ffffff');
    p.ellipse(48, 6, 7, 3, '#ffffff');
    p.ellipse(196, 10, 9, 3, '#eef6fb');
    // Chiome lontane.
    for (const [cx, r] of [
      [18, 14],
      [70, 17],
      [120, 13],
      [168, 18],
      [226, 15],
    ] as const) {
      p.ellipse(cx, 34, r + 1, r * 0.8 + 1, '#2f5e2f');
      p.ellipse(cx, 34, r, r * 0.8, '#3f7a3a');
      p.ellipse(cx - 3, 30, r * 0.5, r * 0.35, '#559a48');
    }
    // Siepe.
    for (let x = 0; x < 256; x++) {
      const top = 34 + Math.round(hash(x >> 2, 0, 41) * 3);
      for (let y = top; y < 46; y++) p.dot(x, y, hash(x, y, 42) < 0.25 ? '#3a7034' : '#4b8a40');
    }
    // Steccato.
    p.rect(0, 46, 256, 18, '#b38654');
    for (let x = 0; x < 256; x += 8) {
      p.rect(x, 40, 7, 24, '#c99a64');
      p.rect(x + 2, 39, 3, 1, '#c99a64');
      p.rect(x, 40, 1, 24, '#e0b77f');
      p.rect(x + 6, 40, 1, 24, '#94683c');
    }
    p.rect(0, 47, 256, 2, '#8a5f36');
    p.rect(0, 57, 256, 2, '#8a5f36');
  });
}

/**
 * Spiazzo di terra battuta dal bordo irregolare (trasparente fuori).
 * La pista è l'anello più scuro e calpestato, con impronte di zampa.
 */
export function dirtTexture(size = 128, trackInner = 0.58, trackOuter = 0.78): THREE.CanvasTexture {
  return makeCanvasTexture(size, size, (p) => {
    const c = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        const r = Math.hypot(dx, dy) / c;
        const ang = Math.atan2(dy, dx);
        // Bordo frastagliato: l'erba "morde" la terra.
        const edge = 0.93 + Math.sin(ang * 7) * 0.025 + Math.sin(ang * 17 + 1) * 0.015;
        if (r > edge + hash(x, y, 51) * 0.04) continue;
        const n = hash(x, y, 52);
        let color = n < 0.15 ? '#9a7048' : n > 0.9 ? '#c49a6a' : '#ae8256';
        if (r >= trackInner && r <= trackOuter) color = n < 0.2 ? '#8a6040' : '#9c7049';
        if (r > edge - 0.04) color = '#8f6a40';
        if (hash(x >> 1, y >> 1, 53) < 0.012) color = '#d8cbb2'; // sassolini
        p.dot(x, y, color);
      }
    }
    // Impronte lungo la pista.
    const mid = ((trackInner + trackOuter) / 2) * c;
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const off = k % 2 ? 2.5 : -2.5;
      const px = c + Math.cos(a) * (mid + off);
      const py = c + Math.sin(a) * (mid + off);
      p.rect(px - 1, py - 1, 2, 2, '#6f4c30');
      p.dot(px - 1, py - 2.5, '#6f4c30');
      p.dot(px + 1, py - 2.5, '#6f4c30');
    }
  });
}
