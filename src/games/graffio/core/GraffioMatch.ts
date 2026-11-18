import type { Rng } from '../../../core/Rng';
import { fallSpeed, graffioTuning, type GraffioTuning } from '../tuning';

/**
 * Logica di Graffio Killer, senza grafica.
 *
 * Ogni round: i tubi di cartone stanno sui trespoli con la tacca in vista
 * (`show`), salgono fuori quadro (`lift`), i gatti si mettono in posa e
 * aspettano un tempo casuale (`wait`), poi i tubi cadono a velocità costante,
 * uno dopo l'altro con un piccolo ritardo diverso per ognuno (`drop`).
 * Ogni gatto ha una sola zampata: il taglio avviene a quota fissa (`cutY`) e
 * conta la distanza tra il punto tagliato e la tacca. Tutto è calcolato dal
 * tempo (nessun passo fisso): il giudizio usa l'istante esatto della pressione.
 */

export type GraffioPhase = 'intro' | 'show' | 'lift' | 'wait' | 'drop' | 'result' | 'final';

/** Esito della zampata di un gatto in un round. */
export interface CutResult {
  player: number;
  /** Istante della zampata (ms di gioco); per chi non taglia è l'istante in cui il tubo arriva a terra. */
  t: number;
  /** Altezza del fondo del tubo nel momento del taglio (null se ha mancato il tubo). */
  bottom: number | null;
  /** Lunghezza del pezzo rimasto sotto il taglio (null se ha mancato il tubo). */
  stub: number | null;
  /** Scarto dalla tacca: positivo = tagliato sopra la tacca (in ritardo). Null se mancato. */
  distance: number | null;
  /** Scarto in ms (equivalente) per lo spareggio. */
  errMs: number;
  points: number;
  label: string;
  /**
   * `early`: zampata a vuoto prima che il tubo arrivi; `late`: tubo già a terra;
   * `none`: non ha tagliato.
   */
  whiff: 'early' | 'late' | 'none' | null;
}

export type GraffioEvent =
  | { type: 'phase'; phase: GraffioPhase; round: number; t: number }
  | { type: 'cut'; result: CutResult; t: number };

export interface GraffioConfig {
  playerCount: number;
  rounds: number;
}

export interface GraffioPress {
  player: number;
  t: number;
}

/** Fine di ogni fase a tempo, in ms dalla sua partenza. */
const ms = (s: number) => s * 1000;

export class GraffioMatch {
  phase: GraffioPhase = 'intro';
  phaseStart: number;
  /** Round in corso (0 = primo). */
  round = 0;
  /** Velocità di caduta del round (u/s). */
  speed = 0;
  /** Distanza della tacca dal fondo del tubo (uguale per tutti). */
  mark = 0;
  readonly scores: number[];
  /** Somma degli scarti in ms (spareggio: vince chi ne ha meno). */
  readonly errTotals: number[];
  /** Punti dell'ultimo round. */
  readonly lastPoints: number[];
  /** Taglio di ogni gatto nel round in corso (null = non ancora). */
  cuts: (CutResult | null)[];
  /** Istante in cui comincia a cadere il tubo di ogni gatto. */
  dropStart: number[];
  standings: number[] | null = null;
  winners: number[] = [];

  private waitEnd = 0;
  private pendingWait = 0;
  private pendingOrder: number[] = [];
  private events: GraffioEvent[] = [];

  constructor(
    readonly config: GraffioConfig,
    private readonly rng: Rng,
    now: number,
    private readonly t: GraffioTuning = graffioTuning,
  ) {
    const n = config.playerCount;
    this.scores = new Array<number>(n).fill(0);
    this.errTotals = new Array<number>(n).fill(0);
    this.lastPoints = new Array<number>(n).fill(0);
    this.cuts = new Array<CutResult | null>(n).fill(null);
    this.dropStart = new Array<number>(n).fill(Infinity);
    this.phaseStart = now;
    this.setupRound();
    this.events.push({ type: 'phase', phase: 'intro', round: 0, t: now });
  }

  drainEvents(): GraffioEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  get roundCount(): number {
    return this.config.rounds;
  }

  hasCut(player: number): boolean {
    return this.cuts[player] !== null;
  }

  /** Istante in cui la tacca del gatto incrocia la quota di taglio. */
  crossTime(player: number): number {
    const g = this.t.geometry;
    return this.dropStart[player] + ((g.holdY - g.cutY + this.mark) / this.speed) * 1000;
  }

  /** Istante in cui il tubo del gatto arriva a terra (se non viene tagliato). */
  restTime(player: number): number {
    return this.dropStart[player] + (this.t.geometry.holdY / this.speed) * 1000;
  }

  /** Quota del fondo del tubo (prima del taglio) all'istante `t`. */
  bottomAt(player: number, t: number): number {
    const g = this.t.geometry;
    switch (this.phase) {
      case 'intro':
      case 'show':
        return 0;
      case 'lift': {
        const k = Math.min(1, Math.max(0, (t - this.phaseStart) / ms(this.t.timing.lift)));
        return g.holdY * (k * k * (3 - 2 * k));
      }
      default: {
        const fell = Math.max(0, t - this.dropStart[player]) / 1000;
        return Math.max(0, g.holdY - this.speed * fell);
      }
    }
  }

  /** Avanza al tempo `now` applicando le zampate (con i loro istanti esatti). */
  advanceTo(now: number, presses: readonly GraffioPress[] = []): void {
    const queue = [...presses].sort((a, b) => a.t - b.t);
    for (let guard = 0; guard < 100; guard++) {
      const end = this.phaseEnd();
      const limit = Math.min(end, now);
      while (queue.length > 0 && queue[0].t <= limit) {
        const p = queue.shift()!;
        this.press(p.player, Math.max(p.t, this.phaseStart));
      }
      if (end > now) break;
      this.transition(end);
    }
  }

