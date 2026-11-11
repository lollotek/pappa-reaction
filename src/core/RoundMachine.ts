import type { Rng } from './Rng';

/**
 * Logica pura di una partita: fasi del round, scatti, false partenze, punteggi.
 * Nessuna dipendenza da Three.js o dal DOM.
 *
 * Tutti i tempi sono in millisecondi sullo stesso orologio di
 * `performance.now()` / `KeyboardEvent.timeStamp`. La macchina non legge
 * mai l'orologio da sola: avanza solo con `advanceTo(t)` e `input(..., t)`,
 * così ogni pressione viene valutata al suo istante esatto e i test sono
 * deterministici.
 */

export type Phase = 'intro' | 'circling' | 'dash' | 'resolve' | 'end';
export type PlayerAction = 'dash' | 'fake';

export interface BowlContent {
  readonly id: string;
  readonly points: number;
  readonly weight: number;
}

export interface RoundConfig {
  playerCount: number;
  introMs: number;
  circlingMinMs: number;
  circlingMaxMs: number;
  /** Durata della finestra di scatto, dal momento in cui il coperchio è visibile. */
  revealWindowMs: number;
  resolveMs: number;
  endMs: number;
  /** Tempi entro questa soglia dal migliore = pareggio. */
  tieThresholdMs: number;
  /** Stordimento dopo una falsa partenza: SCATTO ignorato. */
  stunMs: number;
  contents: readonly BowlContent[];
}

export interface PlayerRoundState {
  /** Fino a questo istante il tasto SCATTO non risponde. */
  stunnedUntil: number;
  /** Tempo di reazione valido, `null` se non ha (ancora) scattato. */
  reactionMs: number | null;
}

export interface RoundResult {
  round: number;
  content: BowlContent;
  winners: number[];
  pointsEach: number;
  reactions: (number | null)[];
}

export type RoundEvent =
  | { type: 'phase'; phase: Phase; t: number; round: number }
  | { type: 'falseStart'; player: number; t: number; stunnedUntil: number }
  | { type: 'dash'; player: number; t: number; reactionMs: number }
  | { type: 'resolved'; t: number; result: RoundResult };

export class RoundMachine {
  phase: Phase = 'intro';
  phaseStart: number;
  round = 1;
  readonly scores: number[];
  players: PlayerRoundState[] = [];
  content!: BowlContent;
  /** Istante del primo frame renderizzato con il coperchio aperto (t0 delle reazioni). */
  revealShownAt: number | null = null;
  lastResult: RoundResult | null = null;

  private circlingMs = 0;
  private events: RoundEvent[] = [];

  constructor(
    readonly config: RoundConfig,
    private readonly rng: Rng,
    startTime: number,
  ) {
    this.scores = new Array<number>(config.playerCount).fill(0);
    this.phaseStart = startTime;
    this.startRound(startTime);
  }

  /** Istante in cui finisce la fase corrente (Infinity = in attesa di un evento). */
  phaseEndsAt(): number {
    const c = this.config;
    switch (this.phase) {
      case 'intro':
        return this.phaseStart + c.introMs;
      case 'circling':
        return this.phaseStart + this.circlingMs;
      case 'dash':
        // La finestra parte solo quando il coperchio aperto è davvero a schermo.
        return this.revealShownAt === null ? Infinity : this.revealShownAt + c.revealWindowMs;
      case 'resolve':
        return this.phaseStart + c.resolveMs;
      case 'end':
        return this.phaseStart + c.endMs;
    }
  }

  /** Fa avanzare le fasi fino all'istante `t` (incluso). */
  advanceTo(t: number): void {
    let end: number;
    while ((end = this.phaseEndsAt()) <= t && Number.isFinite(end)) this.next(end);
  }

  /** Chiamato dal rendering nel primo frame che mostra il coperchio aperto. */
  markRevealShown(t: number): void {
    if (this.phase === 'dash' && this.revealShownAt === null) this.revealShownAt = t;
  }

  input(player: number, action: PlayerAction, t: number): void {
    if (player < 0 || player >= this.config.playerCount) return;
    this.advanceTo(t);
    if (action !== 'dash') return; // la finta arriva in M2

    const p = this.players[player];
    if (p.reactionMs !== null || t < p.stunnedUntil) return;

    const lidNotYetVisible =
      this.phase === 'dash' && (this.revealShownAt === null || t < this.revealShownAt);

    if (this.phase === 'circling' || lidNotYetVisible) {
      p.stunnedUntil = t + this.config.stunMs;
      this.events.push({ type: 'falseStart', player, t, stunnedUntil: p.stunnedUntil });
      return;
    }

    if (this.phase === 'dash' && this.revealShownAt !== null) {
      p.reactionMs = t - this.revealShownAt;
      this.events.push({ type: 'dash', player, t, reactionMs: p.reactionMs });
      if (this.players.every((pl) => pl.reactionMs !== null)) this.next(t);
    }
    // intro / resolve / end: pressione ignorata
  }

  /** Restituisce e svuota gli eventi accumulati (per animazioni e HUD). */
  drainEvents(): RoundEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private startRound(t: number): void {
    const c = this.config;
    this.players = Array.from({ length: c.playerCount }, () => ({
      stunnedUntil: -Infinity,
      reactionMs: null,
    }));
    this.content = this.rng.pickWeighted(c.contents);
    this.circlingMs = this.rng.range(c.circlingMinMs, c.circlingMaxMs);
    this.revealShownAt = null;
    this.enter('intro', t);
  }

  private next(t: number): void {
    switch (this.phase) {
      case 'intro':
        return this.enter('circling', t);
      case 'circling':
        return this.enter('dash', t);
      case 'dash':
        this.resolve(t);
        return this.enter('resolve', t);
      case 'resolve':
        return this.enter('end', t);
      case 'end':
        this.round++;
        return this.startRound(t);
    }
  }

  private enter(phase: Phase, t: number): void {
    this.phase = phase;
    this.phaseStart = t;
    this.events.push({ type: 'phase', phase, t, round: this.round });
  }

  private resolve(t: number): void {
    const reactions = this.players.map((p) => p.reactionMs);
    const valid = reactions.filter((r): r is number => r !== null);
    let winners: number[] = [];
    if (valid.length > 0) {
      const best = Math.min(...valid);
      winners = reactions.flatMap((r, i) =>
        r !== null && r <= best + this.config.tieThresholdMs ? [i] : [],
      );
    }
    const pointsEach = winners.length > 0 ? this.content.points / winners.length : 0;
    for (const w of winners) this.scores[w] += pointsEach;

    this.lastResult = { round: this.round, content: this.content, winners, pointsEach, reactions };
    this.events.push({ type: 'resolved', t, result: this.lastResult });
  }
}
