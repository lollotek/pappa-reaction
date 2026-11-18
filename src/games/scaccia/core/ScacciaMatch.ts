import type { Controller } from '../../../config/settings';
import type { Rng } from '../../../core/Rng';
import { scacciaTuning, type ScacciaTuning } from '../tuning';

/**
 * Logica di Scaccia la palla, senza grafica: campo, palline, cuscini, punti.
 *
 * Il campo è un quadrato (coordinate x, y; y è la profondità nella scena 3D)
 * con gli angoli smussati da cuscini diagonali. Ogni gatto difende un lato:
 * la sua "porta" è la linea del lato tra i due angoli. Il gatto muove il suo
 * cuscino a salsicciotto lungo il lato per respingere le palline.
 *
 * Passo fisso a 120 Hz: la stessa partita (seed e comandi) dà sempre lo stesso esito.
 */

/** Lati: 0 in basso (verso la camera), 1 a destra, 2 in alto, 3 a sinistra. */
export type Side = 0 | 1 | 2 | 3;
export const SIDES: readonly Side[] = [0, 1, 2, 3];

export interface Vec {
  x: number;
  y: number;
}

/**
 * Normale verso l'esterno e direzione "positiva" del cuscino per ogni lato.
 * La direzione segue lo schermo (destra per i lati in basso e in alto, giù per
 * quelli ai lati): i comandi restano gli stessi per chi gioca in alto.
 */
export const SIDE_NORMAL: Record<Side, Vec> = {
  0: { x: 0, y: 1 },
  1: { x: 1, y: 0 },
  2: { x: 0, y: -1 },
  3: { x: -1, y: 0 },
};
export const SIDE_TANGENT: Record<Side, Vec> = {
  0: { x: 1, y: 0 },
  1: { x: 0, y: 1 },
  2: { x: 1, y: 0 },
  3: { x: 0, y: 1 },
};

/** Ordine in cui i giocatori umani prendono i lati: in basso, in alto, poi ai lati. */
const HUMAN_SIDES: readonly Side[] = [0, 2, 3, 1];

/**
 * Lato di ogni gatto: gli umani (nell'ordine degli slot) in basso, in alto,
 * a sinistra e a destra; le CPU nei lati rimasti.
 */
export function assignSides(players: readonly Controller[]): Side[] {
  const sides: Side[] = new Array<Side>(players.length);
  const free = [...HUMAN_SIDES];
  players.forEach((c, i) => {
    if (c === 'human') sides[i] = free.shift()!;
  });
  players.forEach((c, i) => {
    if (c !== 'human') sides[i] = free.shift()!;
  });
  return sides;
}

export type BallKind = 'gomitolo' | 'sonaglio' | 'pompon';
const BALL_KINDS: readonly BallKind[] = ['gomitolo', 'sonaglio', 'pompon'];

export interface Ball {
  id: number;
  kind: BallKind;
  pos: Vec;
  /** Direzione (versore). */
  dir: Vec;
  /** Velocità attuale (con l'eventuale smash). */
  speed: number;
  /** Velocità "normale": cresce col tempo e a ogni rinvio. */
  baseSpeed: number;
  /** Ultimo gatto che l'ha toccata, null = palla neutra. */
  owner: number | null;
  /** Rotazione della traiettoria (rad/s), si smorza nel tempo. */
  spin: number;
  /** Colpita di smash e non ancora toccata da altri. */
  smashed: boolean;
  /** La palla trema al centro fino a questo istante (ms), poi parte. */
  launchAt: number;
  /** Istante dell'ultimo rinvio (ms), per le animazioni. */
  lastHitAt: number;
}

export interface PaddleState {
  side: Side;
  /** Posizione lungo il lato (0 = centro). */
  pos: number;
  /** Velocità lungo il lato. */
  vel: number;
  /** Ultima pressione di smash (ms). */
  smashAt: number;
  /** Prima del prossimo smash possibile (ms). */
  smashReadyAt: number;
}

/** Comandi di un gatto per un passo: direzione (−1..1) o punto da raggiungere. */
export interface PaddleControl {
  axis: number;
  /** Posizione voluta lungo il lato (striscia touch, CPU); ha la precedenza su `axis`. */
  target: number | null;
}

