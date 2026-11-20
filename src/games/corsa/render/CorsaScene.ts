import * as THREE from 'three';
import type { PlayerSlot } from '../../../config/controls';
import { Arena } from '../../../render/Arena';
import { CatModel, type CatPose } from '../../../render/CatModel';
import { DUST_DIRT, Fx } from '../../../render/Fx';
import {
  bigPlant,
  bush,
  flowerPot,
  playerArrow,
  SPRITE_PX_PER_UNIT,
  sunflower,
  yarnBall,
  type Sprite,
} from '../../../render/generative/sprites';
import type { CorsaEvent, CorsaMatch, Trap } from '../core/CorsaMatch';
import type { Vec } from '../core/track';
import { corsaTuning as T } from '../tuning';
import { trackTexture, TRACK_HALF } from './textures';

const flat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/** Inclinazione della camera e parte di pista da tenere in quadro (unità mondo). */
const CAMERA_TILT = 68;
const VIEW_HALF_H = 6.5;
const VIEW_HALF_W = 9.5;
/** Il giardino arretra un po': lo sfondo non deve toccare lo steccato in alto. */
const GARDEN_SHIFT = -2.4;
const CAT_SCALE = 0.85;
const ARROW_Y = 1.7;
/** Stordimento: giro su sé stesso, nuvoletta (ms). */
const SPIN_MS = 800;
const STINK_EXTRA_MS = 600;
const DUST_EVERY_MS = 110;
/** Cacchetta: crescita alla nascita e lampeggio prima di sparire (ms). */
const POP_MS = 220;
/** Pallini delle cacchette in riserva: distanza tra loro, altezza, e quanto stanno sotto il gatto (verso la camera). */
const PIP_GAP = 0.3;
const PIP_Y = 0.2;
const PIP_DOWN = 0.85;
/** La cacchetta è ingrandita per essere ben visibile dall'alto. */
const TRAP_SCALE = 1.5;
const BLINK_MS = 1500;

interface CatVisual {
  cat: CatModel;
  ring: THREE.Mesh;
  arrow: THREE.Sprite;
  stink: THREE.Group;
  /** Pallini sotto il gatto: uno per cacchetta in riserva. */
  pips: THREE.Mesh[];
  lastDust: number;
}

interface TrapVisual {
  group: THREE.Group;
  puffs: THREE.Mesh[];
  base: THREE.Mesh;
  owner: number;
  born: number;
}

/**
 * Scena di Corsa pazza, nel giardino di Pappa Reaction: pista di terra battuta
 * tra due steccati, quattro gatti con l'anello nel loro colore e le cacchette
 * lasciate in pista. Legge lo stato di CorsaMatch; non decide nulla.
 */
