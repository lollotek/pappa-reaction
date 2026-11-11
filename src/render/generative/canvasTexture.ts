import * as THREE from 'three';

/**
 * Crea una texture pixel art disegnata via codice su un canvas.
 * Filtri `nearest` e niente mipmap: i pixel restano netti.
 */
export function makeCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D non disponibile');
  ctx.imageSmoothingEnabled = false;
  draw(ctx, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Tappeto rotondo a spicchi e anelli: la pista provvisoria. */
export function rugTexture(size = 128): THREE.CanvasTexture {
  const palette = ['#c96f4a', '#e3b26b', '#7f9c6b', '#d98c8c', '#8a7bb5', '#6fa3b8'];
  return makeCanvasTexture(size, size, (ctx, w) => {
    const c = w / 2;
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        const r = Math.hypot(dx, dy) / c;
        if (r > 1) continue;
        let color: string;
        if (r > 0.94) color = '#5b3a2a';
        else if (r > 0.86) color = '#f0dcb4';
        else if (r > 0.42) {
          const a = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
          color = palette[Math.floor(a * 24) % palette.length];
        } else if (r > 0.36) color = '#f0dcb4';
        else color = '#b9905f';
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

/** Fiorellino in vaso, decoro 2D. */
export function flowerPotTexture(petal: string): THREE.CanvasTexture {
  return makeCanvasTexture(16, 24, (ctx) => {
    const px = (x: number, y: number, w: number, h: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    px(7, 6, 2, 10, '#3f7d3a'); // stelo
    px(4, 10, 3, 2, '#5aa04f'); // foglia
    px(9, 12, 3, 2, '#5aa04f');
    px(5, 2, 6, 6, petal); // petali
    px(7, 4, 2, 2, '#f7e26b'); // centro
    px(3, 16, 10, 2, '#a4522e'); // bordo vaso
    px(4, 18, 8, 6, '#c8693a'); // vaso
    px(4, 18, 2, 6, '#e08a55'); // riflesso
  });
}