export const IDLE_CONTROL: PaddleControl = { axis: 0, target: null };

export interface SmashPress {
  player: number;
  t: number;
}

export type ScacciaPhase = 'intro' | 'play' | 'final';

export type ScacciaEvent =
  | { type: 'phase'; phase: ScacciaPhase; t: number }
  | { type: 'spawn'; ball: number; kind: BallKind; t: number }
  | { type: 'launch'; ball: number; t: number }
  | { type: 'swing'; player: number; t: number }
  | { type: 'hit'; ball: number; player: number; smash: boolean; spin: number; t: number }
  | { type: 'wall'; ball: number; x: number; y: number; t: number }
  | {
      type: 'goal';
      ball: number;
      kind: BallKind;
      side: Side;
      conceder: number;
      scorer: number | null;
      x: number;
      y: number;
      t: number;
    }
  | { type: 'suddenDeath'; t: number };

export interface ScacciaConfig {
  playerCount: number;
  /** Lato di ogni gatto. */
  sides: readonly Side[];
  /** Punti per vincere. */
  target: number;
  /** Durata della partita a tempo (ms), null = senza limite. */
  timeLimitMs: number | null;
  tuning?: ScacciaTuning;
}

/** Passo della simulazione. */
export const STEP_S = 1 / 120;
export const STEP_MS = 1000 * STEP_S;

const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rotate = (v: Vec, a: number): Vec => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};
const normalize = (v: Vec): Vec => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

/** Escursione massima del centro del cuscino (tra i due cuscini d'angolo). */
export function paddleRange(t: ScacciaTuning = scacciaTuning): number {
  const { half, corner } = t.field;
  const { depth, halfLength } = t.paddle;
  // Il cuscino d'angolo, alla profondità del cuscino, arriva a (half − corner) + (half − depth).
  return half - corner + (half - depth) - halfLength;
}

/**
 * Un passo di volo di una palla (spin, angoli). Usato dalla partita e dalla
 * previsione della CPU. Restituisce true se ha rimbalzato su un angolo.
 */
export function flyStep(b: Ball, t: ScacciaTuning, dtS: number, jitter = 0): boolean {
  const { half, corner } = t.field;
  const r = t.ball.radius;
  if (b.spin !== 0) {
    b.dir = rotate(b.dir, b.spin * dtS);
    b.spin *= Math.pow(0.5, dtS / t.smash.spinDecay);
    if (Math.abs(b.spin) < 0.01) b.spin = 0;
  }
  b.pos.x += b.dir.x * b.speed * dtS;
  b.pos.y += b.dir.y * b.speed * dtS;

  // Cuscini d'angolo: rette sx·x + sy·y = 2·half − corner, solo dentro il quadrato
  // (oltre la linea di porta la palla non rimbalza più: è già nella cuccia).
  const limit = 2 * half - corner;
  if (Math.abs(b.pos.x) > half || Math.abs(b.pos.y) > half) return false;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const along = (sx * b.pos.x + sy * b.pos.y) / Math.SQRT2;
      const dist = limit / Math.SQRT2 - along;
      const outward = (sx * b.dir.x + sy * b.dir.y) / Math.SQRT2;
      if (dist < r && outward > 0) {
        const n = { x: sx / Math.SQRT2, y: sy / Math.SQRT2 };
        const d = dot(b.dir, n);
        b.dir = normalize(rotate({ x: b.dir.x - 2 * d * n.x, y: b.dir.y - 2 * d * n.y }, jitter));
        // Fuori dal cuscino: la palla torna a contatto, non dentro.
        const push = r - dist;
        b.pos.x -= n.x * push;
        b.pos.y -= n.y * push;
        // Dopo lo specchio l'effetto gira al contrario (la curva si specchia anche lei).
        b.spin = -b.spin;
        return true;
      }
    }
  }
  return false;
}

