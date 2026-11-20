import type { Rng } from '../../../core/Rng';
import type { Axis } from '../../../input/InputSource';
import { corsaTuning, type CorsaTuning } from '../tuning';
import { keepOnTrack, laneLength, lanePoint, project, type Vec } from './track';

/**
 * Logica di Corsa pazza, senza grafica: quattro gatti corrono insieme su una
 * pista ad anello (vedi track.ts). Si guida con la direzione tenuta (croce,
 * levetta, tasti): il gatto gira il muso da quella parte e corre. A ogni giro
 * chi è dietro riceve cacchette da lasciare in pista: chi le pesta si ferma
 * a fare la faccia schifata. Vince il primo che finisce i giri.
 *
 * Passo fisso a 120 Hz: stessa partita (seed e comandi) = stesso esito.
 */

export type CorsaPhase = 'intro' | 'play' | 'final';

export interface Runner {
  pos: Vec;
  /** Direzione del muso (rad, 0 = verso +x, cresce verso +y cioè giù sullo schermo). */
  heading: number;
  speed: number;
  /** Spinta degli urti, si smorza da sola. */
  kick: Vec;
  /** Metri percorsi sulla mediana: 0 al traguardo, negativi sulla griglia. */
  dist: number;
  /** Quanto è largo rispetto alla mediana (positivo = verso lo steccato esterno). */
  off: number;
  /** Giri completati. */
  laps: number;
  /** Cacchette in riserva. */
  traps: number;
  /** Stordito fino a (ms), da quando; protetto da altre cacchette fino a. */
  stunUntil: number;
  stunAt: number;
  graceUntil: number;
  dropReadyAt: number;
  /** Ultimo rilascio (ms), per l'animazione. */
  dropAt: number;
  /** Istante dell'arrivo (ms), null se in corsa. */
  finishedAt: number | null;
  /** Sta correndo l'ultimo giro (carica rotolante). */
  charging: boolean;
  lastS: number;
}

export interface Trap {
  id: number;
  owner: number;
  pos: Vec;
  bornAt: number;
  expiresAt: number;
}

export interface DropPress {
  player: number;
  t: number;
}

export type CorsaEvent =
  | { type: 'phase'; phase: CorsaPhase; t: number }
  | { type: 'lap'; player: number; lap: number; rank: number; gained: number; t: number }
  | { type: 'lastLap'; player: number; t: number }
  | { type: 'drop'; player: number; trap: number; x: number; y: number; t: number }
  | { type: 'stun'; player: number; owner: number; trap: number; x: number; y: number; t: number }
  | { type: 'expire'; trap: number; t: number }
  | { type: 'bump'; a: number; b: number; x: number; y: number; t: number }
  | { type: 'finish'; player: number; place: number; t: number };

export interface CorsaConfig {
  playerCount: number;
  laps: number;
  tuning?: CorsaTuning;
}

