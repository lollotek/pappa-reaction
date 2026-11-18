import type { Difficulty } from '../../config/tuning';

/**
 * Parametri di Scaccia la palla (vedi docs/GDD_SCACCIA.md). Distanze in unità
 * mondo (il campo è un quadrato di lato 2 × `field.half`), velocità in unità
 * al secondo, tempi in secondi.
 */
export const scacciaTuning = {
  field: {
    /** Metà lato del tappeto quadrato: la linea di porta di ogni gatto. */
    half: 3.6,
    /** Smusso degli angoli (cuscini diagonali su cui la palla rimbalza). */
    corner: 1.1,
    /**
     * Gol quando il centro della palla passa questa distanza dal centro (più il
     * raggio): dietro al cuscino, che sta sulla linea dei cuscini d'angolo.
     */
    goal: 3.95,
  },
  paddle: {
    /**
     * Distanza dal centro della linea su cui scorre il cuscino: sulla linea in cui
     * finiscono i cuscini d'angolo, così ogni palla che ne rimbalza arriva al cuscino.
     */
    depth: 3.6,
    /** Metà lunghezza del cuscino a salsicciotto. */
    halfLength: 0.75,
    /** Raggio del salsicciotto. */
    radius: 0.17,
    /** Velocità massima lungo il lato e accelerazione. */
    speed: 6.5,
    accel: 60,
    /** Angolo massimo del rinvio quando la palla tocca la punta del cuscino (gradi). */
    maxAngle: 52,
    /** Quanto il movimento del cuscino inclina il rinvio normale (radianti a velocità piena). */
    carry: 0.22,
  },
  ball: {
    radius: 0.24,
    /** Velocità al lancio dal centro. */
    launchSpeed: 3.6,
    /** Ogni rinvio accelera la palla di questa frazione. */
    hitBoost: 0.06,
    /** Accelerazione col tempo: frazione al secondo mentre la palla è in campo. */
    rampPerSecond: 0.012,
    /** Velocità massima di un rinvio normale. */
    maxSpeed: 10,
    /** Deviazione casuale a ogni rimbalzo sugli angoli (radianti): niente palle "incastrate". */
    wallJitter: 0.1,
  },
  smash: {
    /** Dopo la pressione, per quanto la zampata colpisce come smash. */
    window: 0.17,
    /** Tempo minimo tra due smash dello stesso gatto. */
    cooldown: 0.5,
    /** Lo smash moltiplica la velocità (almeno `minSpeed`)… */
    boost: 1.6,
    minSpeed: 8,
    /** …fino a questo massimo. */
    maxSpeed: 14,
    /** Effetto: velocità di rotazione della traiettoria a cuscino in corsa (rad/s). */
    spinMax: 1.25,
    /** Mezza vita dell'effetto (s): la curva si esaurisce. */
    spinDecay: 0.75,
    /** Lo smash "a effetto" parte un po' dalla parte opposta alla curva (radianti). */
    spinCounter: 0.22,
  },
  spawn: {
    /** Ogni quanto arriva una palla nuova (se ce ne sono meno di `max`). */
    interval: 8,
    max: 3,
    /** La palla nuova trema al centro prima di partire (avviso). */
    tell: 0.8,
  },
  match: {
    /** "Pronti… via!" prima della prima palla. */
    intro: 2,
    /** Partita a tempo (opzione): durata. */
    timeLimit: 180,
  },
  /** CPU: tempo per rivedere la mossa, errore di mira, uso dello smash. */
  cpu: {
    facile: {
      thinkMs: 380,
      errorSd: 0.6,
      speedFactor: 0.62,
      smashChance: 0.15,
      spinChance: 0.1,
      readsSpin: false,
      aim: 0.2,
    },
    normale: {
      thinkMs: 230,
      errorSd: 0.24,
      speedFactor: 0.88,
      smashChance: 0.35,
      spinChance: 0.3,
      readsSpin: true,
      aim: 0.45,
    },
    difficile: {
      thinkMs: 120,
      errorSd: 0.08,
      speedFactor: 1,
      smashChance: 0.6,
      spinChance: 0.5,
      readsSpin: true,
      aim: 0.7,
    },
  } satisfies Record<Difficulty, ScacciaCpuProfile>,
};

export interface ScacciaCpuProfile {
  /** Ogni quanto la CPU rivede la mossa (ms): è anche il suo tempo di reazione. */
  thinkMs: number;
  /** Errore nel punto di arrivo previsto (unità mondo, per secondo di anticipo). */
  errorSd: number;
  /** Frazione della velocità massima del cuscino. */
  speedFactor: number;
  /** Probabilità di fare lo smash su una palla in arrivo. */
  smashChance: number;
  /** Probabilità di dare effetto (smash muovendosi). */
  spinChance: number;
  /** Prevede la curva delle palle con effetto. */
  readsSpin: boolean;
  /** Quanto prova a mirare (colpire con la punta per angolare il rinvio). */
  aim: number;
}

export type ScacciaTuning = typeof scacciaTuning;
