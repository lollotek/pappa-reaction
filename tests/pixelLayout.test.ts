import { describe, expect, it } from 'vitest';
import { computePixelLayout } from '../src/render/pixelLayout';

describe('computePixelLayout', () => {
  it('1080p a dpr 1: scala 4, 480x270', () => {
    expect(computePixelLayout(1920, 1080, 1, 270)).toEqual({
      width: 480,
      height: 270,
      scale: 4,
      cssWidth: 1920,
      cssHeight: 1080,
    });
  });

  it('usa una scala intera e copre tutto il viewport', () => {
    const l = computePixelLayout(1366, 768, 1, 270);
    expect(Number.isInteger(l.scale)).toBe(true);
    expect(l.scale).toBe(2);
    expect(l.height).toBeGreaterThanOrEqual(270);
    expect(l.cssWidth).toBeGreaterThanOrEqual(1366);
    expect(l.cssHeight).toBeGreaterThanOrEqual(768);
  });

  it('tiene conto del devicePixelRatio', () => {
    const l = computePixelLayout(1280, 720, 1.5, 270);
    expect(l.scale).toBe(4);
    expect(l.width * l.scale).toBeGreaterThanOrEqual(1920);
  });

  it('finestra piccolissima: scala minima 1', () => {
    const l = computePixelLayout(200, 100, 1, 270);
    expect(l.scale).toBe(1);
    expect(l).toMatchObject({ width: 200, height: 100 });
  });
});
