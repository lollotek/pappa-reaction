import * as THREE from 'three';
import { animateContent, createBowlContents } from './BowlContents';
import {
  balconyWallTexture,
  dirtTexture,
  floorTexture,
  gardenBackTexture,
  grassTexture,
  rugTexture,
  tileTexture,
  wallTexture,
  waterTexture,
  woodTexture,
} from './generative/canvasTexture';
import {
  SPRITE_PX_PER_UNIT,
  bigPlant,
  bookshelf,
  bush,
  catTree,
  cushion,
  floorLamp,
  flowerPot,
  sunflower,
  yarnBall,
  type Sprite,
} from './generative/sprites';

const flat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/**
 * Coperchio chiuso e aperto. Aperto, la mano lo solleva fuori dall'inquadratura:
 * dalla camera inclinata qualunque posizione sopra la ciotola coprirebbe il gatto dietro.
 */
const LID_CLOSED_Y = 0.5;
const LID_OPEN_Y = 8.5;
const LID_OPEN_BACK = 0;
const LID_OPEN_TILT = -0.3;
/** Raggio del tappeto (la pista è la fascia chiara a 2.9–3.9). */
export const RUG_RADIUS = 5;
/** Livello del "letto" di cibo dentro la ciotola. */
const FOOD_Y = 0.3;

/** Mappe: salotto (tappeto), balcone (piscinetta gonfiabile), giardino (sterrato nel prato). */
export const ARENA_MAPS = ['salotto', 'balcone', 'giardino'] as const;
export type ArenaMap = (typeof ARENA_MAPS)[number];

/** Piscinetta: raggio dell'acqua, del salsicciotto gonfiabile e livello dell'acqua. */
export const POOL_RADIUS = 4.05;
const POOL_RING_RADIUS = 4.35;
const POOL_TUBE = 0.3;
export const WATER_Y = 0.24;

/**
 * Arena generativa: ciotola, cloche di legno, mano arbitro e contenuti,
 * dentro una delle mappe. Salotto: parquet, parete con finestra, tappeto intrecciato.
 * Balcone: cotto, facciata con persiane, ringhiere, piscinetta gonfiabile.
 * Giardino: prato, siepe e steccato, spiazzo di terra battuta.
 */
export class Arena {
  readonly group = new THREE.Group();
  private readonly lid = new THREE.Group();
  private readonly hand = new THREE.Group();
  private readonly fingers: THREE.Group[] = [];
  private readonly contents: Map<string, THREE.Group>;
  private readonly billboards: THREE.Mesh[] = [];
  /** Galleggianti che dondolano sull'acqua (solo balcone). */
  private readonly floaters: { obj: THREE.Object3D; phase: number }[] = [];

  /**
   * `bare`: solo l'ambiente (pavimento, parete, decori), senza tappeto rotondo,
   * ciotola, coperchio e mano: per gli altri minigiochi nella stessa casa.
   */
  constructor(
    readonly map: ArenaMap = 'salotto',
    readonly bare = false,
  ) {
    if (map === 'balcone') this.buildBalcony();
    else if (map === 'giardino') this.buildGarden();
    else this.buildRoom();
    this.contents = bare ? new Map() : createBowlContents();
    if (!bare) {
      this.buildBowl();
      this.buildLid();
      this.buildHand();
      for (const content of this.contents.values()) {
        content.position.y = FOOD_Y;
        content.visible = false;
        this.group.add(content);
      }
    }

    if (map === 'balcone') this.buildBalconyDecor();
    else if (map === 'giardino') this.buildGardenDecor();
    else this.buildDecor();
  }

  /** True se i gatti nuotano invece di correre. */
  get swimming(): boolean {
    return this.map === 'balcone';
  }

  /** Animazioni d'ambiente (dondolio dei galleggianti). */
  animate(now: number): void {
    for (const f of this.floaters) {
      f.obj.position.y = WATER_Y - 0.05 + Math.sin(now * 0.002 + f.phase) * 0.03;
      f.obj.rotation.z = Math.sin(now * 0.0016 + f.phase) * 0.08;
    }
  }

