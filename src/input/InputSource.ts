import type { PlayerAction, TimedInput } from '../core/MatchMachine';

/** Direzione tenuta: x (sinistra −1 … destra +1), y (su −1 … giù +1). */
export interface Axis {
  x: number;
  y: number;
}

export const NO_AXIS: Axis = { x: 0, y: 0 };

/**
 * Comandi di un frame per la partita: pressioni con il loro istante,
 * direzioni tenute (tastiera + controller) e striscia touch (posizione del
 * dito 0..1 da sinistra a destra, null se nessun dito), per giocatore.
 */
export interface FrameInput {
  presses: readonly TimedInput[];
  axes: readonly Axis[];
  strips: readonly (number | null)[];
}

export const EMPTY_INPUT: FrameInput = { presses: [], axes: [], strips: [] };

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
