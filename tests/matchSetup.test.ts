import { describe, expect, it } from 'vitest';
import { parseMatchSetup } from '../src/config/matchSetup';

describe('parseMatchSetup', () => {
  it('default: P1 umano contro 3 CPU normali', () => {
    expect(parseMatchSetup('', 4)).toEqual({
      cpu: [false, true, true, true],
      difficulty: 'normale',
      seed: undefined,
    });
  });

  it('legge slot CPU, difficoltà e seed', () => {
    expect(parseMatchSetup('?cpu=1,4&diff=difficile&seed=77', 4)).toEqual({
      cpu: [true, false, false, true],
      difficulty: 'difficile',
      seed: 77,
    });
  });

  it('cpu=none: tutti umani; valori non validi ignorati', () => {
    expect(parseMatchSetup('?cpu=none&diff=impossibile&seed=abc', 4)).toEqual({
      cpu: [false, false, false, false],
      difficulty: 'normale',
      seed: undefined,
    });
    expect(parseMatchSetup('?cpu=0,5,2', 4).cpu).toEqual([false, true, false, false]);
  });
});
