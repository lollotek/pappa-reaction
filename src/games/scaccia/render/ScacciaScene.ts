import * as THREE from 'three';
import type { PlayerSlot } from '../../../config/controls';
import { Arena } from '../../../render/Arena';
import { CatModel, type CatPose } from '../../../render/CatModel';
import { Fx } from '../../../render/Fx';
import { playerArrow, SPRITE_PX_PER_UNIT } from '../../../render/generative/sprites';
import {
  SIDE_NORMAL,
  SIDE_TANGENT,
  type Ball,
  type ScacciaEvent,
  type ScacciaMatch,
  type Side,
} from '../core/ScacciaMatch';
import { scacciaTuning as T } from '../tuning';
import { bolsterTexture, mix, squareRugTexture } from './textures';
import { createToy } from './toys';

const flat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Inclinazione della camera: alta, così i quattro lati si vedono quasi allo stesso modo. */
const CAMERA_TILT = 75;
/** Mezza altezza e mezza larghezza da tenere in quadro (unità mondo). */
const VIEW_HALF_H = 5.75;
const VIEW_HALF_W = 6.6;
const CAT_SCALE = 1;
/** Il gatto sta dietro al cuscino, di tanto. */
const CAT_BEHIND = 0.45;
/** Cuccia dietro ogni gatto. */
const BED_DEPTH = T.field.goal + 0.95;
const ARROW_Y = 1.7;
const ARROW_BOB = 0.07;
/** Reazioni dei gatti dopo un gol (ms). */
const CONCEDE_MS = 1600;
const STINK_MS = 2300;
const SCORE_MS = 1300;
const SWAT_MS = 260;
/** Scia dello smash: posizioni ricordate e durata del ricordo. */
const TRAIL_POINTS = 16;
const TRAIL_MS = 220;
/** Classifica finale: posto del vincitore e degli altri (2°, 3°, 4°). */
const FINAL_WINNER: [number, number] = [0, 2.0];
const FINAL_SPOTS: [number, number][] = [
  [-1.6, 2.3],
  [1.6, 2.3],
  [-2.9, 2.7],
];
/** Una palla segnata rotola ancora un po' nella cuccia prima di sparire (ms). */
const EXIT_MS = 380;

interface CatVisual {
  cat: CatModel;
  paddle: THREE.Mesh;
  paddleMat: THREE.MeshLambertMaterial;
  bed: THREE.Group;
  arrow: THREE.Sprite;
  stink: THREE.Group;
  swingAt: number;
  concededAt: number;
  scoredAt: number;
}

interface BallVisual {
  toy: THREE.Group;
  /** Alone nel colore di chi l'ha toccata per ultimo (sotto la palla). */
  glow: THREE.Mesh;
  glowMat: THREE.MeshBasicMaterial;
  shadow: THREE.Mesh;
  /** Freccia che indica dove partirà (solo mentre trema al centro). */
  arrow: THREE.Mesh;
  trail: THREE.Mesh[];
  history: { x: number; z: number; t: number }[];
  last: THREE.Vector3 | null;
  spawnAt: number;
  /** Segnata: rotola fuori dal campo in questa direzione, da questo istante. */
  exit: { at: number; dir: THREE.Vector3 } | null;
}

/**
 * Scena di Scaccia la palla, nel salotto di Pappa Reaction: tappeto quadrato
 * a spicchi, cuscini d'angolo, cucce, gatti dietro ai cuscini a salsicciotto e
 * palline-giocattolo. Legge lo stato di ScacciaMatch; non decide nulla.
 */
