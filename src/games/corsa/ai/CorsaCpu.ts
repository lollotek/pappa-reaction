import type { Rng } from '../../../core/Rng';
import type { Axis } from '../../../input/InputSource';
import type { CorsaMatch, DropPress } from '../core/CorsaMatch';
import { lanePoint, project } from '../core/track';
import type { CorsaCpuProfile, CorsaTuning } from '../tuning';

/** Quanto davanti guarda per scegliere dove andare (unità mondo, più la velocità). */
const LOOK_BASE = 2.4;
const LOOK_SPEED = 0.28;
/** Distanza entro cui si accorge delle cacchette davanti. */
const NOTICE = 6;

/**
 * Pilota CPU di Corsa pazza: segue una corsia ai bordi dell'interno (con un po'
 * di ondeggiamento), scansa le cacchette degli altri e lascia le sue a chi la
 * insegue. Rivede la mossa solo ogni `thinkMs`: è il suo tempo di reazione.
 */
export class CorsaCpu {
  private axis: Axis = { x: 0, y: 0 };
  private nextThink = 0;
  private wander = 0;
  private offset = -1;
  private drops: DropPress[] = [];
  /** Cacchette già "viste": vero = le ha notate e le scansa. */
  private noticed = new Map<number, boolean>();

  constructor(
    readonly player: number,
    private readonly profile: CorsaCpuProfile,
    private readonly rng: Rng,
    private readonly tuning: CorsaTuning,
  ) {}

  /** Direzione da tenere (aggiornata ogni `thinkMs`). */
  control(m: CorsaMatch, now: number): Axis {
    if (now >= this.nextThink) {
      this.nextThink = now + this.profile.thinkMs;
      this.think(m, now);
    }
    return this.axis;
  }

  drainDrops(): DropPress[] {
    const out = this.drops;
    this.drops = [];
    return out;
  }

  private think(m: CorsaMatch, now: number): void {
    const { track, runner } = this.tuning;
    const me = m.runners[this.player];
    if (m.phase !== 'play' || me.finishedAt !== null) {
      this.axis = { x: 0, y: 0 };
      return;
    }
    const L = m.lapLength;
    const here = project(me.pos, this.tuning);
    const limit = track.width / 2 - runner.radius - 0.15;
    const wrap = (d: number) => {
      let x = d % L;
      if (x > L / 2) x -= L;
      else if (x < -L / 2) x += L;
      return x;
    };

    // Corsia: all'interno, con ondeggiamento che torna verso lo zero.
    this.wander = this.wander * 0.7 + (this.rng.next() - 0.5) * this.profile.laneNoise;
    let want = Math.max(-limit, Math.min(limit, -limit * 0.75 + this.wander));

    // Cacchette degli altri davanti: scansa se se ne accorge.
    for (const trap of m.traps) {
      if (trap.owner === this.player) continue;
      const tp = project(trap.pos, this.tuning);
      const ahead = wrap(tp.s - here.s);
      if (ahead < 0 || ahead > NOTICE) continue;
      let seen = this.noticed.get(trap.id);
      if (seen === undefined) {
        seen = this.rng.next() < this.profile.dodge;
        this.noticed.set(trap.id, seen);
      }
      if (!seen) continue;
      const gap = 0.5 + runner.radius + this.tuning.trap.radius;
      if (Math.abs(tp.off - want) < gap) {
        want = tp.off - want >= 0 ? tp.off - gap : tp.off + gap;
        // Non c'è spazio da quel lato: prova dall'altro.
        if (Math.abs(want) > limit) want = tp.off >= 0 ? tp.off - gap : tp.off + gap;
        want = Math.max(-limit, Math.min(limit, want));
      }
    }
    if (this.noticed.size > 40) this.noticed.clear();
    this.offset += (want - this.offset) * 0.6;

    const look = LOOK_BASE + me.speed * LOOK_SPEED;
    const target = lanePoint(here.s + look, this.offset, this.tuning);
    const dx = target.x - me.pos.x;
    const dy = target.y - me.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    const f = this.profile.speedFactor;
    this.axis = { x: (dx / len) * f, y: (dy / len) * f };

    this.maybeDrop(m, now, me.dist);
  }

  /** Cacchetta per chi ci insegue da vicino, nella nostra corsia. */
  private maybeDrop(m: CorsaMatch, now: number, myDist: number): void {
    const me = m.runners[this.player];
    if (me.traps <= 0 || m.stunned(this.player, now)) return;
    const chased = m.runners.some((r, i) => {
      if (i === this.player || r.finishedAt !== null) return false;
      const behind = myDist - r.dist;
      return behind > 0.9 && behind < 6 && Math.abs(r.off - me.off) < 1.3;
    });
    if (!chased) return;
    const full = me.traps >= this.tuning.trap.max;
    const p = (this.profile.dropChance * this.profile.thinkMs) / 400;
    if (full || this.rng.next() < p) this.drops.push({ player: this.player, t: now });
  }
}
