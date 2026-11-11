import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../src/core/FixedStepLoop';

describe('FixedStepLoop', () => {
  it('esegue un numero di passi proporzionale al tempo', () => {
    const loop = new FixedStepLoop(0.01);
    let steps = 0;
    loop.advance(0.035, () => steps++);
    expect(steps).toBe(3);
    loop.advance(0.006, () => steps++);
    expect(steps).toBe(4);
  });

  it("restituisce l'alpha di interpolazione", () => {
    const loop = new FixedStepLoop(0.01);
    expect(loop.advance(0.025, () => {})).toBeCloseTo(0.5);
  });

  it('limita i frame troppo lunghi', () => {
    const loop = new FixedStepLoop(0.01, 0.1);
    let steps = 0;
    loop.advance(5, () => steps++);
    expect(steps).toBe(10);
  });

  it('ignora dt negativi', () => {
    const loop = new FixedStepLoop(0.01);
    let steps = 0;
    loop.advance(-1, () => steps++);
    expect(steps).toBe(0);
    expect(loop.time).toBe(0);
  });
});
