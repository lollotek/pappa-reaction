import * as THREE from 'three';
import type { PlayerSlot } from '../../../config/controls';
import { Arena } from '../../../render/Arena';
import { CatModel, type CatPose } from '../../../render/CatModel';
import { Fx } from '../../../render/Fx';
import { playerArrow, SPRITE_PX_PER_UNIT } from '../../../render/generative/sprites';
import { mix } from '../../scaccia/render/textures';
import type { GraffioEvent, GraffioMatch } from '../core/GraffioMatch';
import { graffioTuning as T } from '../tuning';
import { cardboardTexture, sisalTexture } from './textures';

const flat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Altezza del piano dei trespoli dal pavimento: tutto il resto è relativo a questo. */
export const BASE = 0.95;
/** Colonne dei gatti (x), da sinistra a destra. */
export const COLUMN_X = [-3.9, -1.3, 1.3, 3.9] as const;
const PLATFORM_W = 1.9;
const PLATFORM_D = 1.7;
/** Il tubo cade davanti al gatto, verso la camera. */
const LOG_Z = 0.85;
/** Linea di taglio, tacchette e scia della zampata stanno più avanti del tubo. */
const LINE_Z = LOG_Z + T.geometry.logRadius + 0.2;
const CAT_SCALE = 1.35;
/** Mezza altezza e mezza larghezza da tenere in quadro (unità mondo). */
const VIEW_CENTER_Y = 3.15;
const VIEW_HALF_H = 3.75;
const VIEW_HALF_W = 5.7;
/** Con i pulsanti touch ai lati serve più margine. */
const VIEW_HALF_W_TOUCH = 7.6;
const CAMERA_LIFT = 0.35;
const SWAT_MS = 280;
const SLASH_MS = 240;
/** Il tubo (o il pezzo rimasto) sparisce con uno sbuffo, così il gatto si rivede (ms). */
const VANISH_AT = 900;
const VANISH_MS = 220;
const GRAVITY = 22;
const ARROW_Y = 2.35;
const ARROW_BOB = 0.08;
const CATCH = ['#ffe066', '#ffffff'] as const;

interface ColumnVisual {
  cat: CatModel;
  catHolder: THREE.Group;
  arrow: THREE.Sprite;
  /** Tubo intero (caduta). */
  full: THREE.Group;
  /** Pezzo sotto il taglio e pezzo sopra, dopo la zampata. */
  stubGroup: THREE.Group;
  stub: THREE.Mesh;
  topGroup: THREE.Group;
  top: THREE.Mesh;
  /** Tacca rossa: segue il pezzo in cui si trova. */
  band: THREE.Group;
  slash: THREE.Mesh;
  flash: THREE.Group;
  /** Sbuffo di sparizione già fatto in questo round. */
  poofed: boolean;
}

/**
 * Scena di Graffio Killer: quattro gatti su altrettanti tiragraffi, di fronte
 * alla camera, nel salotto di Pappa Reaction. I tubi di cartone cadono davanti
 * a loro. Legge lo stato di GraffioMatch; non decide nulla.
 */
