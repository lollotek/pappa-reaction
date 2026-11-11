import { describe, expect, it } from 'vitest';
import { pickContent, planFakeLids, type FakeLidConfig } from '../src/core/Referee';
import { Rng } from '../src/core/Rng';

const cfg: FakeLidConfig = {
  maxPerRound: 2,
  baseChance: 0.35,
  chancePerRound: 0.1,
  durationMs: 450,
  minGapMs: 700,
  marginStartMs: 600,
  marginEndMs: 800,
};

describe('planFakeLids', () => {
  it('rispetta margini e distanza minima', () => {
    const rng = new Rng(9);
    for (let i = 0; i < 2000; i++) {
      const circling = rng.range(2500, 7000);
      const fakes = planFakeLids(rng, 1 + (i % 5), circling, { ...cfg, baseChance: 1 });
      expect(fakes.length).toBeLessThanOrEqual(2);
      fakes.forEach((at, k) => {
        expect(at).toBeGreaterThanOrEqual(600);
        expect(at + 450).toBeLessThanOrEqual(circling - 800);
        if (k > 0) expect(at - fakes[k - 1]).toBeGreaterThanOrEqual(450 + 700);
      });
    }
  });

  it('niente finte se il giro è troppo corto', () => {
    expect(planFakeLids(new Rng(1), 5, 1500, { ...cfg, baseChance: 1 })).toEqual([]);
  });

  it('le finte diventano più frequenti nei round finali', () => {
    const count = (round: number) => {
      const rng = new Rng(11);
      let n = 0;
      for (let i = 0; i < 3000; i++) n += planFakeLids(rng, round, 7000, cfg).length;
      return n;
    };
    expect(count(5)).toBeGreaterThan(count(1) * 1.5);
  });

  it("consuma sempre lo stesso numero di valori dall'Rng", () => {
    const a = new Rng(4);
    const b = new Rng(4);
    planFakeLids(a, 1, 7000, { ...cfg, baseChance: 0 });
    planFakeLids(b, 1, 7000, { ...cfg, baseChance: 1 });
    expect(a.next()).toBe(b.next());
  });
});

describe('pickContent', () => {
  const contents = [
    { id: 'tonno', points: 2, weight: 1 },
    { id: 'cacchetta', points: 0, weight: 100 },
  ];

  it('esclude la cacchetta quando non è ammessa', () => {
    const rng = new Rng(2);
    for (let i = 0; i < 200; i++) {
      expect(pickContent(rng, contents, 'cacchetta', false).id).toBe('tonno');
    }
  });

  it('con la cacchetta ammessa la può scegliere', () => {
    const rng = new Rng(2);
    const ids = new Set(
      Array.from({ length: 50 }, () => pickContent(rng, contents, 'cacchetta', true).id),
    );
    expect(ids.has('cacchetta')).toBe(true);
  });
});
