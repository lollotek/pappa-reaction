import { pickContent, planFakeLids, type BowlContent, type FakeLidConfig } from './Referee';
import type { Rng } from './Rng';

export type { BowlContent, FakeLidConfig } from './Referee';

/**
 * Logica pura di una partita: round, scatti, finte, cacchetta, punteggi,
 * spareggio e classifica. Nessuna dipendenza da Three.js o dal DOM.
 *
 * Tutti i tempi sono in millisecondi sullo stesso orologio di
 * `performance.now()` / `KeyboardEvent.timeStamp`. La macchina non legge
 * mai l'orologio da sola: avanza solo con `advanceTo(t)` e `input(..., t)`,
 * così ogni pressione viene valutata al suo istante esatto e i test sono
 * deterministici.
 */

export type Phase = 'intro' | 'circling' | 'dash' | 'resolve' | 'end' | 'final';
export type PlayerAction = 'dash' | 'fake';

/** Pressione di un giocatore (umano o CPU) con il suo istante esatto. */
export interface TimedInput {
  player: number;
  action: PlayerAction;
  /** Stesso orologio di `performance.now()` / `KeyboardEvent.timeStamp`. */
  t: number;
}

export interface MatchConfig {
  playerCount: number;
  /** Round regolari; poi eventuale spareggio. */
  roundCount: number;
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
  fakeDashCooldownMs: number;
  fakeLid: FakeLidConfig;
  contents: readonly BowlContent[];
  poopId: string;
  /** Penalità cacchetta quando non c'è un round successivo da saltare. */
  lastRoundPoopPenalty: number;
}

export interface PlayerRoundState {
  /** Partecipa al round (false = salta il turno o escluso dallo spareggio). */
  active: boolean;
  /** Fino a questo istante il tasto SCATTO non risponde. */
  stunnedUntil: number;
  /** Tempo di reazione valido, `null` se non ha (ancora) scattato. */
  reactionMs: number | null;
  grabbedPoop: boolean;
  lastFakeAt: number;
}

export interface RoundResult {
  round: number;
  suddenDeath: boolean;
  content: BowlContent;
  winners: number[];
  pointsEach: number;
  reactions: (number | null)[];
  /** Chi ha afferrato la cacchetta. */
  poopVictims: number[];
  /** true = le vittime saltano il prossimo round; false = penalità in punti. */
  poopSkipsNext: boolean;
}

export type RoundEvent =
  | { type: 'phase'; phase: Phase; t: number; round: number }
  | { type: 'falseStart'; player: number; t: number; stunnedUntil: number }
  | { type: 'dash'; player: number; t: number; reactionMs: number }
  | { type: 'poop'; player: number; t: number; reactionMs: number }
  | { type: 'fakeDash'; player: number; t: number }
  | { type: 'fakeLid'; t: number; durationMs: number }
  | { type: 'resolved'; t: number; result: RoundResult };

const SCORE_EPSILON = 1e-6;

export class MatchMachine {
  phase: Phase = 'intro';
  phaseStart: number;
  round = 1;
  /** true durante i round di spareggio a morte improvvisa. */
  suddenDeath = false;
  readonly scores: number[];
  players: PlayerRoundState[] = [];
  content!: BowlContent;
  /** Istante del primo frame renderizzato con il coperchio aperto (t0 delle reazioni). */
  revealShownAt: number | null = null;
  lastResult: RoundResult | null = null;
  /** Classifica finale (indici giocatori, dal primo all'ultimo). */
  standings: number[] | null = null;

  private circlingMs = 0;
  /** Istanti assoluti delle finte del coperchio ancora da eseguire. */
  private pendingFakeLids: number[] = [];
  private skipNext: boolean[];
  private events: RoundEvent[] = [];

  constructor(
    readonly config: MatchConfig,
    private readonly rng: Rng,
    startTime: number,
  ) {
    this.scores = new Array<number>(config.playerCount).fill(0);
    this.skipNext = new Array<boolean>(config.playerCount).fill(false);
    this.phaseStart = startTime;
    this.startRound(startTime, null);
  }

