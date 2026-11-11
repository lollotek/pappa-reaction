import * as THREE from 'three';
import { flowerPotTexture, rugTexture } from './generative/canvasTexture';

const flat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/** Altezza del coperchio chiuso e aperto. */
const LID_CLOSED_Y = 0.5;
const LID_OPEN_Y = 1.6;
const LID_OPEN_BACK = 1.5;

/** Colori provvisori dei contenuti della ciotola (greybox). */
const CONTENT_COLORS: Record<string, string> = {
  crocchette: '#8a5a32',
  tonno: '#e48fa0',
  salmone: '#f08a4b',
  gamberetto: '#f5c842',
  cacchetta: '#5a3b22',
};

/**
 * Ambiente generativo: pavimento, tappeto-pista, ciotola, coperchio,
 * mano arbitro, contenuto e decori 2D.
 */
export class Arena {
  readonly group = new THREE.Group();
  private readonly lid = new THREE.Group();
  private readonly hand = new THREE.Group();
  private readonly contents = new Map<string, THREE.Mesh>();
  private readonly billboards: THREE.Mesh[] = [];

  constructor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshLambertMaterial({ color: '#6b4a35' }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;

    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(5, 32),
      new THREE.MeshLambertMaterial({ map: rugTexture(), transparent: true }),
    );
    rug.rotation.x = -Math.PI / 2;

    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.9, 0.5, 10), flat('#d9d2c3'));
    bowl.position.y = 0.25;
    this.group.add(floor, rug, bowl);

    // Coperchio a cupola con pomello.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.3, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      flat('#a8743f'),
    );
    const knob = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), flat('#7a4f2a'));
    knob.position.y = 1.35;
    this.lid.add(dome, knob);
    this.lid.position.y = LID_CLOSED_Y;
    this.group.add(this.lid);

    // Mano arbitro (greybox): palmo + dita, appesa sopra il pomello.
    const skin = flat('#f1c7a4');
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.5), skin);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), skin);
      finger.position.set(-0.22 + i * 0.15, -0.25, 0.15);
      palm.add(finger);
    }
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 3, 6), flat('#4f6fa8'));
    sleeve.position.y = 1.6;
    this.hand.add(palm, sleeve);
    this.hand.position.y = 0.45;
    this.lid.add(this.hand);

    // Contenuti: un solido low poly per tipo, mostrato al reveal.
    for (const [id, color] of Object.entries(CONTENT_COLORS)) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), flat(color));
      mesh.position.y = 0.7;
      mesh.visible = false;
      this.contents.set(id, mesh);
      this.group.add(mesh);
    }

    // Decori 2D: vasi di fiori attorno al tappeto.
    const petals = ['#e86a8a', '#f2a03d', '#9a7be0', '#ffffff'];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const plant = new THREE.Mesh(
        new THREE.PlaneGeometry(0.67, 1),
        new THREE.MeshBasicMaterial({
          map: flowerPotTexture(petals[i % petals.length]),
          transparent: true,
          alphaTest: 0.5,
        }),
      );
      plant.position.set(Math.cos(a) * 6.2, 0.5, Math.sin(a) * 6.2);
      this.billboards.push(plant);
      this.group.add(plant);
    }
  }

  /** 0 = chiuso, 1 = aperto; `wobble` aggiunge oscillazione all'apertura. */
  setLid(open: number, wobble = 0): void {
    // Si alza e arretra inclinandosi all'indietro, così la pappa resta visibile alla camera.
    this.lid.position.y = LID_CLOSED_Y + (LID_OPEN_Y - LID_CLOSED_Y) * open + wobble * 0.3;
    this.lid.position.z = -LID_OPEN_BACK * open;
    this.lid.rotation.x = -0.7 * open + wobble * 0.15;
  }

  /** Mostra un contenuto (o nessuno) con una scala 0..1. */
  setContent(id: string | null, scale = 1, time = 0): void {
    for (const [cid, mesh] of this.contents) {
      mesh.visible = cid === id && scale > 0;
      if (mesh.visible) {
        mesh.scale.setScalar(scale);
        mesh.rotation.y = time * 0.002;
      }
    }
  }

  /** Billboard dei decori verso la camera (solo asse Y). */
  faceCamera(camera: THREE.Camera): void {
    for (const b of this.billboards) {
      b.rotation.y = Math.atan2(camera.position.x - b.position.x, camera.position.z - b.position.z);
    }
  }
}
