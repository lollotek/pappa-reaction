import * as THREE from 'three';
import type { CatBreed } from '../config/controls';

/**
 * Gatto low poly generato via codice, con animazioni procedurali.
 *
 * Orientamento: il gatto guarda verso +Z locale, poggia su y = 0.
 * Tutte le misure sono in unità mondo (gatto lungo ~1.3).
 * Per correggere l'aspetto basta modificare `LOOKS` o le costanti qui sotto.
 */

export type CatPose =
  'idle' | 'run' | 'dash' | 'eat' | 'bonk' | 'stunned' | 'yuck' | 'celebrate' | 'sad' | 'sit';

export interface CatLook {
  breed: CatBreed;
  /** 0/1: distingue i due gatti della stessa razza. */
  variant: 0 | 1;
  collar: string;
}

interface Colors {
  fur: string;
  furLight: string;
  white: string | null;
  eye: string;
  nose: string;
  earInner: string;
}

const LOOKS: Record<CatBreed, [Colors, Colors]> = {
  // Neri a pelo lungo (Priamo più nero, Mariù con riflessi bruni), occhi ambra.
  nero_pelolungo: [
    {
      fur: '#1e191d',
      furLight: '#3d2e2c',
      white: null,
      eye: '#f0b52e',
      nose: '#3a2c2e',
      earInner: '#5a3a3e',
    },
    {
      fur: '#2a1f1b',
      furLight: '#56402f',
      white: null,
      eye: '#e9c13a',
      nose: '#40302a',
      earInner: '#6a4440',
    },
  ],
  // Europei bianco e nero: occhi verde-giallo, naso rosa.
  tuxedo: [
    {
      fur: '#1b1a1f',
      furLight: '#2c2a31',
      white: '#f2eee6',
      eye: '#c8cf63',
      nose: '#e8a0a4',
      earInner: '#d98f96',
    },
    {
      fur: '#201e24',
      furLight: '#33303a',
      white: '#f4f0e8',
      eye: '#b9d35a',
      nose: '#eb9aa0',
      earInner: '#d98f96',
    },
  ],
};

const BODY_Y = 0.47;
const LEG_LEN = 0.36;

const mat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });

function mesh(geo: THREE.BufferGeometry, color: string): THREE.Mesh {
  return new THREE.Mesh(geo, mat(color));
}

interface Leg {
  pivot: THREE.Group;
  front: boolean;
  side: -1 | 1;
}

