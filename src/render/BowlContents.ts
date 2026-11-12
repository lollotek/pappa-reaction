import * as THREE from 'three';
import { hash } from './generative/canvasTexture';

const mat = (color: string, emissive?: string) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: emissive ?? '#000' });

/**
 * Contenuti della ciotola, low poly generativi: crocchette, tonno, salmone,
 * gamberetto d'oro e cacchetta (con mosche). Origine = fondo della ciotola.
 */
export function createBowlContents(): Map<string, THREE.Group> {
  const map = new Map<string, THREE.Group>();

  // Crocchette: mucchietto di pezzetti marroni.
  const kibble = new THREE.Group();
  const kibbleColors = ['#8a5a32', '#a46a3a', '#6e4526', '#b77d48'];
  for (let i = 0; i < 26; i++) {
    const a = hash(i, 1) * Math.PI * 2;
    const r = Math.sqrt(hash(i, 2)) * 0.62;
    const k = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.09, 0),
      mat(kibbleColors[i % kibbleColors.length]),
    );
    k.position.set(Math.cos(a) * r, 0.08 + (0.62 - r) * 0.35 + hash(i, 3) * 0.06, Math.sin(a) * r);
    k.rotation.set(hash(i, 4) * 3, hash(i, 5) * 3, 0);
    kibble.add(k);
  }
  map.set('crocchette', kibble);

  // Tonno: tocchetti rosa a strati.
  const tuna = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = i === 0 ? 0 : 0.35;
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.16, 0.22),
      mat(i % 2 ? '#e38f9b' : '#d27482'),
    );
    chunk.position.set(Math.cos(a) * r, i === 0 ? 0.28 : 0.14, Math.sin(a) * r);
    chunk.rotation.set(hash(i, 6) * 0.6, a, hash(i, 7) * 0.6);
    tuna.add(chunk);
  }
  map.set('tonno', tuna);

  // Salmone: trancio arancio con venature chiare.
  const salmon = new THREE.Group();
  const steak = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 7), mat('#f08a4b'));
  steak.position.y = 0.16;
  steak.rotation.z = 0.15;
  salmon.add(steak);
  for (let i = -1; i <= 1; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.85), mat('#ffd2b0'));
    stripe.position.set(i * 0.2, 0.28 + i * -0.03, 0);
    stripe.rotation.y = 0.5;
    salmon.add(stripe);
  }
  const skin = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 3, 7, Math.PI), mat('#9aa3a8'));
  skin.position.y = 0.16;
  skin.rotation.x = Math.PI / 2;
  salmon.add(skin);
  map.set('salmone', salmon);

  // Gamberetto d'oro: arco dorato con coda, leggermente luminoso.
  const shrimp = new THREE.Group();
  const gold = mat('#f5c842', '#5a4300');
  const bodyArc = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.12, 4, 8, Math.PI * 1.3), gold);
  bodyArc.rotation.set(0, 0, -0.4);
  bodyArc.position.y = 0.42;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 4), gold);
  tail.position.set(0.3, 0.12, 0);
  tail.rotation.z = -2.2;
  shrimp.add(bodyArc, tail);
  map.set('gamberetto', shrimp);

  // Cacchetta: torre di anelli marroni + mosche che ronzano.
  const poop = new THREE.Group();
  const browns = ['#5a3b22', '#6b4729', '#4d311c'];
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.34 - i * 0.08, 0.12 - i * 0.015, 4, 8),
      mat(browns[i % browns.length]),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12 + i * 0.15;
    poop.add(ring);
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 5), mat('#5a3b22'));
  tip.position.y = 0.72;
  tip.rotation.z = 0.4;
  poop.add(tip);
  const flies = new THREE.Group();
  flies.name = 'flies';
  for (let i = 0; i < 3; i++) {
    const fly = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.07), mat('#151515'));
    flies.add(fly);
  }
  poop.add(flies);
  map.set('cacchetta', poop);

  return map;
}

/** Anima le parti vive dei contenuti (mosche, scintillio del gamberetto). */
export function animateContent(group: THREE.Group, id: string, time: number): void {
  const s = time / 1000;
  if (id === 'cacchetta') {
    const flies = group.getObjectByName('flies');
    flies?.children.forEach((fly, i) => {
      const a = s * (5 + i) + i * 2.1;
      fly.position.set(
        Math.cos(a) * 0.5,
        0.75 + Math.sin(s * 9 + i) * 0.15,
        Math.sin(a * 1.3) * 0.5,
      );
    });
  } else if (id === 'gamberetto') {
    group.rotation.y = s * 1.5;
  } else {
    group.rotation.y = s * 0.3;
  }
}
