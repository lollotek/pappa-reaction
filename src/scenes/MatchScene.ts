import * as THREE from 'three';
import type { PlayerSlot } from '../config/controls';
import type { MatchMachine, RoundEvent } from '../core/MatchMachine';
import { Arena } from '../render/Arena';
import { CatModel, type CatPose } from '../render/CatModel';
import { Fx } from '../render/Fx';

const TRACK_RADIUS = 3.4;
/** Raggio a cui il gatto si ferma davanti alla ciotola (muso sul bordo). */
const BOWL_RADIUS = 2.25;
/** Scala dei gatti rispetto al modello base. */
const CAT_SCALE = 1.2;
/** Dove siedono i gatti che saltano il turno (fuori dal tappeto). */
const BENCH_RADIUS = 5.6;
/** Velocità angolare sulla pista (rad/ms). */
const RUN_SPEED = 0.0008;
const DASH_MS = 220;
/** La finta ricalca lo scatto vero per questi ms, poi torna indietro. */
const FAKE_FORWARD_MS = 150;
const FAKE_BACK_MS = 220;
const BONK_IN_MS = 180;
const BONK_OUT_MS = 350;
/** Quanto mangia il vincitore prima di festeggiare. */
const EAT_MS = 1000;

const flat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);
const dashRadius = (ms: number) =>
  THREE.MathUtils.lerp(TRACK_RADIUS, BOWL_RADIUS, easeOut(clamp01(ms / DASH_MS)));

/** Rotazione Y per guardare lungo la pista (senso di marcia) o verso il centro. */
const faceRunning = (a: number) => -a;
const faceCenter = (a: number) => -a - Math.PI / 2;

interface RunnerVisual {
  cat: CatModel;
  stars: THREE.Group;
  stink: THREE.Group;
  dashAt: number | null;
  fakeAt: number | null;
  falseStartAt: number | null;
  stunnedUntil: number;
  /** Ha preso la cacchetta (nuvoletta fino alla fine del turno saltato). */
  stinky: boolean;
  poopAt: number | null;
}

/**
 * Scena della partita: legge lo stato della MatchMachine
 * e ne mostra l'esito. Non decide nulla del gioco.
 */