export class CatModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly ears: THREE.Group[] = [];
  private readonly eyes: THREE.Mesh[] = [];
  private readonly legs: Leg[] = [];
  private readonly tail: THREE.Group[] = [];
  private readonly tongue: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly longHair: boolean;
  /** Sfasa le animazioni tra un gatto e l'altro. */
  private readonly phase: number;

  constructor(look: CatLook) {
    const c = LOOKS[look.breed][look.variant];
    this.longHair = look.breed === 'nero_pelolungo';
    this.phase = look.variant * 1.7 + (this.longHair ? 0.6 : 0);
    const fluff = this.longHair ? 1.12 : 1;

    // Ombra a disco: resta a terra anche quando il gatto salta.
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 10),
      new THREE.MeshBasicMaterial({
        color: '#000',
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.set(0.85, 1.25, 1);
    this.root.add(this.shadow);

    // --- Corpo
    this.body.position.y = BODY_Y;
    this.root.add(this.body);
    const torso = mesh(new THREE.SphereGeometry(0.4, 7, 5), c.fur);
    torso.scale.set(0.82 * fluff, 0.78 * fluff, 1.28);
    this.body.add(torso);
    const back = mesh(new THREE.SphereGeometry(0.3, 6, 4), c.furLight);
    back.position.set(0, 0.14, -0.05);
    back.scale.set(0.9, 0.6, 1.4);
    this.body.add(back);

    if (c.white) {
      const chest = mesh(new THREE.SphereGeometry(0.25, 6, 4), c.white);
      chest.position.set(0, -0.06, 0.32);
      chest.scale.set(1, 1.1, 0.8);
      this.body.add(chest);
      const belly = mesh(new THREE.SphereGeometry(0.22, 6, 4), c.white);
      belly.position.set(0, -0.2, 0.05);
      belly.scale.set(1, 0.6, 1.6);
      this.body.add(belly);
      // Macchia bianca visibile dall'alto: sulla spalla (Poh) o sul posteriore (Tempesta).
      const patch = mesh(new THREE.SphereGeometry(0.22, 6, 4), c.white);
      patch.position.set(look.variant === 0 ? 0.12 : -0.1, 0.17, look.variant === 0 ? 0.2 : -0.26);
      patch.scale.set(1.1, 0.55, 1.2);
      this.body.add(patch);
    }
    if (this.longHair) {
      // Ciuffi di pelo: gorgiera, fianchi, "pantaloni" posteriori.
      const tufts: [number, number, number, number][] = [
        [0, -0.12, 0.36, 0.2],
        [0.22, -0.16, 0.12, 0.15],
        [-0.22, -0.16, 0.12, 0.15],
        [0.2, -0.12, -0.32, 0.17],
        [-0.2, -0.12, -0.32, 0.17],
      ];
      for (const [x, y, z, r] of tufts) {
        const t = mesh(new THREE.IcosahedronGeometry(r, 0), c.furLight);
        t.position.set(x, y, z);
        this.body.add(t);
      }
    }

    // Collare con campanellino.
    const collar = mesh(new THREE.TorusGeometry(0.2, 0.035, 4, 10), look.collar);
    collar.position.set(0, 0.17, 0.42);
    collar.rotation.x = Math.PI / 2 - 0.5;
    this.body.add(collar);
    const bell = mesh(new THREE.IcosahedronGeometry(0.05, 0), '#f2c94c');
    bell.position.set(0, 0.03, 0.56);
    this.body.add(bell);

    // --- Testa
    this.head.position.set(0, 0.3, 0.5);
    this.body.add(this.head);
    // Tuxedo: faccia bianca con "calotta" nera su fronte, orecchie e nuca.
    const skull = mesh(new THREE.SphereGeometry(0.28, 7, 5), c.white ?? c.fur);
    skull.scale.set(1.15, 0.95, 0.95);
    this.head.add(skull);
    if (c.white) {
      const cap = mesh(new THREE.SphereGeometry(0.29, 7, 5), c.fur);
      cap.position.set(0, 0.08, -0.05);
      cap.scale.set(1.16, 0.82, 0.92);
      this.head.add(cap);
    }
    if (this.longHair) {
      for (const side of [-1, 1]) {
        const cheek = mesh(new THREE.IcosahedronGeometry(0.13, 0), c.furLight);
        cheek.position.set(0.24 * side, -0.08, 0.02);
        this.head.add(cheek);
      }
    }
    if (c.white) {
      const muzzle = mesh(new THREE.SphereGeometry(0.13, 6, 4), c.white);
      muzzle.position.set(0, -0.09, 0.2);
      muzzle.scale.set(1.35, 0.85, 0.8);
      this.head.add(muzzle);
      if (look.variant === 1) {
        // Tempesta: lista bianca sulla fronte.
        const blaze = mesh(new THREE.BoxGeometry(0.08, 0.26, 0.06), c.white);
        blaze.position.set(0, 0.12, 0.22);
        blaze.rotation.x = -0.6;
        this.head.add(blaze);
      }
    }
    const nose = mesh(new THREE.BoxGeometry(0.06, 0.04, 0.03), c.nose);
    nose.position.set(0, -0.04, 0.28);
    this.head.add(nose);

    for (const side of [-1, 1]) {
      const eye = mesh(new THREE.BoxGeometry(0.075, 0.075, 0.02), c.eye);
      eye.position.set(0.11 * side, 0.05, 0.255);
      eye.rotation.y = 0.25 * side;
      const pupil = mesh(new THREE.BoxGeometry(0.025, 0.07, 0.01), '#111');
      pupil.position.z = 0.012;
      eye.add(pupil);
      this.head.add(eye);
      this.eyes.push(eye);

      const ear = new THREE.Group();
      ear.position.set(0.15 * side, 0.2, -0.02);
      ear.rotation.z = -0.25 * side;
      const outer = mesh(new THREE.ConeGeometry(0.11, 0.24, 4), c.fur);
      outer.position.y = 0.1;
      const inner = mesh(new THREE.ConeGeometry(0.06, 0.15, 3), c.earInner);
      inner.position.set(0, 0.07, 0.04);
      ear.add(outer, inner);
      if (this.longHair) {
        const tuft = mesh(new THREE.ConeGeometry(0.03, 0.1, 3), c.furLight);
        tuft.position.y = 0.25;
        ear.add(tuft);
      }
      this.head.add(ear);
      this.ears.push(ear);
    }

    this.tongue = mesh(new THREE.BoxGeometry(0.07, 0.02, 0.1), '#e2707e');
    this.tongue.position.set(0, -0.16, 0.26);
    this.tongue.visible = false;
    this.head.add(this.tongue);

    // --- Zampe: pivot all'anca/spalla, zampa che pende verso -Y.
    const legGeo = new THREE.CylinderGeometry(0.075 * fluff, 0.065, LEG_LEN, 5);
    for (const front of [true, false]) {
      for (const side of [-1, 1] as const) {
        const pivot = new THREE.Group();
        pivot.position.set(0.17 * side, -0.08, front ? 0.3 : -0.3);
        const leg = mesh(legGeo, c.fur);
        leg.position.y = -LEG_LEN / 2;
        const paw = mesh(new THREE.SphereGeometry(0.075, 5, 3), c.white ?? c.fur);
        paw.position.set(0, -LEG_LEN + 0.02, 0.03);
        paw.scale.set(1, 0.6, 1.3);
        pivot.add(leg, paw);
        this.body.add(pivot);
        this.legs.push({ pivot, front, side });
      }
    }

    // --- Coda: catena di segmenti lungo -Z; rotazione X positiva = verso l'alto.
    let parent: THREE.Object3D = this.body;
    const segLen = 0.17;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? 0.1 : 0, i === 0 ? -0.48 : -segLen);
      const r = (this.longHair ? 0.085 : 0.05) * (1 - i * 0.08);
      const piece = this.longHair
        ? mesh(new THREE.IcosahedronGeometry(r * 1.4, 0), i % 2 ? c.furLight : c.fur)
        : mesh(new THREE.CylinderGeometry(r, r * 0.9, segLen, 5), c.fur);
      // Pelo lungo: ciuffi allungati lungo la coda, che sembra un piumino.
      if (this.longHair) piece.scale.set(1, 0.9, 1.6);
      else piece.rotation.x = Math.PI / 2;
      piece.position.z = -segLen / 2;
      seg.add(piece);
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
    }
  }

  /**
   * Applica una posa. `t` = tempo in ms (per i cicli), `u` = tempo in ms
   * dall'inizio della posa (per le animazioni una tantum).
   */
  pose(pose: CatPose, t: number, u = 0): void {
    const s = t / 1000 + this.phase;
    this.neutral(s);

    switch (pose) {
      case 'idle':
        break;
      case 'run': {
        const f = s * 14;
        for (const leg of this.legs) {
          const diagonal = leg.front === (leg.side === 1) ? 1 : -1;
          leg.pivot.rotation.x = Math.sin(f) * 0.75 * diagonal;
        }
        this.body.position.y += Math.abs(Math.sin(f)) * 0.05;
        this.head.rotation.x = Math.sin(f * 2) * 0.05;
        this.tailWave(s * 7, 0.3, 0.3);
        break;
      }
      case 'dash': {
        const f = s * 22;
        this.body.scale.z = 1.12;
        this.body.rotation.x = 0.06;
        for (const leg of this.legs) {
          leg.pivot.rotation.x = (leg.front ? -1 : 1) * (0.9 + Math.sin(f) * 0.25);
        }
        this.earsBack(0.6);
        this.tailWave(s, 0, 0.05);
        break;
      }
      case 'eat':
        this.body.rotation.x = 0.18;
        this.head.rotation.x = 0.55 + Math.sin(s * 14) * 0.12;
        this.tailWave(s * 4, 0.45, 0.4);
        break;
      case 'bonk': {
        const k = Math.min(1, u / 200);
        this.body.rotation.x = -0.3 * (1 - k);
        this.head.rotation.x = -0.6 * (1 - k);
        for (const leg of this.legs) if (leg.front) leg.pivot.rotation.x = -0.7;
        this.earsBack(1);
        break;
      }
      case 'stunned':
        this.body.rotation.z = Math.sin(s * 18) * 0.22;
        this.head.rotation.z = Math.sin(s * 18 + 1.2) * 0.3;
        this.eyesOpen(0.25);
        this.earsBack(0.7);
        this.tailWave(s, -0.15, 0.05);
        break;
      case 'yuck':
        this.body.rotation.x = -0.22;
        this.head.rotation.y = Math.sin(s * 30) * 0.45;
        this.head.rotation.x = -0.25;
        this.tongue.visible = true;
        this.eyesOpen(0.3);
        this.earsBack(1);
        this.tailWave(s * 2, -0.25, 0.1);
        break;
      case 'celebrate': {
        this.body.rotation.x = -0.55;
        for (const leg of this.legs) {
          leg.pivot.rotation.x = leg.front ? -1.5 + Math.sin(s * 16 + leg.side) * 0.4 : 0.55;
        }
        this.eyesOpen(0.3);
        this.tailWave(s * 8, 0.55, 0.25);
        break;
      }
      case 'sad':
        this.sitDown();
        this.head.rotation.x = 0.95;
        this.earsBack(0.9);
        this.tailWave(s * 1.5, -0.3, 0.05);
        break;
      case 'sit':
        this.sitDown();
        this.tailWave(s * 2, 0.1, 0.15);
        break;
    }

    // L'ombra resta a terra anche durante salti e rimbalzi.
    this.shadow.position.y = (0.015 - this.root.position.y) / this.root.scale.y;
  }

  private neutral(s: number): void {
    this.body.position.set(0, BODY_Y, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.set(1, 1 + Math.sin(s * 3) * 0.015, 1);
    this.head.rotation.set(0, 0, 0);
    this.tongue.visible = false;
    for (const leg of this.legs) leg.pivot.rotation.set(0, 0, 0);
    this.ears.forEach((ear, i) => {
      const side = i === 0 ? -1 : 1;
      ear.rotation.set(0, 0, -0.25 * side);
    });
    // Battito di ciglia ogni ~3 s.
    this.eyesOpen(s % 3.3 < 0.12 ? 0.1 : 1);
    this.tailWave(s * 1.6, 0.24, 0.15);
  }

  /** Coda: `lift` curva verso l'alto per segmento, `sway` ampiezza laterale. */
  private tailWave(f: number, lift: number, sway: number): void {
    this.tail.forEach((seg, i) => {
      seg.rotation.x = lift;
      seg.rotation.y = Math.sin(f - i * 0.7) * sway;
    });
  }

  private earsBack(k: number): void {
    this.ears.forEach((ear, i) => {
      const side = i === 0 ? -1 : 1;
      ear.rotation.set(-0.6 * k, 0, (-0.25 - 0.7 * k) * side);
    });
  }

  private eyesOpen(k: number): void {
    for (const eye of this.eyes) eye.scale.y = k;
  }

  private sitDown(): void {
    this.body.position.set(0, BODY_Y - 0.08, -0.08);
    this.body.rotation.x = -0.55;
    for (const leg of this.legs) leg.pivot.rotation.x = leg.front ? 0.55 : -1.0;
    // La testa compensa l'inclinazione del corpo e resta dritta.
    this.head.rotation.x = 0.45;
  }
}
