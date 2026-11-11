/** Generatore pseudo-casuale con seed (mulberry32): partite e test riproducibili. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Numero in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Numero in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Sceglie un elemento in base al suo `weight`. */
  pickWeighted<T extends { readonly weight: number }>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pickWeighted: lista vuota');
    const total = items.reduce((sum, it) => sum + it.weight, 0);
    let r = this.next() * total;
    for (const it of items) {
      r -= it.weight;
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }
}