export class CorsaScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
  /** Lampi e scosse (si possono spegnere dalle Opzioni). */
  effects = true;
  private readonly arena = new Arena('giardino', true, { dirt: false, decor: false });
  private readonly fx = new Fx();
  private readonly cats: CatVisual[] = [];
  private readonly traps = new Map<number, TrapVisual>();
  private lastNow: number | null = null;
  private fittedAspect = 0;
  private readonly camBase = new THREE.Vector3();
  private readonly camTarget = new THREE.Vector3(0, 0, 0.2);
  private shakes: { at: number; power: number; ms: number }[] = [];

  constructor(private readonly slots: readonly PlayerSlot[]) {
    this.scene.background = new THREE.Color('#2b2236');
    this.scene.add(new THREE.HemisphereLight('#fff4dc', '#5a5a42', 1.55));
    const sun = new THREE.DirectionalLight('#fff0d8', 1.5);
    sun.position.set(3, 10, 7);
    this.arena.group.position.z = GARDEN_SHIFT;
    this.scene.add(sun, this.arena.group, this.fx.group);

    const dirt = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * TRACK_HALF.x, 2 * TRACK_HALF.y),
      new THREE.MeshLambertMaterial({ map: trackTexture(), alphaTest: 0.5 }),
    );
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.004;
    this.scene.add(dirt);
    this.buildFences();
    this.buildDecor();

    slots.forEach((slot) => this.cats.push(this.createCat(slot)));
    this.setPlayers(slots.map(() => false));
    this.fitCamera();
  }

  /** Nuova partita: frecce sopra i gatti umani; via trappole e coriandoli. */
  setPlayers(humans: readonly boolean[]): void {
    this.cats.forEach((c, i) => {
      c.arrow.userData.marked = humans[i] ?? false;
      c.lastDust = -Infinity;
    });
    for (const id of [...this.traps.keys()]) this.removeTrap(id);
    this.fx.clear();
    this.shakes = [];
  }

  onEvent(e: CorsaEvent, m: CorsaMatch): void {
    switch (e.type) {
      case 'drop':
        this.fx.dust(new THREE.Vector3(e.x, 0, e.y), 4, ['#8a6a3a', '#5a3b22']);
        break;
      case 'stun': {
        this.fx.dust(new THREE.Vector3(e.x, 0, e.y), 7, ['#8a6a3a', '#8fae4a']);
        this.shake(e.t, 0.06, 160);
        break;
      }
      case 'bump':
        this.fx.dust(new THREE.Vector3(e.x, 0, e.y), 3, DUST_DIRT);
        break;
      case 'phase':
        if (e.phase === 'final') this.fx.confetti();
        break;
      case 'finish':
      case 'lap':
      case 'lastLap':
      case 'expire':
        void m;
        break;
    }
  }

  update(now: number, m: CorsaMatch): void {
    const dt = this.lastNow === null ? 0 : Math.min(Math.max(now - this.lastNow, 0), 100);
    this.lastNow = now;
    if (this.camera.aspect !== this.fittedAspect) this.fitCamera();

    this.cats.forEach((c, i) => {
      this.placeCat(c, i, now, m);
      this.placeArrow(c, i, now);
    });
    this.updateTraps(now, m);
    this.arena.faceCamera(this.camera);
    this.fx.update(dt, this.camera);
    this.updateCamera(now);
  }

  /** Posizione mondo sopra la testa del gatto `i` (per le nuvolette HUD). */
  headPosition(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.cats[i].cat.root.position).add(new THREE.Vector3(0, 1.9, 0));
  }

  /** Centro dell'isola, per il pannello della classifica. */
  islandCenter(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(0, 0, 0);
  }

  // ---------------------------------------------------------------- gatti

  private placeCat(c: CatVisual, i: number, now: number, m: CorsaMatch): void {
    const r = m.runners[i];
    const root = c.cat.root;
    let hop = 0;
    let yaw = Math.atan2(Math.cos(r.heading), Math.sin(r.heading));
    let pose: CatPose;
    let u = 0;

    if (m.phase === 'final') {
      const rank = m.standings?.indexOf(i) ?? 3;
      if (rank === 0) {
        pose = 'celebrate';
        hop = Math.abs(Math.sin(now * 0.008)) * 0.35;
      } else pose = rank === 1 ? 'sit' : 'sad';
    } else if (now < r.stunUntil) {
      pose = 'yuck';
      u = now - r.stunAt;
      // Giro su sé stesso nei primi istanti, poi resta a fare la faccia schifata.
      if (u < SPIN_MS) yaw += (u / SPIN_MS) * Math.PI * 4 * (1 - u / SPIN_MS / 2);
    } else if (m.phase === 'intro') {
      pose = 'ready';
    } else if (r.speed > 0.4) {
      pose = r.charging ? 'dash' : 'run';
    } else {
      pose = 'idle';
    }
    root.position.set(r.pos.x, hop, r.pos.y);
    root.rotation.y = yaw;
    c.cat.pose(pose, now, u);

    // Nuvoletta puzzolente: finché dura lo stordimento e un po' oltre.
    c.stink.visible = now < r.stunUntil + STINK_EXTRA_MS && now >= r.stunAt;
    if (c.stink.visible) {
      c.stink.rotation.y = -yaw;
      c.stink.children.forEach((puff, k) => {
        const ph = now * 0.002 + k * 2.1;
        puff.position.set(
          Math.cos(ph) * 0.4,
          0.9 + ((now * 0.0006 + k * 0.33) % 1) * 0.8,
          Math.sin(ph) * 0.4,
        );
      });
    }

    // Pallini colorati sotto il gatto: tanti quante le cacchette che può lasciare.
    const n = c.pips.length;
    c.pips.forEach((pip, k) => {
      pip.visible = m.phase !== 'final' && k < r.traps;
      pip.position.set(r.pos.x + (k - (n - 1) / 2) * PIP_GAP, PIP_Y, r.pos.y + PIP_DOWN);
    });

    // Anello a terra nel colore del gatto (si riconosce anche da lontano).
    c.ring.position.set(r.pos.x, 0.02, r.pos.y);
    (c.ring.material as THREE.MeshBasicMaterial).opacity = r.finishedAt === null ? 0.85 : 0.4;

    // Polvere sotto le zampe quando corre forte.
    if (m.phase === 'play' && r.speed > 3 && now - c.lastDust > DUST_EVERY_MS) {
      c.lastDust = now;
      this.fx.dust(new THREE.Vector3(r.pos.x, 0, r.pos.y), 1, DUST_DIRT);
    }
  }

  private placeArrow(c: CatVisual, i: number, now: number): void {
    c.arrow.visible = c.arrow.userData.marked === true;
    if (!c.arrow.visible) return;
    const p = c.cat.root.position;
    c.arrow.position.set(p.x, p.y + ARROW_Y + Math.sin(now * 0.006 + i) * 0.07, p.z);
  }

  // ---------------------------------------------------------------- cacchette

  private updateTraps(now: number, m: CorsaMatch): void {
    const live = new Set<number>();
    for (const trap of m.traps) {
      live.add(trap.id);
      let v = this.traps.get(trap.id);
      if (!v) {
        v = this.createTrap(trap, now);
        this.traps.set(trap.id, v);
      }
      this.placeTrap(v, trap, now);
    }
    for (const id of [...this.traps.keys()]) if (!live.has(id)) this.removeTrap(id);
  }

  private placeTrap(v: TrapVisual, trap: Trap, now: number): void {
    const age = now - v.born;
    const pop = Math.min(1, age / POP_MS);
    // Nasce con un piccolo rimbalzo.
    v.group.scale.setScalar(TRAP_SCALE * (0.3 + 0.7 * pop + Math.sin(pop * Math.PI) * 0.25));
    v.group.position.set(trap.pos.x, 0, trap.pos.y);
    const left = trap.expiresAt - now;
    v.group.visible = left > BLINK_MS || Math.floor(now / 120) % 2 === 0;
    v.puffs.forEach((puff, k) => {
      const ph = now * 0.0015 + k * 2.3;
      puff.position.set(
        Math.cos(ph) * 0.25,
        0.45 + ((now * 0.0005 + k * 0.4) % 1) * 0.7,
        Math.sin(ph) * 0.25,
      );
      puff.scale.setScalar(1 - ((now * 0.0005 + k * 0.4) % 1) * 0.6);
    });
  }

  private createTrap(trap: Trap, now: number): TrapVisual {
    const group = new THREE.Group();
    const brown = flat('#7d4f26');
    const dark = flat('#4d3119');
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.14, 8), brown);
    base.position.y = 0.07;
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.14, 8), dark);
    mid.position.y = 0.2;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.22, 8), brown);
    top.position.y = 0.38;
    // Anello nel colore di chi l'ha lasciata: si sa di chi è.
    const slot = this.slots[trap.owner];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.56, 14),
      new THREE.MeshBasicMaterial({
        color: slot.badgeColor,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    const puffs = [0, 1, 2].map(
      () => new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), flat('#8fae4a')),
    );
    group.add(base, mid, top, ring, ...puffs);
    this.scene.add(group);
    return { group, puffs, base, owner: trap.owner, born: now };
  }

  private removeTrap(id: number): void {
    const v = this.traps.get(id);
    if (!v) return;
    this.scene.remove(v.group);
    v.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry) o.geometry.dispose();
    });
    this.traps.delete(id);
  }

  // ---------------------------------------------------------------- arredo

  /** Steccato di legno attorno alla pista e attorno all'isola. */
  private buildFences(): void {
    const wood = flat('#8a5a34');
    const woodDark = flat('#6e4626');
    const loops = [polyline(T.track.outer, 0.05, 1), polyline(T.track.inner, 0.05, -1)];
    const posts: THREE.Matrix4[] = [];
    const rails: THREE.Matrix4[][] = [[], []];
    const m = new THREE.Matrix4();
    for (const loop of loops) {
      const pts = resample(loop, 0.78);
      pts.forEach((a, k) => {
        const b = pts[(k + 1) % pts.length];
        posts.push(new THREE.Matrix4().makeTranslation(a.x, 0.3, a.y));
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const ang = Math.atan2(b.x - a.x, b.y - a.y);
        [0.2, 0.42].forEach((h, row) => {
          m.compose(
            new THREE.Vector3((a.x + b.x) / 2, h, (a.y + b.y) / 2),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, 0)),
            new THREE.Vector3(1, 1, len),
          );
          rails[row].push(m.clone());
        });
      });
    }
    const postMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.14, 0.62, 0.14),
      woodDark,
      posts.length,
    );
    posts.forEach((mat, k) => postMesh.setMatrixAt(k, mat));
    this.scene.add(postMesh);
    rails.forEach((list) => {
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.09, 1), wood, list.length);
      list.forEach((mat, k) => mesh.setMatrixAt(k, mat));
      this.scene.add(mesh);
    });
  }

  /** Cespugli e fiori attorno alla pista (lontano dagli angoli dell'HUD). */
  private buildDecor(): void {
    // Le posizioni sono nello spazio della scena; l'arena è spostata di GARDEN_SHIFT.
    const put = (s: Sprite, x: number, z: number, scale = 1) =>
      this.arena.placeSprite(s, x, z - GARDEN_SHIFT, scale);
    put(bush(), -7.4, -6.3, 1.3);
    put(sunflower(), -4.8, -6.4);
    put(sunflower(), -4.2, -6.5, 0.85);
    put(bigPlant(), 3.6, -6.4);
    put(bush(), 7.6, -6.3, 1.2);
    put(flowerPot('#f2a03d'), 9.3, -1.2);
    put(bush(), -9.4, 1.3, 0.9);
    put(flowerPot('#e86a8a'), -9.2, -2.6);
    put(yarnBall('#e2574c'), 9.2, 2.8);
    put(sunflower(), -9.0, 4.6, 0.9);
    put(bush(), 9.0, 5.0, 0.9);
  }

  private createCat(slot: PlayerSlot): CatVisual {
    const cat = new CatModel({ breed: slot.breed, variant: slot.variant, collar: slot.badgeColor });
    cat.root.scale.setScalar(CAT_SCALE);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.66, 18),
      new THREE.MeshBasicMaterial({
        color: slot.badgeColor,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 2;

    const stink = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      stink.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), flat('#8fae4a')));
    }
    stink.visible = false;
    cat.root.add(stink);

    const sprite = playerArrow(slot.badgeColor);
    const arrow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: sprite.texture, alphaTest: 0.5, depthTest: false }),
    );
    arrow.scale.set(sprite.width / SPRITE_PX_PER_UNIT, sprite.height / SPRITE_PX_PER_UNIT, 1);
    arrow.renderOrder = 10;
    arrow.visible = false;
    arrow.userData.marked = false;

    // Un pallino nel colore del gatto con il bordo nero, per ogni cacchetta possibile.
    const pips = Array.from({ length: T.trap.max }, () => {
      const pip = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 8, 6),
        new THREE.MeshBasicMaterial({ color: slot.badgeColor }),
      );
      const edge = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 6),
        new THREE.MeshBasicMaterial({ color: '#000', side: THREE.BackSide }),
      );
      pip.add(edge);
      pip.visible = false;
      return pip;
    });
    this.scene.add(cat.root, ring, arrow, ...pips);
    return { cat, ring, arrow, stink, pips, lastDust: -Infinity };
  }

  // ---------------------------------------------------------------- camera

  private shake(at: number, power: number, ms: number): void {
    if (this.effects) this.shakes.push({ at, power, ms });
  }

  private updateCamera(now: number): void {
    const cam = this.camera;
    cam.position.copy(this.camBase);
    this.shakes = this.shakes.filter((sh) => now < sh.at + sh.ms);
    for (const sh of this.shakes) {
      if (now < sh.at) continue;
      const k = 1 - (now - sh.at) / sh.ms;
      cam.position.x += (Math.random() - 0.5) * 2 * sh.power * k;
      cam.position.z += (Math.random() - 0.5) * 2 * sh.power * k;
    }
    cam.lookAt(this.camTarget);
  }

  /** Camera fissa inclinata; si allontana se lo schermo è stretto. */
  private fitCamera(): void {
    const tilt = THREE.MathUtils.degToRad(CAMERA_TILT);
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.max(VIEW_HALF_H / tan, VIEW_HALF_W / (tan * this.camera.aspect));
    this.camBase.set(
      this.camTarget.x,
      Math.sin(tilt) * dist,
      this.camTarget.z + Math.cos(tilt) * dist,
    );
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camTarget);
    this.fittedAspect = this.camera.aspect;
  }
}

