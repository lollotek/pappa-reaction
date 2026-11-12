import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  age: number;
  life: number;
  gravity: number;
  fade: boolean;
  spin: number;
}

const CONFETTI = ['#e2574c', '#f2c94c', '#5f8a8b', '#8a6fa8', '#7d9a6a', '#f4efe4'];

/** Particelle semplici (quadratini billboard): polvere e coriandoli. */
export class Fx {
  readonly group = new THREE.Group();
  private readonly particles: Particle[] = [];
  private readonly quad = new THREE.PlaneGeometry(1, 1);

  /** Sbuffi di polvere ai piedi di un gatto che scatta o frena. */
  dust(at: THREE.Vector3, count = 6): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn({
        color: i % 2 ? '#efe0bd' : '#d9c7a0',
        size: 0.18 + Math.random() * 0.14,
        pos: at.clone().add(new THREE.Vector3(Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3)),
        vel: new THREE.Vector3(Math.cos(a) * 0.8, 0.9 + Math.random() * 0.6, Math.sin(a) * 0.8),
        life: 450 + Math.random() * 250,
        gravity: -0.5,
        fade: true,
      });
    }
  }

  /** Pioggia di coriandoli sopra la ciotola (vittoria finale). */
  confetti(count = 70): void {
    for (let i = 0; i < count; i++) {
      this.spawn({
        color: CONFETTI[i % CONFETTI.length],
        size: 0.14,
        pos: new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          5 + Math.random() * 3,
          (Math.random() - 0.5) * 7,
        ),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 1.2,
          -1.5 - Math.random(),
          (Math.random() - 0.5) * 1.2,
        ),
        life: 3500 + Math.random() * 1500,
        gravity: -0.4,
        fade: false,
        spin: 6 + Math.random() * 8,
      });
    }
  }

  clear(): void {
    for (const p of this.particles) this.group.remove(p.mesh);
    this.particles.length = 0;
  }

  update(dtMs: number, camera: THREE.Camera): void {
    const dt = dtMs / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dtMs;
      if (p.age >= p.life || p.mesh.position.y < -0.2) {
        this.group.remove(p.mesh);
        p.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.quaternion.copy(camera.quaternion);
      if (p.spin) p.mesh.rotateZ(p.age * 0.001 * p.spin);
      if (p.fade) p.material.opacity = 1 - p.age / p.life;
    }
  }

  private spawn(o: {
    color: string;
    size: number;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    life: number;
    gravity: number;
    fade: boolean;
    spin?: number;
  }): void {
    const material = new THREE.MeshBasicMaterial({
      color: o.color,
      transparent: o.fade,
      depthWrite: !o.fade,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.quad, material);
    mesh.scale.setScalar(o.size);
    mesh.position.copy(o.pos);
    this.group.add(mesh);
    this.particles.push({
      mesh,
      material,
      vel: o.vel,
      age: 0,
      life: o.life,
      gravity: o.gravity,
      fade: o.fade,
      spin: o.spin ?? 0,
    });
  }
}
