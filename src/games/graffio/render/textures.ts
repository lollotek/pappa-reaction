import * as THREE from 'three';
import { hash, makeCanvasTexture, shade } from '../../../render/generative/canvasTexture';

/**
 * Cartone ondulato del tubo: righe verticali di tono diverso (così l'altezza
 * si può stirare senza che si veda) e qualche macchia.
 */
export function cardboardTexture(): THREE.CanvasTexture {
  const tex = makeCanvasTexture(32, 16, (p) => {
    for (let x = 0; x < 32; x++) {
      const stripe = x % 4 < 2 ? '#b4693b' : '#a05b30';
      for (let y = 0; y < 16; y++) {
        const n = hash(x, y, 3);
        p.dot(x, y, n < 0.1 ? shade(stripe, -22) : n > 0.93 ? shade(stripe, 18) : stripe);
      }
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

/** Corda di sisal avvolta sul tiragraffi: righe orizzontali. */
export function sisalTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(16, 16, (p) => {
    for (let y = 0; y < 16; y++) {
      const band = y % 4 < 2 ? '#d9bf8c' : '#c3a672';
      for (let x = 0; x < 16; x++) p.dot(x, y, hash(x, y, 9) < 0.12 ? shade(band, -20) : band);
    }
  });
}