/** Contorno di un rettangolo arrotondato (poche decine di punti); `grow` sposta il bordo. */
function polyline(half: { x: number; y: number; r: number }, step: number, grow: number): Vec[] {
  const pts: Vec[] = [];
  const { x, y, r } = half;
  const R = Math.max(0.01, r + 0.12 * grow);
  const hx = x + 0.12 * grow;
  const hy = y + 0.12 * grow;
  const corner = (cx: number, cy: number, a0: number) => {
    const n = Math.max(3, Math.ceil((R * (Math.PI / 2)) / step / 4));
    for (let k = 0; k <= n; k++) {
      const a = a0 + (k / n) * (Math.PI / 2);
      pts.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R });
    }
  };
  // In senso orario sullo schermo, qualunque sia: serve solo a chiudere il giro.
  corner(hx - R, hy - R, 0);
  corner(-(hx - R), hy - R, Math.PI / 2);
  corner(-(hx - R), -(hy - R), Math.PI);
  corner(hx - R, -(hy - R), (3 * Math.PI) / 2);
  return pts;
}

/** Punti a distanza regolare lungo una linea chiusa. */
function resample(loop: readonly Vec[], spacing: number): Vec[] {
  const out: Vec[] = [];
  let carry = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let at = carry === 0 && i === 0 ? 0 : spacing - carry;
    while (at <= len) {
      const t = len === 0 ? 0 : at / len;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      at += spacing;
    }
    carry = len - (at - spacing);
  }
  return out;
}
