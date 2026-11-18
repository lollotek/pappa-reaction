import * as THREE from 'three';
import type { PlayerSlot } from '../config/controls';
import type { GameInfo } from '../games/registry';
import { createToy } from '../games/scaccia/render/toys';
import { CatModel, type CatPose } from '../render/CatModel';
import { createBowlContents } from '../render/BowlContents';

/** Distanza dal centro dei due oggetti: in mezzo resta lo spazio per "Avvia". */
const ITEM_X = 2.7;
/** Metà della larghezza da tenere sempre in vista (oggetti + gatti ai lati). */
const VIEW_HALF_W = 6.8;
const VIEW_HALF_H = 2.6;
const BASE_Y = 1.45;
const LOOK_AT = new THREE.Vector3(0, 1.6, 0);
const OPEN_MS = 520;
const SHAKE_MS = 420;

interface Item {
  game: GameInfo;
  /** Gruppo che si muove (posizione, scala, bob). */
  group: THREE.Group;
  /** Parte che gira su sé stessa. */
  body: THREE.Object3D;
  halo: THREE.Mesh;
  x: number;
  /** 0..1, segue la selezione con una molla. */
  focus: number;
}

/**
 * Scena 3D dell'hub: un oggetto per gioco su fondo nero (il piattino col
 * salmone per Pappa Reaction, la pallina per Scaccia la palla), con i quattro
 * gatti ai lati che guardano quello selezionato. I testi sono in HTML.
 */
