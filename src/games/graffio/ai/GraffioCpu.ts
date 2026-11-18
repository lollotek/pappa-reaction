import type { Rng } from '../../../core/Rng';
import type { GraffioMatch, GraffioPress } from '../core/GraffioMatch';
import type { GraffioCpuProfile } from '../tuning';

/** Gauss (Box-Muller) con la nostra Rng: riproducibile. */
function gaussian(rng: Rng): number {
  const u = Math.max(1e-9, rng.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

/**
 * Gatto CPU: appena il tubo comincia a cadere "vede" quando la tacca
 * incrocerà la quota di taglio e pianifica la zampata con un errore casuale.
 * L'errore cresce un po' con la velocità (a tubi veloci sbaglia di più in ms).
 */
export class GraffioCpu {
  private plannedRound = -1;
  private plan: number | null = null;

  constructor(
    readonly player: number,
    private readonly profile: GraffioCpuProfile,
    private readonly rng: Rng,
  ) {}

  /** Zampate pronte entro `now` (con il loro istante esatto). */
  drain(m: GraffioMatch, now: number): GraffioPress[] {
    if (m.phase !== 'drop' && m.phase !== 'wait') return [];
    if (this.plannedRound !== m.round) {
      this.plannedRound = m.round;
      this.plan = this.rng.next() < this.profile.missChance ? null : this.planPress(m);
    }
    if (this.plan === null || m.hasCut(this.player) || this.plan > now) return [];
    const t = this.plan;
    this.plan = null;
    return [{ player: this.player, t }];
  }

  private planPress(m: GraffioMatch): number {
    // Più il tubo è veloce, più grande è l'errore in ms (la mano è la stessa).
    const sd = this.profile.sdMs * (1 + 0.03 * m.round);
    return m.crossTime(this.player) + gaussian(this.rng) * sd;
  }
}
