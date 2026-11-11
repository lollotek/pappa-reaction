import type { CpuPlayer } from '../ai/CpuPlayer';
import type { MatchMachine, RoundEvent, TimedInput } from '../core/MatchMachine';

/**
 * Collega MatchMachine, input umani e CPU, senza rendering.
 * Usato dal gioco (un passo per frame) e dalle simulazioni nei test.
 *
 * Ciclo per frame:
 *   const events = driver.step(now, keyboardInputs);
 *   …animazioni e rendering…
 *   driver.afterRender(now, lidVisible);
 */
export class MatchDriver {
  private readonly cpuSlots: Set<number>;

  constructor(
    readonly machine: MatchMachine,
    readonly cpus: readonly CpuPlayer[],
  ) {
    this.cpuSlots = new Set(cpus.map((c) => c.player));
  }

  /** Applica gli input (umani + CPU) in ordine di tempo e avanza fino a `now`. */
  step(now: number, humanInputs: readonly TimedInput[]): RoundEvent[] {
    const inputs = [
      // I tasti di uno slot CPU vengono ignorati.
      ...humanInputs.filter((i) => !this.cpuSlots.has(i.player)),
      ...this.cpus.flatMap((c) => c.drainDue(now)),
    ].sort((a, b) => a.t - b.t);

    for (const input of inputs) this.machine.input(input.player, input.action, input.t);
    this.machine.advanceTo(now);

    const events = this.machine.drainEvents();
    for (const e of events) for (const cpu of this.cpus) cpu.onEvent(e, this.machine);
    return events;
  }

  /** Dopo il rendering: se il coperchio aperto è a schermo, parte il cronometro. */
  afterRender(now: number, lidVisible: boolean): void {
    if (lidVisible) this.machine.markRevealShown(now);
    for (const cpu of this.cpus) cpu.update(this.machine);
  }
}