export const STEP_S = 1 / 120;
export const STEP_MS = 1000 * STEP_S;
export const NO_DIRECTION: Axis = { x: 0, y: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrapAngle = (a: number) => {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  else if (x <= -Math.PI) x += 2 * Math.PI;
  return x;
};
/** Soglia della direzione tenuta: sotto, il gatto frena. */
const DEADZONE = 0.2;

export class CorsaMatch {
  readonly t: CorsaTuning;
  phase: CorsaPhase = 'intro';
  phaseStart: number;
  time: number;
  /** Inizio della corsa vera (dopo "pronti… via!"). */
  playStart = 0;
  readonly runners: Runner[];
  traps: Trap[] = [];
  /** Corsia di partenza di ogni gatto (0 = la più interna). */
  readonly lanes: number[];
  /** Ordine d'arrivo (slot), finora. */
  finishOrder: number[] = [];
  /** Classifica finale (slot dal primo all'ultimo). */
  standings: number[] | null = null;
  winner: number | null = null;
  /** Lunghezza di un giro. */
  readonly lapLength: number;
  private events: CorsaEvent[] = [];
  private nextTrapId = 1;
  private bumpAt = new Map<number, number>();
  private lastLapAnnounced = false;

  constructor(
    readonly config: CorsaConfig,
    rng: Rng,
    now: number,
  ) {
    this.t = config.tuning ?? corsaTuning;
    this.time = now;
    this.phaseStart = now;
    this.lapLength = laneLength(this.t);

    // Corsie sorteggiate: nessuno parte sempre all'interno.
    const order = Array.from({ length: config.playerCount }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    this.lanes = new Array<number>(config.playerCount);
    order.forEach((player, lane) => (this.lanes[player] = lane));

    const n = config.playerCount;
    this.runners = this.lanes.map((lane) => {
      const off = (lane - (n - 1) / 2) * ((this.t.track.width - 1) / Math.max(1, n - 1));
      const back = this.t.race.gridBack + (lane % 2) * 0.7;
      const p = lanePoint(this.lapLength - back, off, this.t);
      const s = project(p, this.t).s;
      return {
        pos: { x: p.x, y: p.y },
        heading: Math.atan2(p.ty, p.tx),
        speed: 0,
        kick: { x: 0, y: 0 },
        dist: s - this.lapLength,
        off,
        laps: 0,
        traps: 0,
        stunUntil: -Infinity,
        stunAt: -Infinity,
        graceUntil: -Infinity,
        dropReadyAt: -Infinity,
        dropAt: -Infinity,
        finishedAt: null,
        charging: false,
        lastS: s,
      };
    });
    this.events.push({ type: 'phase', phase: 'intro', t: now });
  }

  drainEvents(): CorsaEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Il gatto è stordito in questo istante. */
  stunned(player: number, now: number = this.time): boolean {
    return now < this.runners[player].stunUntil;
  }

  /**
   * Classifica attuale (slot dal primo all'ultimo): chi ha tagliato il
   * traguardo, nell'ordine; poi gli altri per strada fatta.
   */
  ranking(): number[] {
    const order = this.runners.map((_, i) => i);
    return order.sort((a, b) => {
      const ra = this.runners[a];
      const rb = this.runners[b];
      if (ra.finishedAt !== null || rb.finishedAt !== null) {
        if (ra.finishedAt === null) return 1;
        if (rb.finishedAt === null) return -1;
        return ra.finishedAt - rb.finishedAt || a - b;
      }
      return rb.dist - ra.dist || a - b;
    });
  }

  /** Posizione (0 = primo) di un gatto. */
  rankOf(player: number): number {
    return this.ranking().indexOf(player);
  }

  /** Giro in corso (1…laps) di un gatto, 0 se non è ancora partito. */
  currentLap(player: number): number {
    const r = this.runners[player];
    return r.dist < 0 ? 0 : Math.min(this.config.laps, r.laps + 1);
  }

  /**
   * Avanza la simulazione fino a `now` a passi fissi. `controls(player)` dà la
   * direzione tenuta a ogni passo; i rilasci valgono dal passo del loro istante.
   */
  advanceTo(
    now: number,
    controls: (player: number) => Axis,
    drops: readonly DropPress[] = [],
  ): void {
    const queue = [...drops].sort((a, b) => a.t - b.t);
    let q = 0;
    const press = (d: DropPress) => this.drop(d.player, Math.max(this.time, d.t));
    while (this.time + STEP_MS <= now) {
      const stepTime = this.time + STEP_MS;
      while (q < queue.length && queue[q].t <= stepTime) press(queue[q++]);
      this.step(stepTime, controls);
    }
    while (q < queue.length) press(queue[q++]);
  }

  /** Lascia una cacchetta dietro di sé, se ne ha. */
  drop(player: number, t: number): void {
    const r = this.runners[player];
    if (!r || this.phase !== 'play' || r.finishedAt !== null) return;
    if (r.traps <= 0 || t < r.dropReadyAt || t < r.stunUntil) return;
    const k = this.t.runner.radius + this.t.trap.radius + 0.1;
    const pos = { x: r.pos.x - Math.cos(r.heading) * k, y: r.pos.y - Math.sin(r.heading) * k };
    keepOnTrack(pos, this.t.trap.radius, this.t);
    r.traps--;
    r.dropReadyAt = t + this.t.trap.cooldownMs;
    r.dropAt = t;
    const trap: Trap = {
      id: this.nextTrapId++,
      owner: player,
      pos,
      bornAt: t,
      expiresAt: t + this.t.trap.life * 1000,
    };
    this.traps.push(trap);
    this.events.push({ type: 'drop', player, trap: trap.id, x: pos.x, y: pos.y, t });
  }

  private step(now: number, controls: (player: number) => Axis): void {
    this.time = now;
    if (this.phase === 'intro') {
      if (now - this.phaseStart >= this.t.race.intro * 1000) {
        this.phase = 'play';
        this.phaseStart = now;
        this.playStart = now;
        this.events.push({ type: 'phase', phase: 'play', t: now });
      } else return;
    }
    if (this.phase !== 'play') return;

    this.runners.forEach((r, i) => this.moveRunner(r, controls(i), now));
    this.collideRunners(now);
    this.runners.forEach((r, i) => {
      const wall = keepOnTrack(r.pos, this.t.runner.radius, this.t);
      if (wall) {
        // Strisciare contro lo steccato frena in proporzione a quanto ci si va contro.
        const into = Math.cos(r.heading) * wall.x + Math.sin(r.heading) * wall.y;
        if (into < 0) r.speed *= 1 + into * this.t.runner.wallDrag;
      }
      this.track(r, i, now);
    });
    this.hitTraps(now);
    for (const trap of [...this.traps]) {
      if (now >= trap.expiresAt) {
        this.traps = this.traps.filter((x) => x !== trap);
        this.events.push({ type: 'expire', trap: trap.id, t: now });
      }
    }
  }

  private moveRunner(r: Runner, axis: Axis, now: number): void {
    const { runner: T } = this.t;
    const dt = STEP_S;
    if (r.finishedAt !== null) return;
    if (now < r.stunUntil) {
      // Stordito: si ferma di colpo.
      r.speed = Math.max(0, r.speed - T.decel * 3 * dt);
    } else {
      const mag = Math.min(1, Math.hypot(axis.x, axis.y));
      let target = 0;
      if (mag > DEADZONE) {
        const want = Math.atan2(axis.y, axis.x);
        const diff = wrapAngle(want - r.heading);
        const turn = T.turnRate * dt;
        r.heading = wrapAngle(r.heading + clamp(diff, -turn, turn));
        // Chi gira a fondo perde velocità: la traiettoria conta.
        const align = Math.max(0, Math.cos(diff));
        const boost = r.charging ? T.finalBoost : 1;
        target = T.maxSpeed * mag * (1 - T.turnDrag + T.turnDrag * align) * boost;
      }
      const rate = target > r.speed ? T.accel : T.decel;
      r.speed += clamp(target - r.speed, -rate * dt, rate * dt);
    }
    r.pos.x += (Math.cos(r.heading) * r.speed + r.kick.x) * dt;
    r.pos.y += (Math.sin(r.heading) * r.speed + r.kick.y) * dt;
    const decay = Math.exp(-T.kickDecay * dt);
    r.kick.x *= decay;
    r.kick.y *= decay;
  }

  /** Urti tra gatti: si separano, rimbalzano un po' e perdono abbrivio. */
  private collideRunners(now: number): void {
    const { runner: T } = this.t;
    const min = 2 * T.radius;
    const n = this.runners.length;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const ra = this.runners[a];
        const rb = this.runners[b];
        const dx = rb.pos.x - ra.pos.x;
        const dy = rb.pos.y - ra.pos.y;
        const d = Math.hypot(dx, dy);
        if (d >= min) continue;
        const nx = d > 1e-6 ? dx / d : 0;
        const ny = d > 1e-6 ? dy / d : 1;
        const push = (min - d) / 2;
        ra.pos.x -= nx * push;
        ra.pos.y -= ny * push;
        rb.pos.x += nx * push;
        rb.pos.y += ny * push;
        const va = {
          x: Math.cos(ra.heading) * ra.speed + ra.kick.x,
          y: Math.sin(ra.heading) * ra.speed + ra.kick.y,
        };
        const vb = {
          x: Math.cos(rb.heading) * rb.speed + rb.kick.x,
          y: Math.sin(rb.heading) * rb.speed + rb.kick.y,
        };
        const closing = (va.x - vb.x) * nx + (va.y - vb.y) * ny;
        if (closing > 0) {
          const j = ((1 + T.bounce) * closing) / 2;
          ra.kick.x -= nx * j;
          ra.kick.y -= ny * j;
          rb.kick.x += nx * j;
          rb.kick.y += ny * j;
          ra.speed *= T.bumpDrag;
          rb.speed *= T.bumpDrag;
          const key = a * 8 + b;
          if (now - (this.bumpAt.get(key) ?? -Infinity) > 300 && closing > 0.8) {
            this.bumpAt.set(key, now);
            this.events.push({
              type: 'bump',
              a,
              b,
              x: (ra.pos.x + rb.pos.x) / 2,
              y: (ra.pos.y + rb.pos.y) / 2,
              t: now,
            });
          }
        }
      }
    }
  }

  /** Giri e traguardo. */
  private track(r: Runner, i: number, now: number): void {
    if (r.finishedAt !== null) return;
    const L = this.lapLength;
    const p = project(r.pos, this.t);
    let delta = p.s - r.lastS;
    if (delta > L / 2) delta -= L;
    else if (delta < -L / 2) delta += L;
    r.lastS = p.s;
    r.dist += delta;
    r.off = p.off;

    const done = Math.floor(r.dist / L);
    // Contro la corrente non si guadagna nulla: i giri contano solo in avanti.
    if (done > r.laps) {
      r.laps = done;
      const lap = r.laps;
      const rank = this.ranking().indexOf(i);
      if (lap >= this.config.laps) {
        this.finish(r, i, now);
        return;
      }
      const award = this.t.trap.award[Math.min(rank, this.t.trap.award.length - 1)] ?? 0;
      const gained = Math.min(award, this.t.trap.max - r.traps);
      r.traps += gained;
      this.events.push({ type: 'lap', player: i, lap, rank, gained, t: now });
      if (lap === this.config.laps - 1) {
        r.charging = true;
        if (!this.lastLapAnnounced) {
          this.lastLapAnnounced = true;
          this.events.push({ type: 'lastLap', player: i, t: now });
        }
      }
    }
  }

  private finish(r: Runner, i: number, now: number): void {
    r.finishedAt = now;
    this.finishOrder.push(i);
    this.events.push({ type: 'finish', player: i, place: this.finishOrder.length, t: now });
    if (this.phase === 'play') {
      this.phase = 'final';
      this.phaseStart = now;
      this.winner = i;
      this.standings = this.ranking();
      this.events.push({ type: 'phase', phase: 'final', t: now });
    }
  }

  /** Chi pesta la cacchetta di un altro si ferma e fa la faccia schifata. */
  private hitTraps(now: number): void {
    if (this.phase !== 'play') return;
    const reach = this.t.runner.radius + this.t.trap.radius;
    this.runners.forEach((r, i) => {
      if (r.finishedAt !== null || now < r.stunUntil || now < r.graceUntil) return;
      for (const trap of this.traps) {
        if (trap.owner === i) continue; // le proprie si attraversano
        if (Math.hypot(trap.pos.x - r.pos.x, trap.pos.y - r.pos.y) >= reach) continue;
        this.traps = this.traps.filter((x) => x !== trap);
        r.stunAt = now;
        r.stunUntil = now + this.t.trap.stunMs;
        r.graceUntil = r.stunUntil + this.t.trap.graceMs;
        r.speed = 0;
        r.kick.x = 0;
        r.kick.y = 0;
        this.events.push({
          type: 'stun',
          player: i,
          owner: trap.owner,
          trap: trap.id,
          x: trap.pos.x,
          y: trap.pos.y,
          t: now,
        });
        return;
      }
    });
  }
}
