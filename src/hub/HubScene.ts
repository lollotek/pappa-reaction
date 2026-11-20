import * as THREE from 'three';
import type { PlayerSlot } from '../config/controls';
import type { GameInfo } from '../games/registry';
import { cardboardTexture } from '../games/graffio/render/textures';
import { createToy } from '../games/scaccia/render/toys';
import { CatModel, type CatPose } from '../render/CatModel';
import { createBowlContents } from '../render/BowlContents';

/** Distanza tra due oggetti vicini nello scorrimento (ne resta visibile uno solo). */
const ITEM_SPACING = 4.4;
/** Metà larghezza della "vetrina": oggetto più i gatti ai lati. */
const STAGE_HALF_W = 4.1;
/** Dove sta il centro della vetrina: frazione dello schermo da sinistra (orizzontale) o dall'alto (verticale). */
const STAGE_CENTER_X = 0.28;
const STAGE_CENTER_Y = 0.3;
/** Posti dei gatti rispetto all'oggetto. */
const CAT_SPOTS = [-3.4, -2.3, 2.3, 3.4];
const VIEW_HALF_H = 3.1;
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
  /** 0..1, segue la selezione con una molla. */
  focus: number;
}

/**
 * Scena 3D dell'hub: un oggetto per gioco su fondo nero (il piattino col
 * salmone per Pappa Reaction, la pallina per Scaccia la palla, il tubo di
 * cartone per Graffio Killer, la pista con la cacchetta per Corsa pazza), con i quattro
 * gatti ai lati che guardano quello selezionato. I testi sono in HTML.
 */
export class HubScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
  readonly items: Item[] = [];
  selected = 0;
  /** Tutto quel che sta in vetrina: si sposta di lato (o in alto) per lasciare posto al testo. */
  private readonly stage = new THREE.Group();
  /** Posizione di scorrimento (indice frazionario del gioco mostrato). */
  private scroll = 0;
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
    this.scene.add(key, this.stage);

    // Pedana appena visibile sotto oggetti e gatti.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(8, 40),
      new THREE.MeshLambertMaterial({ color: '#16121c' }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.scale.set(1, 0.45, 1);
    this.stage.add(floor);

    games.forEach((game, i) => {
      const group = new THREE.Group();
      const built =
        game.id === 'pappa'
          ? buildPlate()
          : game.id === 'graffio'
            ? buildTube()
            : game.id === 'corsa'
              ? buildTrack()
              : buildBall();
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
      group.position.set(0, BASE_Y, 0);
      this.stage.add(group);
      this.items.push({ game, group, body, halo, focus: 0 });
    });

    // Due gatti per lato, seduti davanti alla pedana.
    const spots = CAT_SPOTS;
    slots.forEach((slot, i) => {
      const model = new CatModel({
        breed: slot.breed,
        variant: slot.variant,
        collar: slot.badgeColor,
      });
      const x = spots[i] ?? 0;
      model.root.position.set(x, 0, i % 3 === 0 ? 0.2 : 0.9);
      this.stage.add(model.root);
      this.cats.push({ model, x });
    });
  }

  /**
   * Inquadratura: la vetrina (oggetto e gatti) occupa la parte sinistra dello
   * schermo (in alto se è in verticale), il resto è per il testo.
   */
  fit(): void {
    const portrait = this.camera.aspect < 1;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const halfW = portrait ? STAGE_HALF_W : STAGE_HALF_W / (2 * STAGE_CENTER_X);
    const halfH = portrait ? VIEW_HALF_H / (2 * STAGE_CENTER_Y) : VIEW_HALF_H;
    const dist = Math.max(halfW / Math.tan(hFov / 2), halfH / Math.tan(vFov / 2));
    this.camera.position.set(0, LOOK_AT.y + dist * 0.12, dist);
    this.camera.lookAt(LOOK_AT);
    const seenW = dist * Math.tan(hFov / 2);
    const seenH = dist * Math.tan(vFov / 2);
    this.stage.position.set(
      portrait ? 0 : (2 * STAGE_CENTER_X - 1) * seenW,
      portrait ? (1 - 2 * STAGE_CENTER_Y) * seenH : 0,
      0,
    );
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

    this.scroll += (this.selected - this.scroll) * (1 - Math.exp(-dt / 110));
    this.items.forEach((item, i) => {
      const d = i - this.scroll;
      // Scorre di lato e rimpicciolisce uscendo: ne vedi uno alla volta.
      const vis = THREE.MathUtils.clamp((1 - Math.abs(d)) / 0.5, 0, 1);
      const target = i === this.selected ? 1 : 0;
      item.focus += (target - item.focus) * k;
      const f = item.focus;
      const g = item.group;
      g.visible = vis > 0.01;
      const bob = Math.sin(now * 0.003 + i) * 0.09 * f;
      g.position.x = d * ITEM_SPACING;
      g.position.y = BASE_Y + 0.25 * f + bob;
      g.position.z = 0.8 * f;
      g.rotation.z = 0;
      g.scale.setScalar((0.82 + 0.28 * f) * vis);
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
        // Verso il centro dello schermo (la vetrina è spostata di lato).
        g.position.x = g.position.x * (1 - e) - this.stage.position.x * e;
        g.position.z = 0.8 + e * (this.camera.position.z * 0.55);
        g.position.y += (LOOK_AT.y + 0.4 - this.stage.position.y - g.position.y) * e;
      }
    });

    for (const [i, cat] of this.cats.entries()) {
      // Guardano l'oggetto selezionato.
      const dx = -cat.x; // guardano l'oggetto al centro della vetrina
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

/** Tubo di cartone con la tacca rossa, spezzato da un taglio netto. */
function buildTube(): Built {
  const tilt = new THREE.Group();
  tilt.rotation.x = 0.25;
  const spin = new THREE.Group();
  tilt.add(spin);
  const card = new THREE.MeshLambertMaterial({ map: cardboardTexture(), flatShading: true });
  const cap = flat('#e3b27a');
  const piece = (len: number, y: number): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, len, 12), [card, cap, cap]);
    m.position.y = y;
    return m;
  };
  // Pezzo sotto e pezzo sopra, appena staccati dal taglio.
  spin.add(piece(1.5, -0.95), piece(1.4, 0.75));
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.64, 0.64, 0.24, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ff3030', side: THREE.DoubleSide }),
  );
  band.position.y = -0.45;
  spin.add(band);
  return { root: tilt, spin };
}

