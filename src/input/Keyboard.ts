import type { KeyAction, KeyPair } from '../config/settings';
import type { PlayerAction, TimedInput } from '../core/MatchMachine';
import type { Axis } from './InputSource';

export type { TimedInput } from '../core/MatchMachine';

type Direction = Exclude<KeyAction, PlayerAction>;
const PRESS_ACTIONS: readonly PlayerAction[] = ['dash', 'fake'];
const DIRECTIONS: readonly Direction[] = ['left', 'right', 'up', 'down'];

/**
 * Raccoglie le pressioni dei tasti di gioco con il loro timestamp preciso
 * (la logica le consuma una volta per frame, in ordine di tempo) e tiene
 * conto delle direzioni tenute premute (giochi con il movimento).
 */
export class Keyboard {
  private queue: TimedInput[] = [];
  private readonly bindings = new Map<string, { player: number; action: PlayerAction }>();
  private readonly directions = new Map<string, { player: number; dir: Direction }>();
  /** Direzioni premute ora, per giocatore. */
  private held: Set<Direction>[] = [];

  constructor(keys: readonly KeyPair[], target: Window = window) {
    this.setBindings(keys);
    target.addEventListener('keydown', (e) => this.onKeyDown(e));
    target.addEventListener('keyup', (e) => {
      const d = this.directions.get(e.code);
      if (d) this.held[d.player]?.delete(d.dir);
    });
    // Finestra in secondo piano: i keyup si perdono, nessuna direzione resta "incollata".
    target.addEventListener('blur', () => this.held.forEach((h) => h.clear()));
  }

  /** Assegna (o riassegna dal menu Comandi) i tasti di ogni giocatore. */
  setBindings(keys: readonly KeyPair[]): void {
    this.bindings.clear();
    this.directions.clear();
    this.held = keys.map(() => new Set());
    keys.forEach((k, player) => {
      for (const action of PRESS_ACTIONS)
        if (k[action]) this.bindings.set(k[action], { player, action });
      for (const dir of DIRECTIONS) if (k[dir]) this.directions.set(k[dir], { player, dir });
    });
  }

  /** Scarta le pressioni accumulate (es. mentre si è nei menu). */
  clear(): void {
    this.queue = [];
  }

  /** Restituisce le pressioni accumulate, ordinate per tempo, e svuota la coda. */
  drain(): TimedInput[] {
    const out = this.queue.sort((a, b) => a.t - b.t);
    this.queue = [];
    return out;
  }

  /** Direzione tenuta da un giocatore: x (sinistra −1, destra +1), y (su −1, giù +1). */
  axis(player: number): Axis {
    const h = this.held[player];
    if (!h) return { x: 0, y: 0 };
    return {
      x: (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0),
      y: (h.has('down') ? 1 : 0) - (h.has('up') ? 1 : 0),
    };
  }

  private onKeyDown(e: KeyboardEvent): void {
    const dir = this.directions.get(e.code);
    if (dir) {
      e.preventDefault();
      this.held[dir.player]?.add(dir.dir);
      return;
    }
    const binding = this.bindings.get(e.code);
    if (!binding) return;
    e.preventDefault(); // es. le frecce non devono scorrere la pagina
    if (e.repeat) return; // tasto tenuto premuto: conta solo la prima pressione
    this.queue.push({ ...binding, t: e.timeStamp });
  }
}
