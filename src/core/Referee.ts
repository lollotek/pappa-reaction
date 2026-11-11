import type { Rng } from './Rng';

/**
 * La "mano arbitro": decide cosa c'è sotto il coperchio e quando fare le finte.
 * Funzioni pure guidate dall'Rng, così le partite sono riproducibili.
 */

export interface BowlContent {
  readonly id: string;
  readonly points: number;
  readonly weight: number;
}

export interface FakeLidConfig {
  maxPerRound: number;
  baseChance: number;
  chancePerRound: number;
  durationMs: number;
  minGapMs: number;
  marginStartMs: number;
  marginEndMs: number;
}

export function pickContent(
  rng: Rng,
  contents: readonly BowlContent[],
  poopId: string,
  allowPoop: boolean,
): BowlContent {
  const pool = allowPoop ? contents : contents.filter((c) => c.id !== poopId);
  return rng.pickWeighted(pool.length > 0 ? pool : contents);
}

/**
 * Pianifica le finte del coperchio di un round: istanti (ms) relativi
 * all'inizio del giro, in ordine, distanziati e lontani dal reveal vero.
 * L'Rng viene chiamato sempre lo stesso numero di volte (determinismo).
 */
export function planFakeLids(
  rng: Rng,
  round: number,
  circlingMs: number,
  cfg: FakeLidConfig,
): number[] {
  const chance = Math.min(0.9, cfg.baseChance + cfg.chancePerRound * (round - 1));
  const latest = circlingMs - cfg.marginEndMs - cfg.durationMs;
  const candidates: number[] = [];
  for (let i = 0; i < cfg.maxPerRound; i++) {
    const roll = rng.next();
    const at = rng.range(cfg.marginStartMs, Math.max(cfg.marginStartMs, latest));
    if (roll < chance && latest > cfg.marginStartMs) candidates.push(at);
  }
  candidates.sort((a, b) => a - b);

  const out: number[] = [];
  for (const at of candidates) {
    const prev = out[out.length - 1];
    if (prev === undefined || at >= prev + cfg.durationMs + cfg.minGapMs) out.push(at);
  }
  return out;
}