export class ScacciaMatch {
  readonly t: ScacciaTuning;
  phase: ScacciaPhase = 'intro';
  phaseStart: number;
  /** Tempo simulato (ms). */
  time: number;
  scores: number[];
  paddles: PaddleState[];
  balls: Ball[] = [];
  /** Inizio del gioco vero (dopo "pronti… via!"), per il limite di tempo. */
  playStart = 0;
  suddenDeath = false;
  /** Classifica finale (slot dal primo all'ultimo). */
  standings: number[] | null = null;
  winner: number | null = null;
  /** Palle lanciate finora. */
  ballCount = 0;
  private nextSpawnAt = Infinity;
  private lastTargetSide: Side | null = null;
  private events: ScacciaEvent[] = [];
  /** Chi ha segnato per ultimo, per gli spareggi di classifica. */
  private lastGoalAt: number[];

  constructor(
    readonly config: ScacciaConfig,
    private readonly rng: Rng,
    now: number,
  ) {
    this.t = config.tuning ?? scacciaTuning;
    this.time = now;
    this.phaseStart = now;
    this.scores = Array.from({ length: config.playerCount }, () => 0);
    this.lastGoalAt = this.scores.map(() => -Infinity);
    this.paddles = config.sides.map((side) => ({
      side,
      pos: 0,
      vel: 0,
      smashAt: -Infinity,
      smashReadyAt: -Infinity,
    }));
    this.events.push({ type: 'phase', phase: 'intro', t: now });
  }

  /** Gatto che difende un lato. */
  playerAt(side: Side): number {
    return this.paddles.findIndex((p) => p.side === side);
  }

  /** Millisecondi di gioco rimasti (partita a tempo), null se senza limite. */
  timeLeft(now: number): number | null {
    if (this.config.timeLimitMs === null) return null;
    if (this.phase === 'intro') return this.config.timeLimitMs;
    if (this.phase === 'final')
      return Math.max(0, this.playStart + this.config.timeLimitMs - this.time);
    return Math.max(0, this.playStart + this.config.timeLimitMs - now);
  }

  drainEvents(): ScacciaEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /**
   * Avanza la simulazione fino a `now` a passi fissi. `controls(player)` dà i
   * comandi dei gatti a ogni passo; gli smash valgono dal passo del loro istante.
   */
  advanceTo(
    now: number,
    controls: (player: number) => PaddleControl,
    smashes: readonly SmashPress[] = [],
  ): void {
    const queue = [...smashes].sort((a, b) => a.t - b.t);
    let q = 0;
    const press = (s: SmashPress) => this.smash(s.player, Math.max(this.time, s.t));
    while (this.time + STEP_MS <= now) {
      const stepTime = this.time + STEP_MS;
      while (q < queue.length && queue[q].t <= stepTime) press(queue[q++]);
      this.step(stepTime, controls);
    }
    // Pressioni arrivate dopo l'ultimo passo: valgono dal prossimo.
    while (q < queue.length) press(queue[q++]);
  }

  /** Pressione di smash: la zampata colpisce per `smash.window` secondi. */
  smash(player: number, t: number): void {
    const p = this.paddles[player];
    if (!p || this.phase !== 'play' || t < p.smashReadyAt) return;
    p.smashAt = t;
    p.smashReadyAt = t + this.t.smash.cooldown * 1000;
    this.events.push({ type: 'swing', player, t });
  }

  /** Smash ancora "caldo" in questo istante. */
  swinging(player: number, now: number): boolean {
    const p = this.paddles[player];
    return now - p.smashAt <= this.t.smash.window * 1000;
  }

  private step(now: number, controls: (player: number) => PaddleControl): void {
    this.time = now;
    const dt = STEP_S;
    if (this.phase === 'intro') {
      if (now - this.phaseStart >= this.t.match.intro * 1000) this.startPlay(now);
      else return;
    }
    if (this.phase !== 'play') return;

    this.paddles.forEach((p, i) => this.movePaddle(p, controls(i), dt));
    this.spawnIfNeeded(now);

    for (const b of [...this.balls]) {
      if (now < b.launchAt) continue;
      if (b.launchAt > now - STEP_MS) this.events.push({ type: 'launch', ball: b.id, t: now });
      // Accelerazione col tempo.
      b.baseSpeed = Math.min(
        this.t.ball.maxSpeed,
        b.baseSpeed * (1 + this.t.ball.rampPerSecond * dt),
      );
      if (!b.smashed) b.speed = b.baseSpeed;
      const jitter = (this.rng.next() * 2 - 1) * this.t.ball.wallJitter;
      if (flyStep(b, this.t, dt, jitter)) {
        this.events.push({ type: 'wall', ball: b.id, x: b.pos.x, y: b.pos.y, t: now });
      }
      this.collidePaddles(b, now);
      this.checkGoal(b, now);
      if (this.phase !== 'play') return;
    }

    // Partita a tempo: allo scadere vince chi è in testa (se è uno solo).
    const left = this.timeLeft(now);
    if (left !== null && left <= 0) {
      if (this.uniqueLeader() !== null) this.finish(now);
      else if (!this.suddenDeath) {
        this.suddenDeath = true;
        this.events.push({ type: 'suddenDeath', t: now });
      }
    }
  }