  /** 0 = chiuso, 1 = aperto; `wobble` aggiunge oscillazione (finte e rimbalzo). */
  setLid(open: number, wobble = 0): void {
    this.lid.position.y = LID_CLOSED_Y + (LID_OPEN_Y - LID_CLOSED_Y) * open + wobble * 0.3;
    this.lid.position.z = -LID_OPEN_BACK * open;
    this.lid.rotation.x = LID_OPEN_TILT * open + wobble * 0.15;
    // Le dita stringono il pomello quando la mano si prepara o solleva.
    const grip = Math.min(1, open * 3 + Math.abs(wobble) * 2);
    this.fingers.forEach((f, i) => (f.rotation.x = 0.9 + grip * 0.5 + (i % 2) * 0.05));
  }

  /** Mostra un contenuto (o nessuno) con una scala 0..1. */
  setContent(id: string | null, scale = 1, time = 0): void {
    for (const [cid, group] of this.contents) {
      group.visible = cid === id && scale > 0;
      if (group.visible) {
        group.scale.setScalar(scale);
        animateContent(group, cid, time);
      }
    }
  }

  /** Billboard dei decori verso la camera (solo asse Y). */
  faceCamera(camera: THREE.Camera): void {
    for (const b of this.billboards) {
      b.rotation.y = Math.atan2(camera.position.x - b.position.x, camera.position.z - b.position.z);
    }
  }

