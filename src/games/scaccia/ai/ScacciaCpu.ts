import type { Rng } from '../../../core/Rng';
import {
  SIDE_NORMAL,
  SIDE_TANGENT,
  SIDES,
  flyStep,
  paddleRange,
  type Ball,
  type PaddleControl,
  type ScacciaMatch,
  type SmashPress,
} from '../core/ScacciaMatch';
import type { ScacciaCpuProfile, ScacciaTuning } from '../tuning';

/** Passo e orizzonte della previsione delle traiettorie. */
const PREDICT_DT = 1 / 60;
const PREDICT_S = 3.5;
/** Quanto prima dell'impatto la CPU preme lo smash (s). */
const SMASH_LEAD = 0.07;
/** Per dare effetto: corsa laterale nell'ultimo tratto prima dell'impatto (s). */
const SPIN_RUN = 0.13;

export interface Arrival {
  ball: number;
  /** Punto lungo il lato in cui la palla arriva alla faccia del cuscino. */
  along: number;
  /** Fra quanto (s). */
  time: number;
}

/**
 * Dove e quando una palla arriva al cuscino del lato `side`, se ci arriva prima
 * di raggiungere un altro lato. `readsSpin = false`: ignora la curva (CPU facile).
 */
export function predictArrival(
  b: Ball,
  side: (typeof SIDES)[number],
  t: ScacciaTuning,
  now: number,
  readsSpin: boolean,
): Arrival | null {
  const ghost: Ball = {
    ...b,
    pos: { ...b.pos },
    dir: { ...b.dir },
    spin: readsSpin ? b.spin : 0,
  };
  const face = t.paddle.depth - t.paddle.radius - t.ball.radius;
  let time = Math.max(0, (b.launchAt - now) / 1000);
  for (let s = 0; s < PREDICT_S; s += PREDICT_DT) {
    flyStep(ghost, t, PREDICT_DT);
    time += PREDICT_DT;
    for (const other of SIDES) {
      const n = SIDE_NORMAL[other];
      const out = ghost.pos.x * n.x + ghost.pos.y * n.y;
      const toward = ghost.dir.x * n.x + ghost.dir.y * n.y;
      if (out >= face && toward > 0) {
        if (other !== side) return null;
        const tg = SIDE_TANGENT[side];
        return { ball: b.id, along: ghost.pos.x * tg.x + ghost.pos.y * tg.y, time };
      }
    }
  }
  return null;
}

interface Plan {
  ball: number;
  /** Punto in cui la CPU vuole avere il centro del cuscino. */
  target: number;
  /** Istante previsto dell'impatto (ms). */
  impactAt: number;
  smash: boolean;
  /** Effetto: verso della corsa laterale all'impatto (0 = niente effetto). */
  spinDir: number;
  /** Spostamento dal punto d'arrivo per colpire con la punta (mirare). */
  aim: number;
}

/**
 * Gatto controllato dal computer. Vede le palline come un umano (posizione,
 * direzione, velocità), ne prevede l'arrivo con un errore che cresce con la
 * distanza e rivede la mossa solo ogni `thinkMs` (il suo tempo di reazione).
 * Usa gli stessi comandi degli umani e la stessa velocità massima, ridotta.
 */
export class ScacciaCpu {
  private plan: Plan | null = null;
  private nextThinkAt = 0;
  private idleTarget = 0;
  private smashes: SmashPress[] = [];
  /** Palle per cui la CPU ha già deciso se fare lo smash. */
  private decided = new Set<number>();

  constructor(
    readonly player: number,
    private readonly profile: ScacciaCpuProfile,
    private readonly rng: Rng,
  ) {}

  /** Comandi per il prossimo tratto di simulazione. */
  control(now: number, m: ScacciaMatch): PaddleControl {
    if (m.phase !== 'play') return { axis: 0, target: null };
    if (now >= this.nextThinkAt) this.think(now, m);

    const p = m.paddles[this.player];
    const speed = this.profile.speedFactor;
    const plan = this.plan;
    let target = this.idleTarget;
    if (plan) {
      const left = (plan.impactAt - now) / 1000;
      if (left < -0.2) {
        this.plan = null;
      } else {
        if (plan.smash && left <= SMASH_LEAD && !this.decided.has(-plan.ball)) {
          this.decided.add(-plan.ball); // smash premuto per questa palla
          this.smashes.push({ player: this.player, t: now });
        }
        // Effetto: corsa laterale proprio all'impatto.
        if (plan.spinDir !== 0 && left <= SPIN_RUN && left > -0.05) {
          return { axis: plan.spinDir * speed, target: null };
        }
        target = plan.target - plan.spinDir * m.t.paddle.speed * speed * SPIN_RUN * 0.5;
      }
    }
    const gap = target - p.pos;
    return { axis: Math.max(-speed, Math.min(speed, gap * 5)), target: null };
  }

  /** Smash da premere (con il loro istante), una volta sola. */
  drainSmashes(): SmashPress[] {
    const out = this.smashes;
    this.smashes = [];
    return out;
  }

  private think(now: number, m: ScacciaMatch): void {
    // Tempo di reazione con un po' di variabilità.
    this.nextThinkAt = now + this.profile.thinkMs * (0.75 + this.rng.next() * 0.5);
    const side = m.paddles[this.player].side;
    let best: Arrival | null = null;
    for (const b of m.balls) {
      const a = predictArrival(b, side, m.t, now, this.profile.readsSpin);
      if (a && (!best || a.time < best.time)) best = a;
    }
    if (!best) {
      this.plan = null;
      // Senza minacce: torna verso il centro, con un po' di "nervosismo".
      this.idleTarget = (this.rng.next() * 2 - 1) * 0.35;
      return;
    }
    const range = paddleRange(m.t);
    const same = this.plan?.ball === best.ball;
    // Errore di previsione: cresce con l'anticipo; ricalcolato a ogni ripensamento.
    const error = gaussian(this.rng) * this.profile.errorSd * (0.35 + best.time);
    let aim = same ? this.plan!.aim : 0;
    if (!same && this.rng.next() < this.profile.aim) {
      // Colpire con la punta angola il rinvio verso un avversario.
      aim =
        (this.rng.next() < 0.5 ? -1 : 1) * m.t.paddle.halfLength * (0.3 + this.rng.next() * 0.35);
    }
    let smash = same ? this.plan!.smash : false;
    let spinDir = same ? this.plan!.spinDir : 0;
    if (!this.decided.has(best.ball)) {
      this.decided.add(best.ball);
      smash = this.rng.next() < this.profile.smashChance;
      spinDir =
        smash && this.rng.next() < this.profile.spinChance ? (this.rng.next() < 0.5 ? -1 : 1) : 0;
    }
    const target = Math.max(-range, Math.min(range, best.along + error - aim));
    this.plan = { ball: best.ball, target, impactAt: now + best.time * 1000, smash, spinDir, aim };
  }
}

/** Normale standard (Box-Muller) dal generatore con seed. */
function gaussian(rng: Rng): number {
  const u = Math.max(1e-9, rng.next());
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