  private startPlay(now: number): void {
    this.phase = 'play';
    this.phaseStart = now;
    this.playStart = now;
    this.events.push({ type: 'phase', phase: 'play', t: now });
    this.spawn(now);
  }

  private movePaddle(p: PaddleState, c: PaddleControl, dt: number): void {
    const { speed, accel } = this.t.paddle;
    const range = paddleRange(this.t);
    let want = clamp(c.axis, -1, 1) * speed;
    if (c.target !== null) {
      // Verso il punto voluto, frenando in arrivo.
      const gap = clamp(c.target, -range, range) - p.pos;
      want = clamp(gap * 14, -speed, speed);
    }
    const dv = clamp(want - p.vel, -accel * dt, accel * dt);
    p.vel += dv;
    p.pos += p.vel * dt;
    if (p.pos > range || p.pos < -range) {
      p.pos = clamp(p.pos, -range, range);
      p.vel = 0;
    }
  }

  private spawnIfNeeded(now: number): void {
    if (this.balls.length === 0) {
      this.spawn(now);
      return;
    }
    if (now >= this.nextSpawnAt && this.balls.length < this.t.spawn.max) this.spawn(now);
  }

  /** Palla nuova al centro, verso un lato a caso (mai due volte di fila lo stesso). */
  private spawn(now: number): void {
    const { half, corner } = this.t.field;
    const sides = SIDES.filter((s) => s !== this.lastTargetSide);
    const side = sides[Math.floor(this.rng.next() * sides.length)];
    this.lastTargetSide = side;
    const n = SIDE_NORMAL[side];
    const tg = SIDE_TANGENT[side];
    const along = (this.rng.next() * 2 - 1) * (half - corner) * 0.7;
    const dir = normalize({ x: n.x * half + tg.x * along, y: n.y * half + tg.y * along });
    const kind = BALL_KINDS[Math.floor(this.rng.next() * BALL_KINDS.length)];
    const ball: Ball = {
      id: ++this.ballCount,
      kind,
      pos: { x: 0, y: 0 },
      dir,
      speed: this.t.ball.launchSpeed,
      baseSpeed: this.t.ball.launchSpeed,
      owner: null,
      spin: 0,
      smashed: false,
      launchAt: now + this.t.spawn.tell * 1000,
      lastHitAt: -Infinity,
    };
    this.balls.push(ball);
    this.nextSpawnAt = now + this.t.spawn.interval * 1000;
    this.events.push({ type: 'spawn', ball: ball.id, kind, t: now });
  }