  get isPoopRound(): boolean {
    return this.content.id === this.config.poopId;
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
      case 'final':
        return Infinity;
    }
  }

  /** Fa avanzare fasi e finte del coperchio fino all'istante `t` (incluso). */
  advanceTo(t: number): void {
    for (;;) {
      const end = this.phaseEndsAt();
      const fake = this.pendingFakeLids[0] ?? Infinity;
      if (fake <= t && fake < end) {
        this.pendingFakeLids.shift();
        this.events.push({ type: 'fakeLid', t: fake, durationMs: this.config.fakeLid.durationMs });
      } else if (end <= t && Number.isFinite(end)) {
        this.next(end);
      } else {
        return;
      }
    }
  }

  /** Chiamato dal rendering nel primo frame che mostra il coperchio aperto. */
  markRevealShown(t: number): void {
    if (this.phase === 'dash' && this.revealShownAt === null) this.revealShownAt = t;
  }

  input(player: number, action: PlayerAction, t: number): void {
    if (player < 0 || player >= this.config.playerCount) return;
    this.advanceTo(t);
    const p = this.players[player];
    if (!p.active) return;
    if (action === 'fake') return this.fakeDash(player, p, t);

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
      if (this.isPoopRound) {
        p.grabbedPoop = true;
        this.events.push({ type: 'poop', player, t, reactionMs: p.reactionMs });
      } else {
        this.events.push({ type: 'dash', player, t, reactionMs: p.reactionMs });
      }
      if (this.players.every((pl) => !pl.active || pl.reactionMs !== null)) this.next(t);
    }
    // intro / resolve / end / final: pressione ignorata
  }

  /** Restituisce e svuota gli eventi accumulati (per animazioni e HUD). */
  drainEvents(): RoundEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private fakeDash(player: number, p: PlayerRoundState, t: number): void {
    if (this.phase !== 'circling' || t < p.stunnedUntil) return;
    if (t - p.lastFakeAt < this.config.fakeDashCooldownMs) return;
    p.lastFakeAt = t;
    this.events.push({ type: 'fakeDash', player, t });
  }

  /** `contenders` = giocatori ammessi allo spareggio, `null` per un round normale. */
  private startRound(t: number, contenders: number[] | null): void {
    const c = this.config;
    this.players = Array.from({ length: c.playerCount }, (_, i) => ({
      active: contenders ? contenders.includes(i) : !this.skipNext[i],
      stunnedUntil: -Infinity,
      reactionMs: null,
      grabbedPoop: false,
      lastFakeAt: -Infinity,
    }));
    this.skipNext.fill(false);
    // Nello spareggio niente cacchetta: deve uscire un vincitore.
    this.content = pickContent(this.rng, c.contents, c.poopId, !this.suddenDeath);
    this.circlingMs = this.rng.range(c.circlingMinMs, c.circlingMaxMs);
    const circlingStart = t + c.introMs;
    this.pendingFakeLids = planFakeLids(this.rng, this.round, this.circlingMs, c.fakeLid).map(
      (offset) => circlingStart + offset,
    );
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
        return this.afterRound(t);
      case 'final':
        return;
    }
  }

  private afterRound(t: number): void {
    if (this.round < this.config.roundCount) {
      this.round++;
      return this.startRound(t, null);
    }
    const best = Math.max(...this.scores);
    const leaders = this.scores.flatMap((s, i) => (best - s < SCORE_EPSILON ? [i] : []));
    if (leaders.length > 1) {
      this.suddenDeath = true;
      this.round++;
      return this.startRound(t, leaders);
    }
    this.standings = this.scores
      .map((s, i) => ({ s, i }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.i);
    this.enter('final', t);
  }

  private enter(phase: Phase, t: number): void {
    this.phase = phase;
    this.phaseStart = t;
    this.events.push({ type: 'phase', phase, t, round: this.round });
  }

  private resolve(t: number): void {
    const reactions = this.players.map((p) => (p.grabbedPoop ? null : p.reactionMs));
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

    // Cacchetta: salto del prossimo round, o punti in meno se è l'ultimo regolare.
    const poopVictims = this.players.flatMap((p, i) => (p.grabbedPoop ? [i] : []));
    const poopSkipsNext = this.round < this.config.roundCount;
    for (const v of poopVictims) {
      if (poopSkipsNext) this.skipNext[v] = true;
      else this.scores[v] += this.config.lastRoundPoopPenalty;
    }

    this.lastResult = {
      round: this.round,
      suddenDeath: this.suddenDeath,
      content: this.content,
      winners,
      pointsEach,
      reactions,
      poopVictims,
      poopSkipsNext,
    };
    this.events.push({ type: 'resolved', t, result: this.lastResult });
  }
}
