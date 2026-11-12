import type { PlayerAction, TimedInput } from '../core/MatchMachine';

/** Sorgente di pressioni dei gatti (tastiera, tocco) con il loro timestamp. */
export interface InputSource {
  drain(): TimedInput[];
  clear(): void;
}

/** Unisce più sorgenti: le pressioni escono tutte insieme, ordinate per tempo. */
export class MergedInput implements InputSource {
  constructor(private readonly sources: readonly InputSource[]) {}

  drain(): TimedInput[] {
    return this.sources.flatMap((s) => s.drain()).sort((a, b) => a.t - b.t);
  }

  clear(): void {
    this.sources.forEach((s) => s.clear());
  }
}

/**
 * Pressioni dei pulsanti touch. Il timestamp è quello del `pointerdown`
 * (stesso orologio di `performance.now()`, come per la tastiera).
 */
export class TouchInput implements InputSource {
  private queue: TimedInput[] = [];

  press(player: number, action: PlayerAction, t: number): void {
    this.queue.push({ player, action, t });
  }

  drain(): TimedInput[] {
    const out = this.queue.sort((a, b) => a.t - b.t);
    this.queue = [];
    return out;
  }

  clear(): void {
    this.queue = [];
  }
}
