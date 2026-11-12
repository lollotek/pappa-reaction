/**
 * Orologio di gioco che si può mettere in pausa. Converte i tempi reali
 * (`performance.now()`, `KeyboardEvent.timeStamp`) in tempo di gioco
 * togliendo le pause: dopo la ripresa il round continua da dove era.
 */
export class GameClock {
  private offset = 0;
  private pausedAt: number | null = null;

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  /** Tempo di gioco corrente (fermo durante la pausa). */
  now(real: number): number {
    return (this.pausedAt ?? real) - this.offset;
  }

  /** Converte un istante reale (es. timestamp di un tasto) in tempo di gioco. */
  toGame(real: number): number {
    return real - this.offset;
  }

  pause(real: number): void {
    if (this.pausedAt === null) this.pausedAt = real;
  }

  resume(real: number): void {
    if (this.pausedAt === null) return;
    this.offset += Math.max(0, real - this.pausedAt);
    this.pausedAt = null;
  }
}
