/**
 * Accumulatore a timestep fisso: la logica di gioco avanza sempre a passi
 * di `step` secondi, indipendentemente dal framerate del monitor.
 */
export class FixedStepLoop {
  private accumulator = 0;
  /** Tempo di gioco totale simulato, in secondi. */
  time = 0;

  constructor(
    readonly step: number,
    /** Limite a un singolo frame lungo (es. tab in background) per evitare la "spirale della morte". */
    private readonly maxFrame = 0.25,
  ) {}

  /**
   * Avanza di `dt` secondi reali chiamando `update` zero o più volte.
   * Restituisce l'alpha (0..1) per interpolare il rendering tra due passi.
   */
  advance(dt: number, update: (step: number, time: number) => void): number {
    this.accumulator += Math.min(Math.max(dt, 0), this.maxFrame);
    while (this.accumulator >= this.step) {
      this.time += this.step;
      update(this.step, this.time);
      this.accumulator -= this.step;
    }
    return this.accumulator / this.step;
  }
}