  /** Fine della fase corrente. */
  private phaseEnd(): number {
    const tm = this.t.timing;
    switch (this.phase) {
      case 'intro':
        return this.phaseStart + ms(tm.intro);
      case 'show':
        return this.phaseStart + ms(tm.show);
      case 'lift':
        return this.phaseStart + ms(tm.lift);
      case 'wait':
        return this.waitEnd;
      case 'drop': {
        // Finisce poco dopo l'ultimo taglio o l'ultimo tubo che arriva a terra.
        let last = this.phaseStart;
        for (let p = 0; p < this.config.playerCount; p++) {
          last = Math.max(last, this.cuts[p]?.t ?? this.restTime(p));
        }
        return last + ms(tm.settle);
      }
      case 'result':
        return this.phaseStart + ms(tm.result);
      case 'final':
        return Infinity;
    }
  }

  private transition(at: number): void {
    switch (this.phase) {
      case 'intro':
        this.enter('show', at);
        break;
      case 'show':
        this.enter('lift', at);
        break;
      case 'lift':
        this.enter('wait', at);
        break;
      case 'wait':
        this.enter('drop', at);
        break;
      case 'drop':
        this.closeRound(at);
        this.enter('result', at);
        break;
      case 'result':
        if (this.round + 1 < this.config.rounds) {
          this.round++;
          this.setupRound();
          this.enter('show', at);
        } else {
          this.finish();
          this.enter('final', at);
        }
        break;
      case 'final':
        break;
    }
  }

  private enter(phase: GraffioPhase, at: number): void {
    this.phase = phase;
    this.phaseStart = at;
    if (phase === 'wait') this.armDrop(at);
    this.events.push({ type: 'phase', phase, round: this.round, t: at });
  }

  /** Estrae tacca, attesa e ritardi di caduta del round (ordine fisso: riproducibile). */
  private setupRound(): void {
    const g = this.t.geometry;
    const tm = this.t.timing;
    const n = this.config.playerCount;
    this.speed = fallSpeed(this.round, this.t);
    this.mark = this.rng.range(g.markMin, g.markMax);
    const wait = this.rng.range(tm.waitMin, tm.waitMax);
    // Ordine di caduta casuale, con un po' di variazione sul ritardo.
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    this.cuts = new Array<CutResult | null>(n).fill(null);
    this.lastPoints.fill(0);
    this.pendingWait = wait;
    this.pendingOrder = order;
    this.dropStart = new Array<number>(n).fill(Infinity);
  }

  /** Chiamata all'ingresso in `wait`: fissa gli istanti di caduta. */
  private armDrop(waitStart: number): void {
    const tm = this.t.timing;
    this.waitEnd = waitStart + ms(this.pendingWait);
    this.pendingOrder.forEach((player, rank) => {
      const jitter = this.rng.range(0, tm.staggerJitter);
      this.dropStart[player] = this.waitEnd + ms(rank * tm.staggerStep + jitter);
    });
  }

  /** Zampata del gatto all'istante `t` (ms di gioco). */
  private press(player: number, t: number): void {
    if (player < 0 || player >= this.config.playerCount) return;
    if (this.cuts[player] !== null) return;
    if (this.phase !== 'wait' && this.phase !== 'drop') return;
    const g = this.t.geometry;

    const bottom = this.bottomAt(player, t);
    const stub = g.cutY - bottom;
    // Il tubo non è ancora arrivato alla quota di taglio, o è già a terra: zampata a vuoto.
    if (stub < 0 || t < this.dropStart[player] || bottom <= 0) {
      const late = bottom <= 0 && t >= this.dropStart[player];
      this.record({
        player,
        t,
        bottom: null,
        stub: null,
        distance: null,
        errMs: Math.min(this.t.missErrorMs, Math.abs(this.crossTime(player) - t)),
        points: 0,
        label: late ? 'Troppo tardi' : 'Troppo presto',
        whiff: late ? 'late' : 'early',
      });
      return;
    }
    const distance = stub - this.mark;
    const band = this.t.scoring.find((b) => Math.abs(distance) <= b.maxDist);
    this.record({
      player,
      t,
      bottom,
      stub,
      distance,
      errMs: (Math.abs(distance) / this.speed) * 1000,
      points: band?.points ?? 0,
      label: band?.label ?? 'Fuori tacca',
      whiff: null,
    });
  }

  private record(result: CutResult): void {
    const p = result.player;
    this.cuts[p] = result;
    this.scores[p] += result.points;
    this.errTotals[p] += result.errMs;
    this.lastPoints[p] = result.points;
    this.events.push({ type: 'cut', result, t: result.t });
  }

  /** Fine del round: chi non ha tagliato prende 0 e lo scarto massimo. */
  private closeRound(at: number): void {
    for (let p = 0; p < this.config.playerCount; p++) {
      if (this.cuts[p] !== null) continue;
      this.record({
        player: p,
        t: Math.min(at, this.restTime(p)),
        bottom: null,
        stub: null,
        distance: null,
        errMs: this.t.missErrorMs,
        points: 0,
        label: 'Mancato',
        whiff: 'none',
      });
    }
  }

  private finish(): void {
    const order = this.scores.map((_, i) => i);
    order.sort(
      (a, b) => this.scores[b] - this.scores[a] || this.errTotals[a] - this.errTotals[b] || a - b,
    );
    this.standings = order;
    const top = order[0];
    this.winners = order.filter(
      (p) =>
        this.scores[p] === this.scores[top] &&
        Math.abs(this.errTotals[p] - this.errTotals[top]) < 0.5,
    );
  }
}