  private buildRoom(): void {
    const floorTex = floorTexture();
    floorTex.repeat.set(8, 8);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshLambertMaterial({ map: floorTex }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 8),
      new THREE.MeshLambertMaterial({ map: wallTexture() }),
    );
    wall.position.set(0, 4, -5.7);

    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(RUG_RADIUS, 40),
      new THREE.MeshLambertMaterial({ map: rugTexture(), transparent: true }),
    );
    rug.rotation.x = -Math.PI / 2;
    this.group.add(floor, wall);
    if (!this.bare) this.group.add(rug);
  }

  private buildGarden(): void {
    const grassTex = grassTexture();
    grassTex.repeat.set(10, 10);
    const lawn = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshLambertMaterial({ map: grassTex }),
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.01;

    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 8),
      new THREE.MeshLambertMaterial({ map: gardenBackTexture() }),
    );
    back.position.set(0, 4, -5.7);

    // Spiazzo un po' più largo del tappeto, con il bordo che sfuma nell'erba.
    const dirt = new THREE.Mesh(
      new THREE.CircleGeometry(RUG_RADIUS * 1.08, 40),
      new THREE.MeshLambertMaterial({ map: dirtTexture(128, 0.54, 0.72), alphaTest: 0.5 }),
    );
    dirt.rotation.x = -Math.PI / 2;
    this.group.add(lawn, back, dirt);
  }

  private buildBalcony(): void {
    const tileTex = tileTexture();
    tileTex.repeat.set(10, 10);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshLambertMaterial({ map: tileTex }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 8),
      new THREE.MeshLambertMaterial({ map: balconyWallTexture() }),
    );
    wall.position.set(0, 4, -5.7);
    this.group.add(floor, wall);

    // Ringhiere di ferro ai lati del balcone.
    const iron = flat('#3b3a40');
    for (const side of [-1, 1]) {
      const x = side * 8.6;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 14), iron);
      rail.position.set(x, 1.6, 1.3);
      const low = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 14), iron);
      low.position.set(x, 0.25, 1.3);
      this.group.add(rail, low);
      for (let z = -5.5; z <= 8; z += 0.5) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), iron);
        bar.position.set(x, 0.9, z);
        this.group.add(bar);
      }
    }

    this.buildPool();
  }

  private buildPool(): void {
    // Fondo chiaro visto attraverso l'acqua.
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(POOL_RADIUS, 40), flat('#9fdcef'));
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.005;

    const water = new THREE.Mesh(
      new THREE.CircleGeometry(POOL_RADIUS + 0.05, 40),
      new THREE.MeshLambertMaterial({
        map: waterTexture(),
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y;
    water.renderOrder = 1;

    // Salsicciotto gonfiabile a spicchi bianchi e azzurri, con un bordino rosso sopra.
    const segments = 16;
    const arc = (Math.PI * 2) / segments;
    const ring = new THREE.Group();
    for (let k = 0; k < segments; k++) {
      const piece = new THREE.Mesh(
        new THREE.TorusGeometry(POOL_RING_RADIUS, POOL_TUBE, 6, 3, arc),
        flat(k % 2 ? '#f4f1ea' : '#3f8fd6'),
      );
      piece.rotation.z = k * arc;
      ring.add(piece);
    }
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = POOL_TUBE;
    const top = new THREE.Mesh(
      new THREE.TorusGeometry(POOL_RING_RADIUS, 0.1, 4, 32),
      flat('#e2574c'),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = POOL_TUBE * 2 - 0.02;
    // Valvola.
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 6), flat('#f4f1ea'));
    valve.position.set(
      POOL_RING_RADIUS * Math.cos(0.5),
      POOL_TUBE * 2 + 0.08,
      POOL_RING_RADIUS * Math.sin(0.5),
    );
    this.group.add(bottom, water, ring, top, valve);
  }

  /** Paperella di gomma low poly. */
  private rubberDuck(): THREE.Group {
    const duck = new THREE.Group();
    const yellow = flat('#f6d33c');
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 5), yellow);
    body.scale.set(1, 0.7, 1.25);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), yellow);
    head.position.set(0, 0.26, 0.2);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 5), flat('#f08a2a'));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.24, 0.39);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 4), yellow);
    tail.rotation.x = -2.2;
    tail.position.set(0, 0.12, -0.33);
    duck.add(body, head, beak, tail);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 3), flat('#1e191d'));
      eye.position.set(side * 0.1, 0.31, 0.32);
      duck.add(eye);
    }
    return duck;
  }

  private buildBowl(): void {
    // Ciotola di ceramica: profilo ruotato (lathe) con fascia decorativa.
    const profile = [
      [0, 0],
      [0.9, 0],
      [1.08, 0.08],
      [1.2, 0.28],
      [1.26, 0.48],
      [1.17, 0.52],
      [1.08, 0.36],
      [0.95, FOOD_Y],
      [0, FOOD_Y],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(profile, 12), flat('#efe6d6'));
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(1.225, 1.16, 0.08, 12, 1, true),
      flat('#5f8a8b'),
    );
    band.position.y = 0.3;
    const bed = new THREE.Mesh(new THREE.CircleGeometry(0.98, 12), flat('#d8cbb2'));
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = FOOD_Y + 0.005;
    this.group.add(bowl, band, bed);
  }

  private buildLid(): void {
    // DoubleSide: aperto, il coperchio mostra anche l'interno della cupola.
    const wood = new THREE.MeshLambertMaterial({
      map: woodTexture(),
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.3, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      wood,
    );
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.07, 4, 16), flat('#6e4428'));
    rim.rotation.x = Math.PI / 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.15, 6), flat('#6e4428'));
    stem.position.y = 1.33;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), flat('#8a5530'));
    knob.position.y = 1.48;
    knob.scale.y = 0.75;
    this.lid.add(dome, rim, stem, knob);
    this.lid.position.y = LID_CLOSED_Y;
    this.group.add(this.lid);
  }

  private buildHand(): void {
    // Mano a "manopola" low poly che afferra il pomello; braccio da dietro in alto.
    const skin = flat('#f1c7a4');
    const skinDark = flat('#dca684');
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.44), skin);
    palm.position.set(0, 0.2, -0.04);
    this.hand.add(palm);

    for (let i = 0; i < 4; i++) {
      // Dito in due falangi: pivot sulla nocca, si piega attorno al pomello.
      const finger = new THREE.Group();
      finger.position.set(-0.18 + i * 0.12, 0.17, 0.2);
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.18), skin);
      p1.position.z = 0.09;
      const tip = new THREE.Group();
      tip.position.z = 0.18;
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.14), skinDark);
      p2.position.z = 0.07;
      tip.rotation.x = 0.7;
      tip.add(p2);
      finger.add(p1, tip);
      this.hand.add(finger);
      this.fingers.push(finger);
    }
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.24), skin);
    thumb.position.set(0.3, 0.1, 0.02);
    thumb.rotation.set(0.6, -0.5, 0);
    this.hand.add(thumb);

    // Polsino e manica: salgono all'indietro, fuori inquadratura.
    const arm = new THREE.Group();
    arm.position.set(0, 0.24, -0.25);
    arm.rotation.x = -1.0;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 7), flat('#f4efe4'));
    cuff.position.y = 0.12;
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 4, 7), flat('#4f6fa8'));
    sleeve.position.y = 2.15;
    for (let i = 0; i < 5; i++) {
      const stripe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.235, 0.24, 0.08, 7),
        flat('#e8e2d0'),
      );
      stripe.position.y = 0.6 + i * 0.7;
      arm.add(stripe);
    }
    arm.add(cuff, sleeve);
    this.hand.add(arm);

    this.hand.position.y = 1.42;
    this.lid.add(this.hand);
  }

  private placeSprite(s: Sprite, x: number, z: number, scale = 1): void {
    const w = (s.width / SPRITE_PX_PER_UNIT) * scale;
    const h = (s.height / SPRITE_PX_PER_UNIT) * scale;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: s.texture, transparent: true, alphaTest: 0.5 }),
    );
    m.geometry.translate(0, h / 2, 0); // base appoggiata al pavimento
    m.position.set(x, 0, z);
    this.billboards.push(m);
    this.group.add(m);
  }

  private buildDecor(): void {
    const place = (s: Sprite, x: number, z: number, scale = 1) => this.placeSprite(s, x, z, scale);

    // Contro la parete.
    place(bookshelf(), -6.6, -5.4);
    place(floorLamp(), -4.6, -5.5);
    place(bigPlant(), 4.6, -5.4);
    place(catTree(), 6.6, -5.3);

    // Attorno al tappeto (lontano dagli angoli dell'HUD).
    place(flowerPot('#e86a8a'), -6.4, -1.2);
    place(flowerPot('#9a7be0'), 6.5, -1.6);
    place(flowerPot('#f2a03d'), -6.9, 2.6);
    place(cushion('#c97b6b'), 6.6, -3.6);
    place(cushion('#5f8a8b'), -6.4, -3.7);
    place(yarnBall('#e2574c'), -5.4, 4.6);
    place(yarnBall('#7d9a6a'), 5.8, 3.4);
  }

  private buildGardenDecor(): void {
    const place = (s: Sprite, x: number, z: number, scale = 1) => this.placeSprite(s, x, z, scale);
    // Lungo lo steccato.
    place(bush(), -6.8, -5.2, 1.3);
    place(sunflower(), -4.9, -5.4);
    place(sunflower(), -4.3, -5.5, 0.85);
    place(bigPlant(), 4.8, -5.3);
    place(bush(), 6.9, -5.1, 1.2);
    // Sul prato, attorno allo sterrato (lontano dagli angoli dell'HUD).
    place(bush(), -7.0, -1.4);
    place(flowerPot('#f2a03d'), 6.8, -1.8);
    place(sunflower(), 7.1, -3.4, 0.9);
    place(flowerPot('#e86a8a'), -7.0, 2.4);
    place(bush(), 7.0, 2.6, 0.9);
    place(yarnBall('#e2574c'), -5.8, 4.6);
  }

  private buildBalconyDecor(): void {
    // Paperella che galleggia tra la pista e il bordo della piscinetta.
    const duck = this.rubberDuck();
    duck.position.set(-2.75, WATER_Y, -2.75);
    duck.rotation.y = 2.2;
    this.group.add(duck);
    this.floaters.push({ obj: duck, phase: 0 });

    // Vasi e piante sul cotto, lontani dalla piscinetta e dagli angoli dell'HUD.
    const place = (s: Sprite, x: number, z: number, scale = 1) => this.placeSprite(s, x, z, scale);
    place(bigPlant(), -6.6, -5.3);
    place(bigPlant(), 6.7, -5.2, 0.9);
    place(flowerPot('#e2574c'), -4.9, -5.4);
    place(flowerPot('#f08aa8'), 4.9, -5.4);
    place(flowerPot('#e2574c'), -6.9, -1.4);
    place(flowerPot('#f2a03d'), 6.8, -1.8);
    place(flowerPot('#9a7be0'), -7.1, 2.6);
    place(flowerPot('#e86a8a'), 7.0, 2.2);
  }
}
