import type { Difficulty } from '../../config/tuning';

/**
 * Parametri di Corsa pazza (vedi docs/GDD_CORSA.md). Misure in unità mondo
 * (il gatto è largo ~0,8), tempi in secondi.
 */
export const corsaTuning = {
  /**
   * Pista: anello di terra battuta tra due rettangoli dagli angoli arrotondati
   * (mezze misure x, y; raggio degli angoli). Larga 3,8: quattro gatti affiancati
   * ci stanno giusti, senza toccarsi.
   */
  track: {
    outer: { x: 8.5, y: 5.5, r: 3.2 },
    inner: { x: 4.7, y: 1.7, r: 0.7 },
    /** Linea mediana (per misurare i giri): a metà tra i due bordi. */
    mid: { x: 6.6, y: 3.6, r: 1.95 },
    width: 3.8,
  },
  runner: {
    /** Raggio d'ingombro del gatto. */
    radius: 0.4,
    maxSpeed: 4.5,
    accel: 12,
    decel: 20,
    /** Quanto in fretta gira il muso verso la direzione tenuta (rad/s). */
    turnRate: 10,
    /** Sterzare a fondo costa velocità: 0 = niente, 1 = ci si ferma a girare al contrario. */
    turnDrag: 0.55,
    /** Frenata radente contro lo steccato (per passo, per componente contro il muro). */
    wallDrag: 0.04,
    /** Ultimo giro: carica rotolante, più veloce. */
    finalBoost: 1.2,
    /** Urto tra gatti: quanto rimbalzano (0..1) e quanto abbrivio perdono. */
    bounce: 0.45,
    bumpDrag: 0.97,
    /** Il "calcio" dell'urto si smorza in fretta. */
    kickDecay: 7,
  },
  trap: {
    /** Raggio della cacchetta. */
    radius: 0.42,
    /** Quanto resta sulla pista (s). */
    life: 9,
    /** Riserva massima per gatto. */
    max: 3,
    /** Cacchette in regalo al traguardo di ogni giro, per posizione (1°, 2°, 3°, 4°). */
    award: [0, 1, 2, 3],
    /** Stordimento di chi la pesta (ms) e tempo di grazia dopo (ms). */
    stunMs: 800,
    graceMs: 450,
    /** Tra due rilasci dello stesso gatto (ms). */
    cooldownMs: 350,
  },
  race: {
    laps: 9,
    /** "Pronti… via!" prima della partenza (s). */
    intro: 2.6,
    /** Griglia: i gatti stanno affiancati un po' prima del traguardo. */
    gridBack: 1.1,
  },
  cpu: {
    facile: {
      thinkMs: 260,
      speedFactor: 0.8,
      laneNoise: 0.9,
      dropChance: 0.4,
      dodge: 0.5,
    },
    normale: {
      thinkMs: 150,
      speedFactor: 0.9,
      laneNoise: 0.5,
      dropChance: 0.75,
      dodge: 0.8,
    },
    difficile: {
      thinkMs: 80,
      speedFactor: 0.97,
      laneNoise: 0.25,
      dropChance: 0.90,
      dodge: 0.95,
    },
  } satisfies Record<Difficulty, CorsaCpuProfile>,
};

export interface CorsaCpuProfile {
  /** Ogni quanto la CPU rivede la mossa (ms). */
  thinkMs: number;
  /** Frazione della velocità massima (le CPU facili non spingono a fondo). */
  speedFactor: number;
  /** Quanto ondeggia la traiettoria (unità mondo). */
  laneNoise: number;
  /** Probabilità di rilasciare una cacchetta quando ha un avversario dietro. */
  dropChance: number;
  /** Probabilità di accorgersi (e scansare) una cacchetta davanti. */
  dodge: number;
}

export type CorsaTuning = typeof corsaTuning;
