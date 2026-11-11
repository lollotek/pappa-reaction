import * as THREE from 'three';
import type { PlayerSlot } from '../config/controls';
import type { MatchMachine, RoundEvent } from '../core/MatchMachine';
import { Arena } from '../render/Arena';

const TRACK_RADIUS = 3.4;
/** Raggio a cui il gatto si ferma davanti alla ciotola. */
const BOWL_RADIUS = 1.75;
/** Dove siedono i gatti che saltano il turno (fuori dal tappeto). */
const BENCH_RADIUS = 5.4;
/** Velocità angolare sulla pista (rad/ms). */
const RUN_SPEED = 0.0008;
const DASH_MS = 220;
/** La finta ricalca lo scatto vero per questi ms, poi torna indietro. */
const FAKE_FORWARD_MS = 150;
const FAKE_BACK_MS = 220;
const BONK_IN_MS = 180;
const BONK_OUT_MS = 350;

const flat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);
const dashRadius = (ms: number) =>
  THREE.MathUtils.lerp(TRACK_RADIUS, BOWL_RADIUS, easeOut(clamp01(ms / DASH_MS)));

interface RunnerVisual {
  root: THREE.Group;
  body: THREE.Mesh;
  stars: THREE.Group;
  stink: THREE.Group;
  dashAt: number | null;
  fakeAt: number | null;
  falseStartAt: number | null;
  stunnedUntil: number;
  /** Ha preso la cacchetta (nuvoletta fino alla fine del turno saltato). */
  stinky: boolean;
}

/**
 * Scena greybox della partita: legge lo stato della MatchMachine
 * e ne mostra l'esito. Non decide nulla del gioco.
 */
