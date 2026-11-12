import type { KeyPair } from '../config/settings';
import type { PlayerAction, TimedInput } from '../core/MatchMachine';

export type { TimedInput } from '../core/MatchMachine';

/**
 * Raccoglie le pressioni dei tasti di gioco con il loro timestamp preciso.
 * La logica le consuma una volta per frame, in ordine di tempo.
 */
export class Keyboard {
  private queue: TimedInput[] = [];
  private readonly bindings = new Map<string, { player: number; action: PlayerAction }>();

  constructor(keys: readonly KeyPair[], target: Window = window) {
    this.setBindings(keys);
    target.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  /** Assegna (o riassegna dal menu Comandi) i tasti di ogni giocatore. */
  setBindings(keys: readonly KeyPair[]): void {
    this.bindings.clear();
    keys.forEach((k, player) => {
      this.bindings.set(k.dash, { player, action: 'dash' });
      this.bindings.set(k.fake, { player, action: 'fake' });
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

  private onKeyDown(e: KeyboardEvent): void {
    const binding = this.bindings.get(e.code);
    if (!binding) return;
    e.preventDefault(); // es. le frecce non devono scorrere la pagina
    if (e.repeat) return; // tasto tenuto premuto: conta solo la prima pressione
    this.queue.push({ ...binding, t: e.timeStamp });
  }
}