export class GraffioScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
  /** Lampi e scosse (si possono spegnere dalle Opzioni). */
  effects = true;
  private readonly arena = new Arena('salotto', true);
  private readonly fx = new Fx();
  private readonly columns: ColumnVisual[] = [];
  private readonly cardboard = new THREE.MeshLambertMaterial({
    map: cardboardTexture(),
    flatShading: true,
  });
  private readonly capMat = flat('#e3b27a');
  private lastNow: number | null = null;
  private fittedAspect = 0;
  private fittedTouch = false;
  private halfW = VIEW_HALF_W;
  private readonly camBase = new THREE.Vector3();
  private readonly camTarget = new THREE.Vector3(0, VIEW_CENTER_Y, 0);
  private shakes: { at: number; power: number; ms: number }[] = [];

  constructor(slots: readonly PlayerSlot[]) {
    this.scene.background = new THREE.Color('#2b2236');
    this.scene.add(new THREE.HemisphereLight('#fff4dc', '#5a4a52', 1.5));
    const sun = new THREE.DirectionalLight('#fff0d8', 1.5);
    sun.position.set(3, 10, 9);
    this.scene.add(sun, this.arena.group, this.fx.group);

    slots.forEach((slot, i) => this.columns.push(this.createColumn(slot, COLUMN_X[i] ?? 0)));
    this.setHumans(slots.map(() => false));
    this.fitCamera();
  }

  /** Nuova partita: frecce sopra gli umani, via effetti e scosse. */
  setHumans(humans: readonly boolean[]): void {
    this.columns.forEach((c, i) => {
      c.arrow.userData.marked = humans[i] ?? false;
    });
    this.fx.clear();
    this.shakes = [];
  }

  onEvent(e: GraffioEvent): void {
    switch (e.type) {
      case 'cut': {
        const r = e.result;
        const x = COLUMN_X[r.player] ?? 0;
        const y = BASE + T.geometry.cutY;
        if (r.whiff === null && r.points > 0) {
          const perfect = r.points === T.scoring[0].points;
          this.fx.dust(new THREE.Vector3(x, y, LINE_Z), perfect ? 14 : 6, CATCH);
          if (perfect) this.shake(e.t, 0.07, 200);
        }
        break;
      }
      case 'phase':
        if (e.phase === 'final') this.fx.confetti();
        if (e.phase === 'show') {
          this.fx.clear();
          this.columns.forEach((c) => (c.poofed = false));
        }
        break;
    }
  }

  update(now: number, m: GraffioMatch): void {
    const dt = this.lastNow === null ? 0 : Math.min(Math.max(now - this.lastNow, 0), 100);
    this.lastNow = now;
    const touch = document.body.classList.contains('touch-mode');
    if (this.camera.aspect !== this.fittedAspect || touch !== this.fittedTouch) {
      this.fittedTouch = touch;
      this.halfW = touch ? VIEW_HALF_W_TOUCH : VIEW_HALF_W;
      this.fitCamera();
    }
    this.columns.forEach((c, i) => {
      this.placeCat(c, i, now, m);
      this.placeLog(c, i, now, m);
      this.placeSlash(c, i, now, m);
    });
    this.arena.faceCamera(this.camera);
    this.fx.update(dt, this.camera);
    this.updateCamera(now);
  }

  /** Posizione mondo sopra la linea di taglio della colonna `i` (per le nuvolette HUD). */
  headPosition(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(COLUMN_X[i] ?? 0, BASE + T.geometry.cutY + 0.75, LINE_Z);
  }

  /** Centro della faccia anteriore del trespolo (per il pannello dei punti). */
  columnPosition(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(COLUMN_X[i] ?? 0, BASE * 0.5, PLATFORM_D / 2 + 0.05);
  }

  /** Pixel CSS per unità mondo all'altezza dei trespoli, con lo schermo alto `cssHeight`. */
  pixelsPerUnit(cssHeight: number): number {
    return cssHeight / (2 * VIEW_HALF_H);
  }

  // ---------------------------------------------------------------- gatti

  private placeCat(c: ColumnVisual, i: number, now: number, m: GraffioMatch): void {
    const cut = m.cuts[i];
    let pose: CatPose = 'idle';
    let u = 0;
    let hop = 0;
    if (m.phase === 'final') {
      if (m.winners.includes(i)) {
        pose = 'celebrate';
        hop = Math.abs(Math.sin(now * 0.008 + i)) * 0.4;
      } else {
        pose = 'sad';
      }
    } else if (cut) {
      const age = now - cut.t;
      if (age < SWAT_MS) {
        pose = 'swat';
        u = age;
      } else if (cut.whiff === 'none') {
        pose = 'sad';
      } else if (cut.whiff !== null || cut.points === 0) {
        pose = 'stunned';
      } else if (cut.points >= 7) {
        pose = 'celebrate';
        hop = Math.abs(Math.sin((age - SWAT_MS) * 0.012)) * 0.35;
      } else if (cut.points === 1) {
        pose = 'yuck';
      }
    } else if (m.phase === 'lift' || m.phase === 'wait' || m.phase === 'drop') {
      pose = 'ready';
    }
    c.cat.root.position.y = hop;
    c.cat.pose(pose, now, u);

    c.arrow.visible = c.arrow.userData.marked === true && m.phase !== 'final';
    if (c.arrow.visible) {
      c.arrow.position.set(
        c.catHolder.position.x,
        BASE + ARROW_Y + Math.sin(now * 0.006 + i) * ARROW_BOB,
        0,
      );
    }
  }

  // ---------------------------------------------------------------- tubi

  private placeLog(c: ColumnVisual, i: number, now: number, m: GraffioMatch): void {
    const g = T.geometry;
    const x = COLUMN_X[i] ?? 0;
    const cut = m.cuts[i];
    const hidden = m.phase === 'intro' || m.phase === 'final';
    const appear = m.phase === 'show' ? clamp01((now - m.phaseStart) / 300) : 1;
    const pulse = m.phase === 'show' || m.phase === 'lift' ? 1 + 0.05 * Math.sin(now * 0.012) : 1;
    c.band.scale.set(pulse, 1, pulse);
    // Sparizione con sbuffo: dopo il taglio, o a fine round per i tubi non tagliati.
    const vanishAge = cut
      ? now - cut.t
      : m.phase === 'result'
        ? now - m.phaseStart + VANISH_AT - 700
        : -1;
    const k = clamp01((vanishAge - VANISH_AT) / VANISH_MS);
    if (k > 0 && !c.poofed && !hidden) {
      c.poofed = true;
      this.fx.dust(new THREE.Vector3(x, BASE + 0.7, LOG_Z + 0.6), 9);
    }
    const vanish = 1 - k;

    const cutHit = cut && cut.stub !== null && cut.bottom !== null ? cut : null;
    c.full.visible = !hidden && cutHit === null && vanish > 0;
    c.stubGroup.visible = !hidden && cutHit !== null && vanish > 0;
    c.topGroup.visible = c.stubGroup.visible;
    if (hidden) {
      c.band.visible = false;
      return;
    }
    c.band.visible = true;

    if (cutHit === null) {
      const bottom = m.bottomAt(i, now);
      c.full.position.set(x, BASE + bottom + g.logLength / 2, LOG_Z);
      c.full.scale.setScalar((0.3 + 0.7 * appear) * vanish);
      this.attach(c.band, c.full, m.mark - g.logLength / 2);
      return;
    }

    // Dopo la zampata: il pezzo sotto cade a terra, quello sopra vola via.
    const age = Math.max(0, now - cutHit.t) / 1000;
    const stub = cutHit.stub!;
    const bottom = Math.max(0, cutHit.bottom! - m.speed * age - 0.5 * GRAVITY * age * age);
    c.stubGroup.position.set(x, BASE + bottom, LOG_Z);
    c.stubGroup.scale.setScalar(vanish);
    c.stub.scale.y = Math.max(0.001, stub);
    c.stub.position.y = stub / 2;

    const len = Math.max(0.001, g.logLength - stub);
    const dir = (COLUMN_X[i] ?? 0) < 0 ? -1 : 1;
    c.topGroup.visible = age < 1.4;
    c.topGroup.position.set(
      x + dir * 4.5 * age,
      BASE + g.cutY + len / 2 + 4.5 * age - 0.5 * GRAVITY * age * age,
      LOG_Z + 3 * age,
    );
    c.topGroup.rotation.set(4 * age, 0, dir * -7 * age);
    c.top.scale.y = len;

    if (m.mark <= stub) this.attach(c.band, c.stubGroup, m.mark);
    else this.attach(c.band, c.topGroup, m.mark - stub - len / 2);
  }

  /** La tacca segue il pezzo in cui si trova: cambia genitore solo se serve. */
  private attach(band: THREE.Group, parent: THREE.Object3D, y: number): void {
    if (band.parent !== parent) parent.add(band);
    band.position.set(0, y, 0);
  }

  /** Scia della zampata e lampo sul taglio. */
  private placeSlash(c: ColumnVisual, i: number, now: number, m: GraffioMatch): void {
    const cut = m.cuts[i];
    const age = cut ? now - cut.t : Infinity;
    const on = cut !== null && age >= 0 && age < SLASH_MS && m.phase !== 'final';
    c.slash.visible = on;
    c.flash.visible = on && cut !== null && cut.whiff === null && cut.points > 0;
    if (!on || !cut) return;
    const k = age / SLASH_MS;
    const slashMat = c.slash.material as THREE.MeshBasicMaterial;
    slashMat.opacity = 1 - k;
    c.slash.scale.set(0.6 + k * 0.9, 1 - k * 0.6, 1);
    if (c.flash.visible) {
      const perfect = cut.points === T.scoring[0].points;
      const size = (perfect ? 1.4 : 0.8) * (0.5 + k * 0.7);
      c.flash.scale.setScalar(size);
      flashMat(c).opacity = 1 - k;
      c.flash.rotation.z = k * 1.2;
    }
  }

  // ---------------------------------------------------------------- arredo

  private createColumn(slot: PlayerSlot, x: number): ColumnVisual {
    const g = T.geometry;
    // Trespolo: base di legno nel colore del gatto, corda di sisal, piano.
    const tower = new THREE.Group();
    const bodyColor = mix(slot.badgeColor, '#7a5538', 0.5);
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(PLATFORM_W, BASE, PLATFORM_D),
      flat(bodyColor),
    );
    base.position.y = BASE / 2;
    const sisalTex = sisalTexture();
    sisalTex.wrapS = sisalTex.wrapT = THREE.RepeatWrapping;
    sisalTex.repeat.set(3, 1);
    const rope = new THREE.Mesh(
      new THREE.BoxGeometry(PLATFORM_W + 0.04, BASE * 0.46, PLATFORM_D + 0.04),
      new THREE.MeshLambertMaterial({ map: sisalTex, flatShading: true }),
    );
    rope.position.y = BASE * 0.42;
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(PLATFORM_W + 0.2, 0.12, PLATFORM_D + 0.2),
      flat(mix(slot.badgeColor, '#f4efe4', 0.35)),
    );
    top.position.y = BASE - 0.06;
    tower.add(base, rope, top);
    tower.position.x = x;

    const catHolder = new THREE.Group();
    catHolder.position.set(x, BASE, 0);
    const cat = new CatModel({ breed: slot.breed, variant: slot.variant, collar: slot.badgeColor });
    cat.root.scale.setScalar(CAT_SCALE);
    catHolder.add(cat.root);

    // Tubo di cartone intero (origine al centro).
    const full = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(g.logRadius, g.logRadius, g.logLength, 12),
      [this.cardboard, this.capMat, this.capMat],
    );
    full.add(body);

    const unit = new THREE.CylinderGeometry(g.logRadius, g.logRadius, 1, 12);
    const stub = new THREE.Mesh(unit, [this.cardboard, this.capMat, this.capMat]);
    const stubGroup = new THREE.Group();
    stubGroup.add(stub);
    const topPiece = new THREE.Mesh(unit, [this.cardboard, this.capMat, this.capMat]);
    const topGroup = new THREE.Group();
    topGroup.add(topPiece);
    full.visible = stubGroup.visible = topGroup.visible = false;

    // Tacca: fascia rossa spessa quanto la zona "perfetta", con bordi bianchi.
    const band = new THREE.Group();
    const half = T.scoring[0].maxDist;
    const r = g.logRadius + 0.015;
    const mid = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, half * 2, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ff3030', side: THREE.DoubleSide }),
    );
    const edgeMat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const edge = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.035, 12, 1, true),
        edgeMat,
      );
      edge.position.y = s * half;
      band.add(edge);
    }
    band.add(mid);

    // Linea di taglio (tenue) e tacchette ai lati della colonna.
    const cutY = BASE + g.cutY;
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(PLATFORM_W + 0.2, 0.03),
      new THREE.MeshBasicMaterial({ color: '#fff2a8', transparent: true, opacity: 0.35 }),
    );
    line.position.set(x, cutY, LINE_Z - 0.05);
    const tick = new THREE.Shape();
    tick.moveTo(0, 0);
    tick.lineTo(-0.3, 0.17);
    tick.lineTo(-0.3, -0.17);
    tick.closePath();
    const tickGeo = new THREE.ShapeGeometry(tick);
    const tickMat = new THREE.MeshBasicMaterial({ color: '#ffe066' });
    const left = new THREE.Mesh(tickGeo, tickMat);
    left.position.set(x - PLATFORM_W / 2 - 0.15, cutY, LINE_Z);
    left.scale.x = -1;
    const right = new THREE.Mesh(tickGeo, tickMat);
    right.position.set(x + PLATFORM_W / 2 + 0.15, cutY, LINE_Z);

    // Scia della zampata e lampo (visibili solo un attimo).
    const slash = new THREE.Mesh(
      new THREE.PlaneGeometry(PLATFORM_W + 1.4, 0.12),
      new THREE.MeshBasicMaterial({ color: '#ffd27f', transparent: true, depthTest: false }),
    );
    slash.position.set(x, cutY, LINE_Z + 0.05);
    slash.renderOrder = 5;
    // Lampo del taglio: stella a otto punte.
    const flash = new THREE.Group();
    const flashMat = new THREE.MeshBasicMaterial({
      color: '#fffbe0',
      transparent: true,
      depthTest: false,
    });
    const bar = new THREE.PlaneGeometry(1.1, 0.12);
    for (let a = 0; a < 4; a++) {
      const ray = new THREE.Mesh(bar, flashMat);
      ray.rotation.z = (a * Math.PI) / 4;
      ray.renderOrder = 6;
      flash.add(ray);
    }
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8), flashMat);
    core.renderOrder = 6;
    flash.add(core);
    flash.position.set(x, cutY, LINE_Z + 0.1);
    slash.visible = flash.visible = false;

    const sprite = playerArrow(slot.badgeColor);
    const arrow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: sprite.texture, alphaTest: 0.5, depthTest: false }),
    );
    arrow.scale.set(sprite.width / SPRITE_PX_PER_UNIT, sprite.height / SPRITE_PX_PER_UNIT, 1);
    arrow.renderOrder = 10;
    arrow.visible = false;
    arrow.userData.marked = false;
    arrow.position.x = x;

    this.scene.add(
      tower,
      catHolder,
      full,
      stubGroup,
      topGroup,
      line,
      left,
      right,
      slash,
      flash,
      arrow,
    );
    return {
      cat,
      catHolder,
      arrow,
      full,
      stubGroup,
      stub,
      topGroup,
      top: topPiece,
      band,
      slash,
      flash,
      poofed: false,
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
      cam.position.y += (Math.random() - 0.5) * 2 * sh.power * k;
    }
    cam.lookAt(this.camTarget);
  }

  /** Camera frontale e quasi orizzontale; si allontana se lo schermo è stretto. */
  private fitCamera(): void {
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.max(VIEW_HALF_H / tan, this.halfW / (tan * this.camera.aspect));
    this.camBase.set(0, VIEW_CENTER_Y + CAMERA_LIFT, dist);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camTarget);
    this.fittedAspect = this.camera.aspect;
  }
}

/** Materiale del lampo (condiviso dai suoi raggi). */
function flashMat(c: ColumnVisual): THREE.MeshBasicMaterial {
  return (c.flash.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
}