export class MatchScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
  readonly arena = new Arena();

  private readonly runners: RunnerVisual[] = [];
  private angle = 0;
  private lastNow: number | null = null;
  private fittedAspect = 0;
  private lidOpenedAt: number | null = null;
  private lidClosingAt: number | null = null;
  private fakeLid: { at: number; durationMs: number } | null = null;

  constructor(slots: readonly PlayerSlot[]) {
    this.scene.background = new THREE.Color('#2b2236');
    this.scene.add(new THREE.HemisphereLight('#fff1d6', '#4a3a5a', 1.4));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(4, 10, 6);
    this.scene.add(sun, this.arena.group);

    for (const slot of slots) this.runners.push(this.createRunner(slot));
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
        }
        break;
      case 'falseStart':
        this.runners[e.player].falseStartAt = e.t;
        this.runners[e.player].stunnedUntil = e.stunnedUntil;
        break;
      case 'dash':
        this.runners[e.player].dashAt = e.t;
        break;
      case 'poop':
        this.runners[e.player].dashAt = e.t;
        this.runners[e.player].stinky = true;
        break;
      case 'fakeDash':
        this.runners[e.player].fakeAt = e.t;
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

  /** Nuova partita: toglie le nuvolette rimaste. */
  reset(): void {
    for (const r of this.runners) r.stinky = false;
  }

  update(now: number, m: MatchMachine): void {
    const dt = this.lastNow === null ? 0 : Math.min(now - this.lastNow, 100);
    this.lastNow = now;
    if (this.camera.aspect !== this.fittedAspect) this.fitCamera();

    // I gatti girano tranne mentre il coperchio è aperto (musica ferma).
    const running = m.phase === 'intro' || m.phase === 'circling' || m.phase === 'end';
    if (running) this.angle += RUN_SPEED * dt;

    const finalWinner = m.phase === 'final' ? m.standings?.[0] : undefined;
    const winners = m.phase === 'resolve' ? (m.lastResult?.winners ?? []) : [];
    const backK = m.phase === 'end' ? easeOut(clamp01((now - m.phaseStart) / m.config.endMs)) : 0;

    this.runners.forEach((r, i) => {
      const state = m.players[i];
      // La nuvoletta resta finché il gatto non torna in gioco.
      if (r.stinky && state.active && r.dashAt === null) r.stinky = false;

      if (!state.active) {
        this.placeOnBench(r, i, now);
        return;
      }

      const a = this.angle + (i * Math.PI) / 2;
      let radius = TRACK_RADIUS;
      let hop = running ? Math.abs(Math.sin(now * 0.012 + i)) * 0.08 : 0;
      let towardBowl = r.dashAt !== null || !running;

      if (r.dashAt !== null) {
        radius = THREE.MathUtils.lerp(TRACK_RADIUS, dashRadius(now - r.dashAt), 1 - backK);
        if (winners.includes(i)) hop = Math.abs(Math.sin((now - m.phaseStart) * 0.012)) * 0.35;
      } else if (r.falseStartAt !== null && now - r.falseStartAt < BONK_IN_MS + BONK_OUT_MS) {
        const u = now - r.falseStartAt;
        towardBowl = true;
        if (u < BONK_IN_MS) {
          radius = THREE.MathUtils.lerp(TRACK_RADIUS, BOWL_RADIUS - 0.2, u / BONK_IN_MS);
        } else {
          const k = easeOut((u - BONK_IN_MS) / BONK_OUT_MS);
          radius = THREE.MathUtils.lerp(BOWL_RADIUS - 0.2, TRACK_RADIUS, k);
          hop = Math.sin(k * Math.PI) * 0.5;
        }
      } else if (r.fakeAt !== null && now - r.fakeAt < FAKE_FORWARD_MS + FAKE_BACK_MS) {
        // Identica allo scatto vero per i primi 150 ms, poi rientra.
        const u = now - r.fakeAt;
        towardBowl = true;
        const peak = dashRadius(FAKE_FORWARD_MS);
        radius =
          u < FAKE_FORWARD_MS
            ? dashRadius(u)
            : THREE.MathUtils.lerp(
                peak,
                TRACK_RADIUS,
                easeOut((u - FAKE_FORWARD_MS) / FAKE_BACK_MS),
              );
      }

      if (finalWinner === i) {
        radius = 0.001;
        hop = 1.9 + Math.abs(Math.sin(now * 0.008)) * 0.5; // sopra il coperchio, in festa
      }

      const stunned = now < r.stunnedUntil;
      r.stars.visible = stunned;
      r.stars.rotation.y = now * 0.008;
      r.body.rotation.z = stunned ? Math.sin(now * 0.025) * 0.3 : 0;
      this.showStink(r, now);

      r.root.position.set(Math.cos(a) * radius, hop, Math.sin(a) * radius);
      // Di lato durante la corsa, verso la ciotola durante scatti e finte.
      r.root.rotation.y = -a + (towardBowl ? Math.PI : Math.PI / 2);
    });

    this.updateLidAndContent(now, m);
    this.arena.faceCamera(this.camera);
  }

  /** Posizione mondo sopra la testa del gatto `i` (per le nuvolette HUD). */
  headPosition(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.runners[i].root.position).add(new THREE.Vector3(0, 1.5, 0));
  }

  private placeOnBench(r: RunnerVisual, i: number, now: number): void {
    // Seduto fermo fuori dal tappeto, davanti al proprio angolo.
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    r.root.position.set(Math.cos(a) * BENCH_RADIUS, 0, Math.sin(a) * BENCH_RADIUS);
    r.root.rotation.y = -a + Math.PI;
    r.body.rotation.z = 0;
    r.stars.visible = false;
    this.showStink(r, now);
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
      scale = 1 - clamp01((now - resolveStart - 300) / 700);
    }
    if (m.phase === 'end' || m.phase === 'final') scale = Math.min(scale, open);
    this.arena.setContent(m.content.id, scale, now);
  }

  private createRunner(slot: PlayerSlot): RunnerVisual {
    // Segnaposto: prisma + badge colorato + stelline (stordito) + nuvoletta (cacchetta).
    const root = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, 0.9, 6),
      flat(slot.breed === 'tuxedo' ? '#f2efe8' : '#1d1a1f'),
    );
    body.position.y = 0.45;
    const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), flat(slot.badgeColor));
    badge.position.y = 0.8;
    body.add(badge);

    const stars = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), flat('#ffe066'));
      const a = (i / 3) * Math.PI * 2;
      star.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
      stars.add(star);
    }
    stars.position.y = 1.45;
    stars.visible = false;

    const stink = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      stink.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), flat('#8fae4a')));
    }
    stink.visible = false;

    root.add(body, stars, stink);
    this.scene.add(root);
    return {
      root,
      body,
      stars,
      stink,
      dashAt: null,
      fakeAt: null,
      falseStartAt: null,
      stunnedUntil: 0,
      stinky: false,
    };
  }

  /** Camera fissa inclinata ~55°; si allontana su schermi più stretti del 16:9. */
  private fitCamera(): void {
    const tilt = THREE.MathUtils.degToRad(55);
    const dist = 16 * Math.max(1, 16 / 9 / this.camera.aspect);
    this.camera.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist);
    this.camera.lookAt(0, 0, 0.3);
    this.fittedAspect = this.camera.aspect;
  }
}