export class HubScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
  readonly items: Item[] = [];
  selected = 0;
  private readonly cats: { model: CatModel; x: number }[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private lastNow: number | null = null;
  private openedAt: number | null = null;
  private shakeAt = -Infinity;
  private shakeItem = -1;

  constructor(games: readonly GameInfo[], slots: readonly PlayerSlot[]) {
    this.scene.background = new THREE.Color('#000');
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.7));
    const key = new THREE.DirectionalLight('#fff0d8', 1.7);
    key.position.set(2, 8, 9);
    this.scene.add(key);

    // Pedana appena visibile sotto oggetti e gatti.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(8, 40),
      new THREE.MeshLambertMaterial({ color: '#16121c' }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.scale.set(1, 0.45, 1);
    this.scene.add(floor);

    games.forEach((game, i) => {
      const x = (i - (games.length - 1) / 2) * 2 * ITEM_X;
      const group = new THREE.Group();
      const built = game.id === 'pappa' ? buildPlate() : buildBall();
      const body = built.spin;
      group.add(built.root);
      // Alone morbido dietro l'oggetto selezionato.
      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(1.75, 32),
        new THREE.MeshBasicMaterial({
          color: game.colors.ink,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      halo.position.z = -0.9;
      group.add(halo);
      // Zona di tocco generosa (invisibile): comoda col dito.
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(1.9, 8, 6),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      group.add(hit);
      group.traverse((o) => (o.userData.item = i));
      group.position.set(x, BASE_Y, 0);
      this.scene.add(group);
      this.items.push({ game, group, body, halo, x, focus: 0 });
    });

    // Due gatti per lato, seduti davanti alla pedana.
    const side = ITEM_X + 2.2;
    const spots = [-side - 1.15, -side, side, side + 1.15];
    slots.forEach((slot, i) => {
      const model = new CatModel({
        breed: slot.breed,
        variant: slot.variant,
        collar: slot.badgeColor,
      });
      const x = spots[i] ?? 0;
      model.root.position.set(x, 0, i % 3 === 0 ? 0.2 : 0.9);
      this.scene.add(model.root);
      this.cats.push({ model, x });
    });
  }

  /** Inquadratura che tiene in vista tutto, in orizzontale come in verticale. */
  fit(): void {
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const dist = Math.max(VIEW_HALF_W / Math.tan(hFov / 2), VIEW_HALF_H / Math.tan(vFov / 2));
    this.camera.position.set(0, LOOK_AT.y + dist * 0.12, dist);
    this.camera.lookAt(LOOK_AT);
  }

  /** Indice dell'oggetto sotto il punto (coordinate normalizzate −1..1), o null. */
  pick(ndc: THREE.Vector2): number | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.items.map((c) => c.group),
      true,
    );
    for (const h of hits) {
      const i = h.object.userData.item;
      if (typeof i === 'number') return i;
    }
    return null;
  }

  /** L'oggetto selezionato vola verso la camera (si sta aprendo il gioco). */
  open(now: number): void {
    this.openedAt = now;
  }

  /** Gioco "prossimamente": scuote la testa. */
  shake(i: number, now: number): void {
    this.shakeItem = i;
    this.shakeAt = now;
  }

  /** Torna allo stato iniziale (pagina ripresa dalla cronologia). */
  reset(): void {
    this.openedAt = null;
  }

  update(now: number): void {
    const dt = this.lastNow === null ? 0 : Math.min(100, now - this.lastNow);
    this.lastNow = now;
    const k = 1 - Math.exp(-dt / 90);
    const open = this.openedAt === null ? 0 : Math.min(1, (now - this.openedAt) / OPEN_MS);

    this.items.forEach((item, i) => {
      const target = i === this.selected ? 1 : 0;
      item.focus += (target - item.focus) * k;
      const f = item.focus;
      const g = item.group;
      const bob = Math.sin(now * 0.003 + i) * 0.09 * f;
      g.position.x = item.x;
      g.position.y = BASE_Y + 0.25 * f + bob;
      g.position.z = 0.8 * f;
      g.rotation.z = 0;
      g.scale.setScalar(0.82 + 0.28 * f);
      // Gira piano se a riposo, vivace quando è selezionato.
      item.body.rotation.y = now * (0.0004 + 0.0014 * f) * (i % 2 ? -1 : 1);
      (item.halo.material as THREE.MeshBasicMaterial).opacity =
        f * (0.32 + 0.1 * Math.sin(now * 0.006));

      if (i === this.shakeItem) {
        const t = (now - this.shakeAt) / SHAKE_MS;
        if (t < 1) g.rotation.z = Math.sin(t * Math.PI * 6) * 0.12 * (1 - t);
      }
      if (open > 0 && i === this.selected) {
        // Verso la camera, centrato.
        const e = open * open;
        g.position.x = item.x * (1 - e);
        g.position.z = 0.8 + e * (this.camera.position.z * 0.55);
        g.position.y += (LOOK_AT.y + 0.4 - g.position.y) * e;
      }
    });

    const sel = this.items[this.selected];
    for (const [i, cat] of this.cats.entries()) {
      // Guardano l'oggetto selezionato.
      const dx = (sel?.group.position.x ?? 0) - cat.x;
      cat.model.root.rotation.y = THREE.MathUtils.clamp(Math.atan2(dx, 4) * 0.8, -0.9, 0.9);
      const pose: CatPose = open > 0 ? 'celebrate' : i % 2 ? 'idle' : 'sit';
      const hop = pose === 'celebrate' ? Math.abs(Math.sin(now * 0.012 + i)) * 0.35 : 0;
      cat.model.root.position.y = hop;
      cat.model.pose(pose, now, now % 1200);
    }
  }
}

const flat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/** Piattino con il trancio di salmone, inclinato verso la camera. */
interface Built {
  root: THREE.Object3D;
  /** Parte che gira su sé stessa. */
  spin: THREE.Object3D;
}

function buildPlate(): Built {
  const tilt = new THREE.Group();
  tilt.rotation.x = 0.55;
  const spin = new THREE.Group();
  tilt.add(spin);

  const profile = [
    [0, 0],
    [0.7, 0],
    [0.95, 0.1],
    [1.3, 0.24],
    [1.3, 0.3],
    [1.2, 0.27],
    [0.9, 0.16],
    [0, 0.16],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const plate = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 14),
    new THREE.MeshLambertMaterial({ color: '#f1e8d8', flatShading: true, side: THREE.DoubleSide }),
  );
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.26, 0.045, 4, 14), flat('#5fb6e8'));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.29;
  spin.add(plate, rim);

  const salmon = createBowlContents().get('salmone');
  if (salmon) {
    salmon.scale.setScalar(1.55);
    salmon.position.y = 0.1;
    spin.add(salmon);
  }
  // Il gruppo esterno resta inclinato, quello interno gira.
  return { root: tilt, spin };
}

/** Pallina-giocattolo con il sonaglio. */
function buildBall(): Built {
  const ball = createToy('sonaglio', 1, 1.1);
  return { root: ball, spin: ball };
}
