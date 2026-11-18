import * as THREE from 'three';
import type { PlayerSlot } from '../config/controls';
import type { GameInfo } from '../games/registry';
import { CatModel, type CatPose } from '../render/CatModel';
import { cardTexture } from './cardArt';

const CARD_W = 2.2;
const CARD_H = 2.93;
const CARD_GAP = 0.75;
/** Metà della larghezza da tenere sempre in vista (schede + gatti ai lati). */
const VIEW_HALF_W = 6.4;
const VIEW_HALF_H = 2.6;
const LOOK_AT = new THREE.Vector3(0, 1.75, 0);
const OPEN_MS = 520;
const SHAKE_MS = 420;

interface Card {
  game: GameInfo;
  group: THREE.Group;
  face: THREE.MeshBasicMaterial;
  glow: THREE.Mesh;
  x: number;
  /** 0..1, segue la selezione con una molla. */
  focus: number;
}

/**
 * Scena 3D dell'hub: schede dei minigiochi su fondo nero, con i quattro
 * gatti ai lati che guardano la scheda selezionata.
 */
export class HubScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
  readonly cards: Card[] = [];
  selected = 0;
  private readonly cats: { model: CatModel; x: number }[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private lastNow: number | null = null;
  private openedAt: number | null = null;
  private shakeAt = -Infinity;
  private shakeCard = -1;

  constructor(games: readonly GameInfo[], slots: readonly PlayerSlot[]) {
    this.scene.background = new THREE.Color('#000');
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.55));
    const key = new THREE.DirectionalLight('#fff0d8', 1.6);
    key.position.set(2, 8, 9);
    this.scene.add(key);

    // Pedana appena visibile sotto schede e gatti.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7.5, 40),
      new THREE.MeshLambertMaterial({ color: '#16121c' }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.scale.set(1, 0.45, 1);
    this.scene.add(floor);

    const total = games.length * CARD_W + (games.length - 1) * CARD_GAP;
    games.forEach((game, i) => {
      const x = -total / 2 + CARD_W / 2 + i * (CARD_W + CARD_GAP);
      const group = new THREE.Group();
      const face = new THREE.MeshBasicMaterial({ map: cardTexture(game) });
      const edge = new THREE.MeshLambertMaterial({ color: game.colors.dark });
      const box = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, CARD_H, 0.12), [
        edge,
        edge,
        edge,
        edge,
        face,
        edge,
      ]);
      box.userData.card = i;
      group.add(box);
      // Cornice luminosa dietro la scheda selezionata.
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_W + 0.24, CARD_H + 0.24),
        new THREE.MeshBasicMaterial({ color: game.colors.ink, transparent: true, opacity: 0 }),
      );
      glow.position.z = -0.08;
      group.add(glow);
      group.position.set(x, CARD_H / 2 + 0.35, 0);
      this.scene.add(group);
      this.cards.push({ game, group, face, glow, x, focus: 0 });
    });

    // Due gatti per lato, seduti davanti alla pedana.
    const side = total / 2 + 1.1;
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

  /** Indice della scheda sotto il punto (coordinate normalizzate −1..1), o null. */
  pick(ndc: THREE.Vector2): number | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.cards.map((c) => c.group),
      true,
    );
    for (const h of hits) {
      const i = h.object.userData.card;
      if (typeof i === 'number') return i;
    }
    return null;
  }

  /** La scheda selezionata vola verso la camera (si sta aprendo il gioco). */
  open(now: number): void {
    this.openedAt = now;
  }

  /** Scheda "prossimamente": scuote la testa. */
  shake(i: number, now: number): void {
    this.shakeCard = i;
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

    this.cards.forEach((card, i) => {
      const target = i === this.selected ? 1 : 0;
      card.focus += (target - card.focus) * k;
      const f = card.focus;
      const g = card.group;
      const bob = Math.sin(now * 0.0025 + i) * 0.05 * f;
      g.position.x = card.x;
      g.position.y = CARD_H / 2 + 0.35 + 0.15 * f + bob;
      g.position.z = 0.7 * f;
      // Le schede non selezionate si girano un po' verso il centro.
      g.rotation.y = (1 - f) * -Math.sign(card.x) * 0.25 + Math.sin(now * 0.0013 + i) * 0.04 * f;
      g.rotation.z = 0;
      const s = 1 + 0.08 * f;
      g.scale.setScalar(s);
      card.face.color.setScalar(0.5 + 0.5 * f);
      (card.glow.material as THREE.MeshBasicMaterial).opacity =
        f * (0.75 + 0.25 * Math.sin(now * 0.006));

      if (i === this.shakeCard) {
        const t = (now - this.shakeAt) / SHAKE_MS;
        if (t < 1) g.rotation.z = Math.sin(t * Math.PI * 6) * 0.08 * (1 - t);
      }
      if (open > 0 && i === this.selected) {
        // Verso la camera, centrata.
        const e = open * open;
        g.position.x = card.x * (1 - e);
        g.position.z = 0.7 + e * (this.camera.position.z * 0.55);
        g.position.y += (LOOK_AT.y + 0.4 - g.position.y) * e;
        g.rotation.y *= 1 - e;
      }
    });

    const sel = this.cards[this.selected];
    for (const [i, cat] of this.cats.entries()) {
      // Guardano la scheda selezionata.
      const dx = (sel?.group.position.x ?? 0) - cat.x;
      cat.model.root.rotation.y = THREE.MathUtils.clamp(Math.atan2(dx, 4) * 0.8, -0.9, 0.9);
      const pose: CatPose = open > 0 ? 'celebrate' : i % 2 ? 'idle' : 'sit';
      const hop = pose === 'celebrate' ? Math.abs(Math.sin(now * 0.012 + i)) * 0.35 : 0;
      cat.model.root.position.y = hop;
      cat.model.pose(pose, now, now % 1200);
    }
  }
}
