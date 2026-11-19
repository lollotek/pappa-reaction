import type { Difficulty } from '../../config/tuning';

/**
 * Parametri di Graffio Killer (vedi docs/GDD_GRAFFIO.md). Altezze in unità
 * mondo (0 = piano del trespolo), velocità in unità al secondo, tempi in secondi.
 */
export const graffioTuning = {
  geometry: {
    /** Quota di taglio: dove la zampata del gatto colpisce. */
    cutY: 2.7,
    /** Altezza del fondo del tubo quando è sollevato, fuori quadro. */
    holdY: 5.2,
    /** Lunghezza del tubo di cartone. */
    logLength: 3.4,
    /** Raggio del tubo. */
    logRadius: 0.48,
    /**
     * La tacca sta a questa distanza dal fondo del tubo (min e max). Così una
     * zampata appena il tubo arriva (o all'ultimo istante) cade sempre lontano
     * dalla tacca: nessuna scorciatoia senza tempismo.
     */
    markMin: 0.9,
    markMax: 1.6,
  },
  timing: {
    intro: 1.3,
    /** Tubi sui trespoli con la tacca ben visibile. */
    show: 1.9,
    lift: 0.75,
    /** Pausa prima della caduta, casuale: non si può anticipare a orecchio. */
    waitMin: 0.6,
    waitMax: 1.25,
    /** Ritardo di caduta tra un gatto e l'altro: passo e variazione casuale. */
    staggerStep: 0.11,
    staggerJitter: 0.04,
    /** Dopo che l'ultimo tubo è a terra (o l'ultimo taglio) il round finisce. */
    settle: 0.55,
    result: 2.0,
  },
  /** Velocità di caduta: cresce a ogni round, fino a un massimo. */
  speed: { base: 4.6, growth: 1.18, max: 12 },
  /**
   * Punti per scarto (distanza tra tacca e taglio, in unità). Le soglie sono
   * fisse: con la velocità che sale, in millisecondi si stringono (±0,14 = ±30 ms al round 1).
   */
  scoring: [
    { maxDist: 0.14, points: 10, label: 'Perfetto!' },
    { maxDist: 0.35, points: 7, label: 'Ottimo' },
    { maxDist: 0.6, points: 5, label: 'Buono' },
    { maxDist: 0.85, points: 3, label: 'Così così' },
    { maxDist: 1.0, points: 1, label: 'Quasi' },
  ] as const,
  /** Scarto (ms) assegnato a chi non taglia: per lo spareggio. */
  missErrorMs: 1000,
  cpu: {
    facile: { sdMs: 90, missChance: 0.08 },
    normale: { sdMs: 45, missChance: 0.03 },
    difficile: { sdMs: 22, missChance: 0.01 },
  } satisfies Record<Difficulty, GraffioCpuProfile>,
};

export interface GraffioCpuProfile {
  /** Deviazione standard dell'errore di tempismo (ms) al primo round. */
  sdMs: number;
  /** Probabilità di non tagliare affatto. */
  missChance: number;
}

export type GraffioTuning = typeof graffioTuning;

/** Velocità di caduta del round `round` (0 = primo). */
export function fallSpeed(round: number, t = graffioTuning): number {
  return Math.min(t.speed.max, t.speed.base * t.speed.growth ** round);
}
