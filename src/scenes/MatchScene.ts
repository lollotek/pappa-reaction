import * as THREE from 'three';
import type { PlayerSlot } from '../config/controls';
import type { RoundEvent, RoundMachine } from '../core/RoundMachine';
import { Arena } from '../render/Arena';

const TRACK_RADIUS = 3.4;
/** Raggio a cui il gatto si ferma davanti alla ciotola. */
const BOWL_RADIUS = 1.75;
/** Velocità angolare sulla pista (rad/ms). */
const RUN_SPEED = 0.0008;
const DASH_MS = 220;
const BONK_IN_MS = 180;
const BONK_OUT_MS = 350;

const flat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);

interface RunnerVisual {
  root: THREE.Group;
  body: THREE.Mesh;
  stars: THREE.Group;
  dashAt: number | null;
  falseStartAt: number | null;
  stunnedUntil: number;
}

/**
 * Scena greybox della partita: legge lo stato della RoundMachine
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

  constructor(slots: readonly PlayerSlot[]) {
    this.scene.background = new THREE.Color('#2b2236');
    this.scene.add(new THREE.HemisphereLight('#fff1d6', '#4a3a5a', 1.4));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(4, 10, 6);
    this.scene.add(sun, this.arena.group);

    // Segnaposto dei gatti: prisma + badge colorato + stelline dello stordimento.
    for (const slot of slots) {
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

      root.add(body, stars);
      this.scene.add(root);
      this.runners.push({ root, body, stars, dashAt: null, falseStartAt: null, stunnedUntil: 0 });
    }
    this.fitCamera();
  }

  onEvent(e: RoundEvent): void {
    switch (e.type) {
      case 'phase':
        if (e.phase === 'intro') {
          for (const r of this.runners) {
            r.dashAt = null;
            r.falseStartAt = null;
            r.stunnedUntil = 0;
          }
          this.lidOpenedAt = null;
          this.lidClosingAt = null;
        } else if (e.phase === 'dash') {
          this.lidOpenedAt = e.t;
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
      case 'resolved':
        break;
    }
  }

  /** True se il coperchio aperto è visibile in questo frame. */
  get lidIsOpen(): boolean {
    return this.lidOpenedAt !== null && this.lidClosingAt === null;
  }

  update(now: number, m: RoundMachine): void {
    const dt = this.lastNow === null ? 0 : Math.min(now - this.lastNow, 100);
    this.lastNow = now;
    if (this.camera.aspect !== this.fittedAspect) this.fitCamera();

    // I gatti girano tranne mentre il coperchio è aperto (musica ferma).
    const running = m.phase === 'intro' || m.phase === 'circling' || m.phase === 'end';
    if (running) this.angle += RUN_SPEED * dt;

    const winners = m.phase === 'resolve' ? (m.lastResult?.winners ?? []) : [];
    const backK = m.phase === 'end' ? easeOut(clamp01((now - m.phaseStart) / m.config.endMs)) : 0;

    this.runners.forEach((r, i) => {
      const a = this.angle + (i * Math.PI) / 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      let radius = TRACK_RADIUS;
      let hop = running ? Math.abs(Math.sin(now * 0.012 + i)) * 0.08 : 0;
      let wobble = 0;

      if (r.dashAt !== null) {
        const k = easeOut(clamp01((now - r.dashAt) / DASH_MS));
        radius = THREE.MathUtils.lerp(TRACK_RADIUS, BOWL_RADIUS, k * (1 - backK));
        if (winners.includes(i)) hop = Math.abs(Math.sin((now - m.phaseStart) * 0.012)) * 0.35;
      } else if (r.falseStartAt !== null) {
        const u = now - r.falseStartAt;
        if (u < BONK_IN_MS) {
          radius = THREE.MathUtils.lerp(TRACK_RADIUS, BOWL_RADIUS - 0.2, u / BONK_IN_MS);
        } else if (u < BONK_IN_MS + BONK_OUT_MS) {
          const k = easeOut((u - BONK_IN_MS) / BONK_OUT_MS);
          radius = THREE.MathUtils.lerp(BOWL_RADIUS - 0.2, TRACK_RADIUS, k);
          hop = Math.sin(k * Math.PI) * 0.5;
        }
      }

      const stunned = now < r.stunnedUntil;
      if (stunned) wobble = Math.sin(now * 0.025) * 0.3;
      r.stars.visible = stunned;
      r.stars.rotation.y = now * 0.008;

      r.root.position.set(dir.x * radius, hop, dir.z * radius);
      // Di lato durante la corsa, verso la ciotola durante lo scatto.
      r.root.rotation.y = -a + (r.dashAt !== null || !running ? Math.PI : Math.PI / 2);
      r.body.rotation.z = wobble;
    });

    this.updateLidAndContent(now, m);
    this.arena.faceCamera(this.camera);
  }

  /** Posizione mondo sopra la testa del gatto `i` (per le nuvolette HUD). */
  headPosition(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.runners[i].root.position).add(new THREE.Vector3(0, 1.5, 0));
  }

  private updateLidAndContent(now: number, m: RoundMachine): void {
    if (this.lidOpenedAt === null) {
      this.arena.setLid(0);
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
    if (m.phase === 'end') scale = Math.min(scale, open);
    this.arena.setContent(m.content.id, scale, now);
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