export class MatchScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
  readonly arena = new Arena();
  private readonly fx = new Fx();

  private readonly runners: RunnerVisual[] = [];
  private angle = 0;
  private lastNow: number | null = null;
  private fittedAspect = 0;
  private lidOpenedAt: number | null = null;
  private lidClosingAt: number | null = null;
  private fakeLid: { at: number; durationMs: number } | null = null;

  constructor(slots: readonly PlayerSlot[]) {
    this.scene.background = new THREE.Color('#2b2236');
    this.scene.add(new THREE.HemisphereLight('#fff4dc', '#5a4a52', 1.5));
    const sun = new THREE.DirectionalLight('#fff0d8', 1.5);
    sun.position.set(3, 10, 7);
    this.scene.add(sun, this.arena.group, this.fx.group);

    slots.forEach((slot, i) => this.runners.push(this.createRunner(slot, i)));
    this.fitCamera();
  }

  onEvent(e: RoundEvent): void {
    switch (e.type) {
      case 'phase':
        if (e.phase === 'intro') {
          for (const r of this.runners) {
            r.dashAt = null;
            r.fakeAt = null;
            r.falseStartAt = null;
            r.poopAt = null;
            r.stunnedUntil = 0;
          }
          this.lidOpenedAt = null;
          this.lidClosingAt = null;
          this.fakeLid = null;
        } else if (e.phase === 'dash') {
          this.lidOpenedAt = e.t;
          this.fakeLid = null;
        } else if (e.phase === 'end') {
          this.lidClosingAt = e.t;
        } else if (e.phase === 'final') {
          this.fx.confetti();
        }
        break;
      case 'falseStart':
        this.runners[e.player].falseStartAt = e.t;
        this.runners[e.player].stunnedUntil = e.stunnedUntil;
        this.fx.dust(this.runners[e.player].cat.root.position, 4);
        break;
      case 'dash':
        this.runners[e.player].dashAt = e.t;
        this.fx.dust(this.runners[e.player].cat.root.position);
        break;
      case 'poop':
        this.runners[e.player].dashAt = e.t;
        this.runners[e.player].poopAt = e.t;
        this.runners[e.player].stinky = true;
        this.fx.dust(this.runners[e.player].cat.root.position);
        break;
      case 'fakeDash':
        this.runners[e.player].fakeAt = e.t;
        this.fx.dust(this.runners[e.player].cat.root.position, 3);
        break;
      case 'fakeLid':
        this.fakeLid = { at: e.t, durationMs: e.durationMs };
        break;
      case 'resolved':
        break;
    }
  }

  /** True se il coperchio aperto è visibile in questo frame. */
  get lidIsOpen(): boolean {
    return this.lidOpenedAt !== null && this.lidClosingAt === null;
  }

  /** Nuova partita: toglie nuvolette e coriandoli rimasti. */
  reset(): void {
    for (const r of this.runners) r.stinky = false;
    this.fx.clear();
  }

  update(now: number, m: MatchMachine): void {
    const dt = this.lastNow === null ? 0 : Math.min(Math.max(now - this.lastNow, 0), 100);
    this.lastNow = now;
    if (this.camera.aspect !== this.fittedAspect) this.fitCamera();

    // I gatti girano tranne mentre il coperchio è aperto (musica ferma).
    const running = m.phase === 'intro' || m.phase === 'circling' || m.phase === 'end';
    if (running) this.angle += RUN_SPEED * dt;

    this.runners.forEach((r, i) => {
      const state = m.players[i];
      // La nuvoletta resta finché il gatto non torna in gioco.
      if (r.stinky && state.active && r.dashAt === null) r.stinky = false;

      if (m.phase === 'final') this.placeFinal(r, i, now, m);
      else if (!state.active) this.placeOnBench(r, i, now);
      else this.placeOnTrack(r, i, now, m, running);

      const stunned = now < r.stunnedUntil && m.phase !== 'final';
      r.stars.visible = stunned;
      r.stars.rotation.y = now * 0.008;
      this.showStink(r, now);
    });

    this.updateLidAndContent(now, m);
    this.arena.faceCamera(this.camera);
    this.fx.update(dt, this.camera);
  }

  /** Posizione mondo sopra la testa del gatto `i` (per le nuvolette HUD). */
  headPosition(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.runners[i].cat.root.position).add(new THREE.Vector3(0, 1.9, 0));
  }

  private placeOnTrack(
    r: RunnerVisual,
    i: number,
    now: number,
    m: MatchMachine,
    running: boolean,
  ): void {
    const a = this.angle + (i * Math.PI) / 2;
    const winners = m.phase === 'resolve' ? (m.lastResult?.winners ?? []) : [];
    const backK = m.phase === 'end' ? easeOut(clamp01((now - m.phaseStart) / m.config.endMs)) : 0;

    let radius = TRACK_RADIUS;
    let hop = 0;
    let facing = running ? faceRunning(a) : faceCenter(a);
    let pose: CatPose = running ? 'run' : 'idle';
    let poseU = 0;

    if (r.dashAt !== null) {
      const u = now - r.dashAt;
      radius = THREE.MathUtils.lerp(TRACK_RADIUS, dashRadius(u), 1 - backK);
      facing = faceCenter(a);
      if (m.phase === 'end') {
        pose = 'run';
        facing = faceCenter(a) + Math.PI; // torna in pista
        if (backK > 0.6) facing = faceRunning(a);
      } else if (u < DASH_MS) {
        pose = 'dash';
      } else if (r.poopAt !== null) {
        pose = 'yuck';
      } else if (winners.includes(i)) {
        const sinceResolve = now - m.phaseStart;
        pose = sinceResolve < EAT_MS ? 'eat' : 'celebrate';
        if (pose === 'celebrate') hop = Math.abs(Math.sin(sinceResolve * 0.012)) * 0.3;
      } else {
        pose = m.phase === 'resolve' ? 'sad' : 'idle';
      }
    } else if (r.falseStartAt !== null && now - r.falseStartAt < BONK_IN_MS + BONK_OUT_MS) {
      const u = now - r.falseStartAt;
      facing = faceCenter(a);
      if (u < BONK_IN_MS) {
        radius = THREE.MathUtils.lerp(TRACK_RADIUS, BOWL_RADIUS - 0.25, u / BONK_IN_MS);
        pose = 'dash';
      } else {
        const k = easeOut((u - BONK_IN_MS) / BONK_OUT_MS);
        radius = THREE.MathUtils.lerp(BOWL_RADIUS - 0.25, TRACK_RADIUS, k);
        hop = Math.sin(k * Math.PI) * 0.5;
        pose = 'bonk';
        poseU = u - BONK_IN_MS;
      }
    } else if (r.fakeAt !== null && now - r.fakeAt < FAKE_FORWARD_MS + FAKE_BACK_MS) {
      // Identica allo scatto vero per i primi 150 ms, poi rientra.
      const u = now - r.fakeAt;
      facing = faceCenter(a);
      pose = 'dash';
      const peak = dashRadius(FAKE_FORWARD_MS);
      radius =
        u < FAKE_FORWARD_MS
          ? dashRadius(u)
          : THREE.MathUtils.lerp(peak, TRACK_RADIUS, easeOut((u - FAKE_FORWARD_MS) / FAKE_BACK_MS));
    } else if (now < r.stunnedUntil) {
      pose = 'stunned';
    }

    r.cat.root.position.set(Math.cos(a) * radius, hop, Math.sin(a) * radius);
    r.cat.root.rotation.y = facing;
    r.cat.pose(pose, now, poseU);
  }

  private placeOnBench(r: RunnerVisual, i: number, now: number): void {
    // Seduto fuori dal tappeto, davanti al proprio angolo, a guardare gli altri.
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    r.cat.root.position.set(Math.cos(a) * BENCH_RADIUS, 0, Math.sin(a) * BENCH_RADIUS);
    r.cat.root.rotation.y = faceCenter(a);
    r.cat.pose(r.stinky ? 'sad' : 'sit', now);
  }

  private placeFinal(r: RunnerVisual, i: number, now: number, m: MatchMachine): void {
    const rank = m.standings?.indexOf(i) ?? 3;
    if (rank === 0) {
      // Il vincitore festeggia davanti alla ciotola, rivolto alla camera.
      r.cat.root.position.set(0, Math.abs(Math.sin(now * 0.008)) * 0.45, 3.3);
      r.cat.root.rotation.y = 0;
      r.cat.pose('celebrate', now);
      return;
    }
    // Gli altri ai lati del vincitore, rivolti verso di lui: 2° seduto, poi tristi.
    const spots: [number, number][] = [
      [-2.6, 2.4],
      [2.6, 2.4],
      [-4.2, 0.6],
    ];
    const [x, z] = spots[Math.max(0, rank - 1)] ?? spots[2];
    r.cat.root.position.set(x, 0, z);
    r.cat.root.rotation.y = Math.atan2(0 - x, 3.3 - z);
    r.cat.pose(rank === 1 ? 'sit' : 'sad', now);
  }

  private showStink(r: RunnerVisual, now: number): void {
    r.stink.visible = r.stinky;
    if (!r.stinky) return;
    r.stink.children.forEach((puff, k) => {
      const ph = now * 0.002 + k * 2.1;
      puff.position.set(
        Math.cos(ph) * 0.45,
        1.1 + ((now * 0.0006 + k * 0.33) % 1) * 0.8,
        Math.sin(ph) * 0.45,
      );
    });
  }

  private updateLidAndContent(now: number, m: MatchMachine): void {
    if (this.lidOpenedAt === null) {
      // Coperchio chiuso, eventualmente con una finta in corso: si solleva appena e ricade.
      let open = 0;
      let wobble = 0;
      if (this.fakeLid && now >= this.fakeLid.at) {
        const u = (now - this.fakeLid.at) / this.fakeLid.durationMs;
        if (u < 1) {
          open = Math.sin(u * Math.PI) * 0.12;
          wobble = Math.sin(now * 0.09) * 0.25 * (1 - u);
        }
      }
      this.arena.setLid(open, wobble);
      this.arena.setContent(null);
      return;
    }
    // Apertura istantanea (il frame di reveal deve già mostrare la pappa) + rimbalzo.
    const sinceOpen = now - this.lidOpenedAt;
    const wobble = Math.exp(-sinceOpen / 150) * Math.sin(sinceOpen / 30);
    let open = 1;
    if (this.lidClosingAt !== null) {
      open = 1 - easeOut(clamp01((now - this.lidClosingAt) / 400));
    }
    this.arena.setLid(open, this.lidClosingAt === null ? wobble : 0);

    // Chi vince "mangia" la pappa durante il resolve.
    let scale = 1;
    const eating =
      (m.phase === 'resolve' || m.phase === 'end') && (m.lastResult?.winners.length ?? 0) > 0;
    if (eating) {
      const resolveStart = m.phase === 'resolve' ? m.phaseStart : -Infinity;
      scale = 1 - clamp01((now - resolveStart - 200) / EAT_MS);
    }
    if (m.phase === 'end' || m.phase === 'final') scale = Math.min(scale, open);
    this.arena.setContent(m.content.id, scale, now);
  }

  private createRunner(slot: PlayerSlot, i: number): RunnerVisual {
    const cat = new CatModel({
      breed: slot.breed,
      variant: i % 2 === 0 ? 0 : 1,
      collar: slot.badgeColor,
    });

    // Stelline dello stordimento.
    const stars = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), flat('#ffe066'));
      const a = (k / 3) * Math.PI * 2;
      star.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
      stars.add(star);
    }
    stars.position.y = 1.5;
    stars.visible = false;

    // Nuvoletta puzzolente (cacchetta).
    const stink = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      stink.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), flat('#8fae4a')));
    }
    stink.visible = false;

    cat.root.scale.setScalar(CAT_SCALE);
    cat.root.add(stars, stink);
    this.scene.add(cat.root);
    return {
      cat,
      stars,
      stink,
      dashAt: null,
      fakeAt: null,
      falseStartAt: null,
      stunnedUntil: 0,
      stinky: false,
      poopAt: null,
    };
  }

  /** Camera fissa inclinata ~55°; si allontana su schermi più stretti del 16:9. */
  private fitCamera(): void {
    const tilt = THREE.MathUtils.degToRad(55);
    const dist = 16 * Math.max(1, 16 / 9 / this.camera.aspect);
    this.camera.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist);
    // Puntata un po' indietro per includere la parete del salotto.
    this.camera.lookAt(0, 0, -0.4);
    this.fittedAspect = this.camera.aspect;
  }
}
