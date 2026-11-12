import * as THREE from 'three';
import type { PlayerSlot } from '../config/controls';
import { CatModel, type CatPose } from '../render/CatModel';
import { floorTexture } from '../render/generative/canvasTexture';

const POSES: CatPose[] = [
  'idle',
  'run',
  'dash',
  'eat',
  'bonk',
  'stunned',
  'yuck',
  'celebrate',
  'sad',
  'sit',
];

/**
 * Vetrina dei gatti (`?vetrina`): i 4 gatti da vicino, per rivedere modelli
 * e pose. ←/→ cambia posa, SPAZIO avvia/ferma la rotazione, A cicla automatico.
 */
export class Showroom {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
  private readonly cats: CatModel[] = [];
  private poseIndex = 0;
  private poseSince = 0;
  private spin = true;
  private auto = true;
  private angle = 0;
  private lastNow: number | null = null;
  private readonly label: HTMLElement;

  constructor(slots: readonly PlayerSlot[], container: HTMLElement) {
    this.scene.background = new THREE.Color('#2b2236');
    this.scene.add(new THREE.HemisphereLight('#fff4dc', '#5a4a52', 1.5));
    const sun = new THREE.DirectionalLight('#fff0d8', 1.5);
    sun.position.set(3, 10, 7);
    this.scene.add(sun);

    const tex = floorTexture();
    tex.repeat.set(4, 2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 10),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    slots.forEach((slot, i) => {
      const cat = new CatModel({
        breed: slot.breed,
        variant: i % 2 === 0 ? 0 : 1,
        collar: slot.badgeColor,
      });
      cat.root.position.set(-3.3 + i * 2.2, 0, 0);
      this.scene.add(cat.root);
      this.cats.push(cat);
    });

    this.camera.position.set(0, 3.2, 8);
    this.camera.lookAt(0, 0.6, 0);

    this.label = document.createElement('div');
    this.label.className = 'showroom-label';
    container.appendChild(this.label);
    const names = document.createElement('div');
    names.className = 'showroom-names';
    names.innerHTML = slots
      .map((s) => `<span style="--badge:${s.badgeColor}">${s.name}</span>`)
      .join('');
    container.appendChild(names);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowRight') this.setPose(this.poseIndex + 1);
      else if (e.code === 'ArrowLeft') this.setPose(this.poseIndex - 1);
      else if (e.code === 'Space') this.spin = !this.spin;
      else if (e.code === 'KeyA') this.auto = !this.auto;
      else return;
      e.preventDefault();
    });
  }

  update(now: number): void {
    const dt = this.lastNow === null ? 0 : now - this.lastNow;
    this.lastNow = now;
    if (this.auto && now - this.poseSince > 1800) this.setPose(this.poseIndex + 1, now);
    if (this.spin) this.angle += dt * 0.0006;
    const pose = POSES[this.poseIndex];
    for (const cat of this.cats) {
      const hop = pose === 'celebrate' ? Math.abs(Math.sin(now * 0.008)) * 0.4 : 0;
      cat.root.position.y = hop;
      cat.root.rotation.y = this.angle;
      cat.pose(pose, now, (now - this.poseSince) % 1200);
    }
    this.label.textContent = `posa: ${pose}  ·  ←/→ posa  ·  SPAZIO rotazione  ·  A auto ${this.auto ? 'on' : 'off'}`;
  }

  private setPose(i: number, now = performance.now()): void {
    this.poseIndex = (i + POSES.length) % POSES.length;
    this.poseSince = now;
  }
}