  /**
   * Il cuscino è una capsula (salsicciotto): la palla rimbalza appena lo tocca,
   * anche di punta o arrivando di lato dopo un cuscino d'angolo, purché il suo
   * centro non sia già dietro all'asse del cuscino.
   */
  private collidePaddles(b: Ball, now: number): void {
    const r = this.t.ball.radius;
    const { depth, halfLength, radius, maxAngle, carry, speed } = this.t.paddle;
    const core = halfLength - radius;
    this.paddles.forEach((p, player) => {
      const n = SIDE_NORMAL[p.side];
      const tg = SIDE_TANGENT[p.side];
      // Appena respinta da questo cuscino: niente doppio colpo.
      if (b.owner === player && now - b.lastHitAt < 150) return;
      const dn = dot(b.pos, n);
      if (dn > depth + 0.02) return; // già dietro al cuscino
      const along = dot(b.pos, tg);
      const closest = clamp(along, p.pos - core, p.pos + core);
      const rel = { t: along - closest, n: dn - depth };
      if (Math.hypot(rel.t, rel.n) > r + radius) return;
      // Deve venire verso il cuscino, non allontanarsene.
      if (dot(b.dir, tg) * rel.t + dot(b.dir, n) * rel.n >= 0) return;
      const offset = along - p.pos;

      const u = clamp(offset / halfLength, -1, 1);
      const moving = clamp(p.vel / speed, -1, 1);
      const smash = this.swinging(player, now);
      let angle = u * ((maxAngle * Math.PI) / 180) + moving * carry;
      let spin = 0;
      // Verso di rotazione che fa curvare la palla dalla parte in cui correva il cuscino.
      const curl = -n.x * tg.y + n.y * tg.x;
      if (smash && Math.abs(moving) > 0.25) {
        spin = curl * moving * this.t.smash.spinMax;
        angle -= moving * this.t.smash.spinCounter;
      }
      angle = clamp(angle, -1.25, 1.25);
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      b.dir = normalize({ x: -n.x * c + tg.x * s, y: -n.y * c + tg.y * s });
      // Di nuovo davanti al cuscino.
      const back = dn - (depth - radius - r);
      if (back > 0) {
        b.pos.x -= n.x * (back + 0.001);
        b.pos.y -= n.y * (back + 0.001);
      }

      b.baseSpeed = Math.min(this.t.ball.maxSpeed, b.baseSpeed * (1 + this.t.ball.hitBoost));
      b.smashed = smash;
      b.speed = smash
        ? Math.min(
            this.t.smash.maxSpeed,
            Math.max(this.t.smash.minSpeed, b.baseSpeed * this.t.smash.boost),
          )
        : b.baseSpeed;
      b.spin = spin;
      b.owner = player;
      b.lastHitAt = now;
      this.events.push({ type: 'hit', ball: b.id, player, smash, spin, t: now });
    });
  }

  private checkGoal(b: Ball, now: number): void {
    const { goal } = this.t.field;
    const r = this.t.ball.radius;
    for (const side of SIDES) {
      const n = SIDE_NORMAL[side];
      const out = dot(b.pos, n);
      // Gol quando la palla ha passato tutta la linea dietro al cuscino.
      if (out > goal + r) {
        this.goal(b, side, now);
        return;
      }
    }
  }

  private goal(b: Ball, side: Side, now: number): void {
    this.balls = this.balls.filter((x) => x !== b);
    const conceder = this.playerAt(side);
    // Chi la tocca per ultimo segna, ma non nella propria porta; la palla neutra non dà punti.
    const scorer = b.owner !== null && b.owner !== conceder ? b.owner : null;
    if (conceder >= 0) this.scores[conceder] = Math.max(0, this.scores[conceder] - 1);
    if (scorer !== null) {
      this.scores[scorer] += 1;
      this.lastGoalAt[scorer] = now;
    }
    this.events.push({
      type: 'goal',
      ball: b.id,
      kind: b.kind,
      side,
      conceder,
      scorer,
      x: b.pos.x,
      y: b.pos.y,
      t: now,
    });
    if (scorer !== null && this.scores[scorer] >= this.config.target) this.finish(now);
    else if (this.suddenDeath && this.uniqueLeader() !== null) this.finish(now);
  }

  /** Il gatto in testa da solo, o null se c'è parità in testa. */
  uniqueLeader(): number | null {
    const best = Math.max(...this.scores);
    const leaders = this.scores.flatMap((s, i) => (s === best ? [i] : []));
    return leaders.length === 1 ? leaders[0] : null;
  }

  private finish(now: number): void {
    this.phase = 'final';
    this.phaseStart = now;
    this.balls = [];
    this.standings = this.scores
      .map((s, i) => ({ s, i }))
      // A pari punti, prima chi ha segnato più di recente (è arrivato lì per ultimo… ma col gol).
      .sort((a, b) => b.s - a.s || this.lastGoalAt[b.i] - this.lastGoalAt[a.i] || a.i - b.i)
      .map((x) => x.i);
    this.winner = this.standings[0];
    this.events.push({ type: 'phase', phase: 'final', t: now });
  }
}