export class ScacciaScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
  /** Lampi e scosse (si possono spegnere dalle Opzioni). */
  effects = true;
  private readonly arena = new Arena('salotto', true);
  private readonly fx = new Fx();
  private readonly cats: CatVisual[] = [];
  private readonly balls = new Map<number, BallVisual>();
  private readonly rug: THREE.Mesh;
  private readonly rugTextures = new Map<string, THREE.CanvasTexture>();
  private readonly trailGeo = new THREE.PlaneGeometry(1, 1);
  private readonly toyR = T.ball.radius;
  private sides: readonly Side[] = [0, 1, 2, 3];
  private lastNow: number | null = null;
  private fittedAspect = 0;
  private readonly camBase = new THREE.Vector3();
  private readonly camTarget = new THREE.Vector3(0, 0, 0.35);
  private shakes: { at: number; power: number; ms: number }[] = [];

  constructor(private readonly slots: readonly PlayerSlot[]) {
    this.scene.background = new THREE.Color('#2b2236');
    this.scene.add(new THREE.HemisphereLight('#fff4dc', '#5a4a52', 1.5));
    const sun = new THREE.DirectionalLight('#fff0d8', 1.5);
    sun.position.set(3, 10, 7);
    this.scene.add(sun, this.arena.group, this.fx.group);

    const size = 2 * T.field.half + 0.3;
    this.rug = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial());
    this.rug.rotation.x = -Math.PI / 2;
    this.rug.position.y = 0.005;
    this.scene.add(this.rug);
    this.buildCornerCushions();

    slots.forEach((slot) => this.cats.push(this.createCat(slot)));
    this.setSides(
      this.sides,
      slots.map(() => false),
    );
    this.fitCamera();
  }

  /** Nuova partita: lati dei gatti, frecce sopra gli umani; via palline e coriandoli. */
  setSides(sides: readonly Side[], humans: readonly boolean[]): void {
    this.sides = sides;
    const colors: string[] = [];
    sides.forEach((side, i) => (colors[side] = this.slots[i].badgeColor));
    const key = colors.join();
    let tex = this.rugTextures.get(key);
    if (!tex) {
      const cut = T.field.corner / T.field.half;
      tex = squareRugTexture(colors, cut);
      this.rugTextures.set(key, tex);
    }
    const mat = this.rug.material as THREE.MeshLambertMaterial;
    mat.map = tex;
    mat.needsUpdate = true;

    this.cats.forEach((c, i) => {
      c.arrow.userData.marked = humans[i] ?? false;
      c.swingAt = -Infinity;
      c.concededAt = -Infinity;
      c.scoredAt = -Infinity;
      const side = sides[i];
      const n = SIDE_NORMAL[side];
      c.bed.position.set(n.x * BED_DEPTH, 0, n.y * BED_DEPTH);
      c.bed.rotation.y = Math.atan2(-n.x, -n.y);
      c.paddle.rotation.set(0, side === 1 || side === 3 ? -Math.PI / 2 : 0, Math.PI / 2, 'YXZ');
    });
    for (const id of [...this.balls.keys()]) this.removeBall(id);
    this.fx.clear();
    this.shakes = [];
  }

  onEvent(e: ScacciaEvent, m: ScacciaMatch): void {
    switch (e.type) {
      case 'swing':
        this.cats[e.player].swingAt = e.t;
        break;
      case 'hit': {
        const b = m.balls.find((x) => x.id === e.ball);
        if (b) this.fx.dust(new THREE.Vector3(b.pos.x, 0, b.pos.y), e.smash ? 6 : 3);
        if (e.smash) this.shake(e.t, 0.05, 140);
        break;
      }
      case 'wall':
        this.fx.dust(new THREE.Vector3(e.x, 0, e.y), 3);
        break;
      case 'goal': {
        const v = this.balls.get(e.ball);
        const n = SIDE_NORMAL[e.side];
        if (v) v.exit = { at: e.t, dir: new THREE.Vector3(n.x, 0, n.y) };
        this.cats[e.conceder].concededAt = e.t;
        if (e.scorer !== null) this.cats[e.scorer].scoredAt = e.t;
        const color = this.slots[e.scorer ?? e.conceder].badgeColor;
        this.fx.dust(new THREE.Vector3(e.x, 0, e.y), 10, [color, '#ffffff']);
        this.shake(e.t, 0.1, 220);
        break;
      }
      case 'phase':
        if (e.phase === 'final') this.fx.confetti();
        break;
      case 'spawn':
      case 'launch':
      case 'suddenDeath':
        break;
    }
  }

  update(now: number, m: ScacciaMatch): void {
    const dt = this.lastNow === null ? 0 : Math.min(Math.max(now - this.lastNow, 0), 100);
    this.lastNow = now;
    if (this.camera.aspect !== this.fittedAspect) this.fitCamera();

    this.cats.forEach((c, i) => {
      if (m.phase === 'final') this.placeFinal(c, i, now, m);
      else this.placeCat(c, i, now, m);
      this.placeArrow(c, i, now);
      this.showStink(c, now);
    });
    this.updateBalls(now, m);
    this.arena.faceCamera(this.camera);
    this.fx.update(dt, this.camera);
    this.updateCamera(now);
  }

  /** Posizione mondo sopra la testa del gatto `i` (per le nuvolette HUD). */
  headPosition(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.cats[i].cat.root.position).add(new THREE.Vector3(0, 2.15, 0));
  }

  // ---------------------------------------------------------------- gatti

  private placeCat(c: CatVisual, i: number, now: number, m: ScacciaMatch): void {
    const p = m.paddles[i];
    const n = SIDE_NORMAL[p.side];
    const tg = SIDE_TANGENT[p.side];
    const d = T.paddle.depth;
    c.paddle.visible = true;
    c.paddle.position.set(n.x * d + tg.x * p.pos, T.paddle.radius, n.y * d + tg.y * p.pos);
    // Il cuscino rotola un po' mentre si sposta.
    c.paddleMat.map!.offset.x = -p.pos * 0.6;

    const cd = d + CAT_BEHIND;
    let hop = 0;
    let pose: CatPose = 'ready';
    let u = Math.min(1, Math.abs(p.vel) / T.paddle.speed);
    if (now - c.concededAt < CONCEDE_MS) {
      pose = 'yuck';
    } else if (now - c.scoredAt < SCORE_MS) {
      pose = 'celebrate';
      hop = Math.abs(Math.sin((now - c.scoredAt) * 0.012)) * 0.3;
    } else if (now - c.swingAt < SWAT_MS) {
      pose = 'swat';
      u = now - c.swingAt;
    }
    c.cat.root.position.set(n.x * cd + tg.x * p.pos, hop, n.y * cd + tg.y * p.pos);
    c.cat.root.rotation.y = Math.atan2(-n.x, -n.y);
    c.cat.pose(pose, now, u);
  }

  private placeFinal(c: CatVisual, i: number, now: number, m: ScacciaMatch): void {
    c.paddle.visible = false;
    const rank = m.standings?.indexOf(i) ?? 3;
    // Nella metà bassa del tappeto: la metà alta resta alla classifica.
    const [wx, wz] = FINAL_WINNER;
    if (rank === 0) {
      // Il vincitore festeggia rivolto alla camera.
      c.cat.root.position.set(wx, Math.abs(Math.sin(now * 0.008)) * 0.45, wz);
      c.cat.root.rotation.y = 0;
      c.cat.pose('celebrate', now);
      return;
    }
    // Gli altri ai lati del vincitore, rivolti verso di lui: 2° seduto, poi tristi.
    const [x, z] = FINAL_SPOTS[Math.max(0, rank - 1)] ?? FINAL_SPOTS[2];
    c.cat.root.position.set(x, 0, z);
    c.cat.root.rotation.y = Math.atan2(wx - x, wz - z);
    c.cat.pose(rank === 1 ? 'sit' : 'sad', now);
  }

  private placeArrow(c: CatVisual, i: number, now: number): void {
    c.arrow.visible = c.arrow.userData.marked === true;
    if (!c.arrow.visible) return;
    const bob = Math.sin(now * 0.006 + i) * ARROW_BOB;
    const p = c.cat.root.position;
    c.arrow.position.set(p.x, p.y + ARROW_Y + bob, p.z);
  }

  /** Nuvoletta puzzolente sopra chi ha appena subito un gol. */
  private showStink(c: CatVisual, now: number): void {
    c.stink.visible = now - c.concededAt < STINK_MS;
    if (!c.stink.visible) return;
    c.stink.children.forEach((puff, k) => {
      const ph = now * 0.002 + k * 2.1;
      puff.position.set(
        Math.cos(ph) * 0.45,
        1.1 + ((now * 0.0006 + k * 0.33) % 1) * 0.8,
        Math.sin(ph) * 0.45,
      );
    });
  }

  // ---------------------------------------------------------------- palline

  private updateBalls(now: number, m: ScacciaMatch): void {
    const live = new Set<number>();
    for (const b of m.balls) {
      live.add(b.id);
      let v = this.balls.get(b.id);
      if (!v) {
        v = this.createBall(b, now);
        this.balls.set(b.id, v);
      }
      this.placeBall(v, b, now);
    }
    // Palle segnate: rotolano nella cuccia e spariscono; le altre spariscono subito.
    for (const [id, v] of this.balls) {
      if (live.has(id)) continue;
      if (!v.exit || now - v.exit.at > EXIT_MS || m.phase === 'final') {
        this.removeBall(id);
        continue;
      }
      const k = (now - v.exit.at) / EXIT_MS;
      v.toy.position.addScaledVector(v.exit.dir, 0.06);
      v.toy.scale.setScalar(1 - k * 0.7);
      v.glow.visible = false;
      v.arrow.visible = false;
      v.trail.forEach((t) => (t.visible = false));
      v.shadow.position.set(v.toy.position.x, 0.012, v.toy.position.z);
    }
  }

  private placeBall(v: BallVisual, b: Ball, now: number): void {
    const r = this.toyR;
    const pos = new THREE.Vector3(b.pos.x, r, b.pos.y);
    const waiting = now < b.launchAt;
    if (waiting) {
      // Appena nata: salta fuori dal centro e trema prima di partire.
      const age = now - v.spawnAt;
      const pop = clamp01(age / 220);
      v.toy.scale.setScalar(0.3 + pop * 0.7);
      pos.y += Math.abs(Math.sin(age * 0.012)) * 0.35 * (1 - clamp01(age / 600));
      const shake = 0.03 * clamp01((age - 300) / 300);
      pos.x += Math.sin(now * 0.09) * shake;
      pos.z += Math.cos(now * 0.11) * shake;
      v.arrow.visible = true;
      v.arrow.position.set(b.dir.x * 0.75, 0.02, b.dir.y * 0.75);
      // La punta della freccia (asse y della forma) va nella direzione di partenza.
      v.arrow.rotation.set(-Math.PI / 2, 0, Math.atan2(-b.dir.x, -b.dir.y));
      (v.arrow.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.4 * Math.sin(now * 0.02);
    } else {
      v.toy.scale.setScalar(1);
      v.arrow.visible = false;
    }
    // Rotola: rotazione attorno all'asse perpendicolare al moto.
    if (v.last && !waiting) {
      const dx = pos.x - v.last.x;
      const dz = pos.z - v.last.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-5) {
        const axis = new THREE.Vector3(dz, 0, -dx).normalize();
        v.toy.rotateOnWorldAxis(axis, dist / r);
      }
    }
    // L'effetto si vede: la palla gira anche su se stessa.
    if (b.spin !== 0) v.toy.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), b.spin * 0.25);
    v.toy.position.copy(pos);
    v.last = pos.clone();
    v.shadow.position.set(pos.x, 0.012, pos.z);

    // Alone nel colore dell'ultimo gatto che l'ha toccata.
    v.glow.visible = b.owner !== null;
    if (b.owner !== null) {
      v.glowMat.color.set(this.slots[b.owner].badgeColor);
      v.glow.position.set(pos.x, 0.018, pos.z);
      const pulse = 1 + Math.sin(now * 0.012) * 0.08;
      v.glow.scale.setScalar(pulse);
    }

    // Scia dello smash: colore del gatto, lunga quanto la palla è veloce.
    v.history.unshift({ x: pos.x, z: pos.z, t: now });
    while (v.history.length > TRAIL_POINTS) v.history.pop();
    const trailOn = b.smashed && !waiting;
    const color = b.owner !== null ? this.slots[b.owner].badgeColor : '#ffffff';
    v.trail.forEach((q, k) => {
      const h = v.history[k + 1];
      q.visible = trailOn && h !== undefined && now - h.t < TRAIL_MS;
      if (!q.visible) return;
      const f = 1 - (k + 1) / TRAIL_POINTS;
      q.position.set(h.x, 0.03 + f * r * 0.6, h.z);
      q.scale.setScalar(r * 2 * (0.35 + f * 0.75));
      const mat = q.material as THREE.MeshBasicMaterial;
      mat.color.set(k % 3 === 2 ? mix(color, '#ffffff', 0.6) : color);
      mat.opacity = 0.75 * f;
    });
  }

  private createBall(b: Ball, now: number): BallVisual {
    const r = this.toyR;
    const toy = createToy(b.kind, b.id, r);
    const glowMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(new THREE.RingGeometry(r * 1.15, r * 1.75, 14), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.renderOrder = 2;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.95, 10),
      new THREE.MeshBasicMaterial({
        color: '#000',
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 1;
    // Freccia a terra: dove partirà la palla.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.45);
    shape.lineTo(0.28, 0);
    shape.lineTo(0.1, 0);
    shape.lineTo(0.1, -0.35);
    shape.lineTo(-0.1, -0.35);
    shape.lineTo(-0.1, 0);
    shape.lineTo(-0.28, 0);
    shape.closePath();
    const arrow = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: '#fff7e0', transparent: true, depthWrite: false }),
    );
    arrow.renderOrder = 2;
    const trail = Array.from({ length: TRAIL_POINTS - 1 }, () => {
      const q = new THREE.Mesh(
        this.trailGeo,
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
      );
      q.rotation.x = -Math.PI / 2;
      q.renderOrder = 3;
      q.visible = false;
      return q;
    });
    this.scene.add(toy, glow, shadow, arrow, ...trail);
    return {
      toy,
      glow,
      glowMat,
      shadow,
      arrow,
      trail,
      history: [],
      last: null,
      spawnAt: now,
      exit: null,
    };
  }

  private removeBall(id: number): void {
    const v = this.balls.get(id);
    if (!v) return;
    this.scene.remove(v.toy, v.glow, v.shadow, v.arrow, ...v.trail);
    v.glowMat.dispose();
    v.trail.forEach((q) => (q.material as THREE.Material).dispose());
    this.balls.delete(id);
  }

  // ---------------------------------------------------------------- arredo

  /** Cuscini diagonali negli angoli: la palla ci rimbalza. */
  private buildCornerCushions(): void {
    const { half, corner } = T.field;
    const radius = 0.3;
    const length = corner * Math.SQRT2;
    const colors = ['#c97b6b', '#5f8a8b', '#c97b6b', '#5f8a8b'];
    let k = 0;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        // Capsula sdraiata lungo l'asse x del gruppo, schiacciata un po'.
        const cushion = new THREE.Mesh(
          new THREE.CapsuleGeometry(radius, length - 2 * radius + 0.35, 3, 8),
          flat(colors[k++]),
        );
        cushion.rotation.z = Math.PI / 2;
        cushion.scale.set(0.85, 1, 1);
        const button = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), flat('#efe0bd'));
        button.position.y = radius * 0.8;
        const group = new THREE.Group();
        group.add(cushion, button);
        // Al centro dello smusso, spinto in fuori del suo raggio (la faccia interna sulla
        // linea su cui rimbalza la palla), disteso lungo lo smusso.
        const mid = half - corner / 2 + radius / Math.SQRT2;
        group.position.set(sx * mid, radius * 0.85, sz * mid);
        group.rotation.y = Math.atan2(sz, sx);
        this.scene.add(group);
      }
    }
  }

  private createCat(slot: PlayerSlot): CatVisual {
    const cat = new CatModel({ breed: slot.breed, variant: slot.variant, collar: slot.badgeColor });
    cat.root.scale.setScalar(CAT_SCALE);

    // Cuscino a salsicciotto a righe nel colore del gatto.
    const tex = bolsterTexture(slot.badgeColor);
    tex.repeat.set(3, 1);
    const paddleMat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
    const len = 2 * T.paddle.halfLength;
    const paddle = new THREE.Mesh(
      new THREE.CapsuleGeometry(T.paddle.radius, len - 2 * T.paddle.radius, 3, 8),
      paddleMat,
    );

    // Cuccia: cesta ovale con il cuscino dentro.
    const bed = new THREE.Group();
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.17, 5, 14),
      flat(mix(slot.badgeColor, '#3b2a20', 0.35)),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.12;
    const pillow = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 14),
      flat(mix(slot.badgeColor, '#f4efe4', 0.55)),
    );
    pillow.rotation.x = -Math.PI / 2;
    pillow.position.y = 0.06;
    bed.add(rim, pillow);
    bed.scale.set(1.35, 1, 0.8);

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

    this.scene.add(cat.root, paddle, bed, arrow);
    return {
      cat,
      paddle,
      paddleMat,
      bed,
      arrow,
      stink,
      swingAt: -Infinity,
      concededAt: -Infinity,
      scoredAt: -Infinity,
    };
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

  /** Camera fissa molto inclinata; si allontana se lo schermo è stretto. */
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