/** Pallina-giocattolo con il sonaglio. */
function buildBall(): Built {
  const ball = createToy('sonaglio', 1, 1.1);
  return { root: ball, spin: ball };
}

/** Rettangolo con gli angoli arrotondati, come forma (o buco) da estrudere. */
function roundedRect(
  w: number,
  h: number,
  r: number,
  path: THREE.Path = new THREE.Shape(),
): THREE.Path {
  const x = -w / 2;
  const y = -h / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

/** Pista di terra battuta con l'isola d'erba, lo steccato e una cacchetta. */
function buildTrack(): Built {
  const tilt = new THREE.Group();
  tilt.rotation.x = 0.7;
  const spin = new THREE.Group();
  tilt.add(spin);

  const depth = 0.16;
  const ringShape = roundedRect(3.1, 2.1, 0.75) as THREE.Shape;
  ringShape.holes.push(roundedRect(1.5, 0.5, 0.2, new THREE.Path()));
  const ring = new THREE.Mesh(
    new THREE.ExtrudeGeometry(ringShape, { depth, bevelEnabled: false }),
    [flat('#b08158'), flat('#8f6a40')],
  );
  const island = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRect(1.5, 0.5, 0.2) as THREE.Shape, {
      depth: depth * 0.8,
      bevelEnabled: false,
    }),
    flat('#5aa04f'),
  );
  // L'estrusione parte sul piano xy: si sdraia con il lato lungo verso la camera.
  const base = new THREE.Group();
  base.rotation.x = -Math.PI / 2;
  base.add(ring, island);
  spin.add(base);

  // Steccato: sottile bordo di legno attorno alla pista.
  const fence = new THREE.Mesh(
    new THREE.ExtrudeGeometry(
      (() => {
        const outer = roundedRect(3.3, 2.3, 0.85) as THREE.Shape;
        outer.holes.push(roundedRect(3.1, 2.1, 0.75, new THREE.Path()));
        return outer;
      })(),
      { depth: 0.32, bevelEnabled: false },
    ),
    flat('#8a5a34'),
  );
  base.add(fence);

  // Cacchetta sul rettilineo davanti.
  const poop = new THREE.Group();
  const brown = flat('#6b4524');
  const a = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.12, 8), brown);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.12, 8), flat('#4d3119'));
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 8), brown);
  a.position.y = 0.06;
  b.position.y = 0.18;
  c.position.y = 0.34;
  poop.add(a, b, c);
  poop.position.set(0.5, depth, 0.78);
  spin.add(poop);
  return { root: tilt, spin };
}
