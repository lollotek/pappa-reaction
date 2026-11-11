/** Parametri di bilanciamento (vedi docs/GDD.md §11). Tempi in secondi. */
export const tuning = {
  render: {
    /** Righe di pixel di gioco (risoluzione interna verticale). */
    targetHeight: 270,
  },
  loop: {
    /** Passo della logica: 120 Hz. */
    step: 1 / 120,
  },
  round: {
    count: 5,
    introDuration: 1.5,
    circlingMin: 2.5,
    circlingMax: 7,
    revealWindow: 1.5,
    resolveDuration: 2,
    endDuration: 1,
  },
  rules: {
    /** Tempi entro questa soglia dal migliore = pareggio, porzione spartita. */
    tieThreshold: 0.03,
    /** Stordimento dopo falsa partenza: SCATTO inattivo. */
    stunDuration: 1.5,
    /** Finta di scatto: tempo minimo tra due finte dello stesso gatto. */
    fakeDashCooldown: 1,
    /** Penalità cacchetta quando non esiste un round successivo da saltare. */
    lastRoundPoopPenalty: -1,
  },
  /** Finte del coperchio fatte dalla mano durante il giro. */
  fakeLid: {
    maxPerRound: 2,
    /** Probabilità di ogni finta al round 1… */
    baseChance: 0.35,
    /** …che cresce di tanto a ogni round. */
    chancePerRound: 0.1,
    duration: 0.45,
    /** Pausa minima tra due finte. */
    minGap: 0.7,
    /** Niente finte appena iniziato il giro… */
    marginStart: 0.6,
    /** …né subito prima del reveal vero. */
    marginEnd: 0.8,
  },
  /** Contenuto della ciotola: punti e peso di probabilità. */
  bowl: [
    { id: 'crocchette', points: 1, weight: 35 },
    { id: 'tonno', points: 2, weight: 25 },
    { id: 'salmone', points: 3, weight: 15 },
    { id: 'gamberetto', points: 5, weight: 5 },
    { id: 'cacchetta', points: 0, weight: 20 },
  ],
} as const;
