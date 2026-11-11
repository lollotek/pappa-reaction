/**
 * Calcola la risoluzione interna (bassa) e il fattore di scala intero
 * con cui ingrandirla a schermo. La scala intera garantisce pixel tutti
 * della stessa dimensione (niente pixel "storti").
 */
export interface PixelLayout {
  /** Risoluzione interna di rendering, in pixel di gioco. */
  width: number;
  height: number;
  /** Quanti pixel fisici dello schermo per ogni pixel di gioco. */
  scale: number;
  /** Dimensione CSS del canvas, in pixel CSS. */
  cssWidth: number;
  cssHeight: number;
}

export function computePixelLayout(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
  targetHeight: number,
): PixelLayout {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const deviceW = Math.max(1, Math.round(viewportWidth * dpr));
  const deviceH = Math.max(1, Math.round(viewportHeight * dpr));

  // Scala intera più grande che lascia almeno `targetHeight` righe di gioco.
  const scale = Math.max(1, Math.floor(deviceH / targetHeight));
  const width = Math.ceil(deviceW / scale);
  const height = Math.ceil(deviceH / scale);

  return {
    width,
    height,
    scale,
    cssWidth: (width * scale) / dpr,
    cssHeight: (height * scale) / dpr,
  };
}
