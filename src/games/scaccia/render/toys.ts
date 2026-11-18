import * as THREE from 'three';
import type { BallKind } from '../core/ScacciaMatch';

const flat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/** Colori dei giocattoli, scelti dall'id della palla. */
const YARN = ['#e2574c', '#5f8a8b', '#d9a441', '#8a6fa8'];
const PLASTIC = ['#f2c94c', '#5fb6e8', '#f08aa8', '#7fcf6a'];
const POMPON = ['#f7a8c4', '#fff4e0', '#b8e0f0', '#ffd27f'];

/**
 * Pallina-giocattolo dei gatti, low poly, di raggio `r`:
 * - gomitolo di lana (fili avvolti in più direzioni);
 * - pallina di plastica bucherellata con il sonaglio dentro;
 * - pompon spettinato.
 */
export function createToy(kind: BallKind, id: number, r: number): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'gomitolo': {
      const color = YARN[id % YARN.length];
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), flat(color)));
      const thread = flat(new THREE.Color(color).multiplyScalar(0.72).getStyle());
      for (let k = 0; k < 3; k++) {
        const wrap = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, r * 0.09, 3, 10), thread);
        wrap.rotation.set(k * 1.1, k * 0.7, k * 0.4);
        g.add(wrap);
      }
      // Capo del filo che sporge.
      const end = new THREE.Mesh(new THREE.BoxGeometry(r * 0.18, r * 0.18, r * 0.9), thread);
      end.position.set(r * 0.7, 0, r * 0.6);
      end.rotation.y = 0.8;
      g.add(end);
      break;
    }
    case 'sonaglio': {
      const color = PLASTIC[id % PLASTIC.length];
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), flat(color)));
      // Buchi scuri tutt'attorno (si intravede il sonaglio).
      const hole = flat('#2b2236');
      const dirs = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
      for (const [x, y, z] of dirs) {
        const h = new THREE.Mesh(new THREE.CircleGeometry(r * 0.3, 6), hole);
        h.position.set(x * r * 0.97, y * r * 0.97, z * r * 0.97);
        h.lookAt(x * 2 * r, y * 2 * r, z * 2 * r);
        g.add(h);
      }
      const band = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.07, 3, 12), flat('#ffffff'));
      band.rotation.x = Math.PI / 4;
      g.add(band);
      break;
    }
    case 'pompon': {
      const color = POMPON[id % POMPON.length];
      const geo = new THREE.IcosahedronGeometry(r * 0.95, 1);
      // Ciuffi: vertici spinti fuori a caso (ma sempre uguali per la stessa palla).
      const pos = geo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const n = Math.sin(v.x * 37 + v.y * 53 + v.z * 71 + id) * 0.5 + 0.5;
        v.multiplyScalar(1 + n * 0.28);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, flat(color)));
      break;
    }
  }
  return g;
}
