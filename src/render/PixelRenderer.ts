import * as THREE from 'three';
import { computePixelLayout, type PixelLayout } from './pixelLayout';

/**
 * Renderer "pixel": la scena viene disegnata a bassa risoluzione
 * (circa `targetHeight` righe) e il canvas viene ingrandito via CSS
 * con `image-rendering: pixelated` e scala intera.
 */
export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  layout!: PixelLayout;
  private readonly cameras = new Set<THREE.PerspectiveCamera>();

  constructor(
    private readonly container: HTMLElement,
    private readonly targetHeight: number,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.style.imageRendering = 'pixelated';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Le camere registrate aggiornano l'aspect ratio al resize. */
  attachCamera(camera: THREE.PerspectiveCamera): void {
    this.cameras.add(camera);
    this.updateCamera(camera);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }

  private resize(): void {
    this.layout = computePixelLayout(
      this.container.clientWidth,
      this.container.clientHeight,
      window.devicePixelRatio,
      this.targetHeight,
    );
    const { width, height, cssWidth, cssHeight } = this.layout;
    this.renderer.setSize(width, height, false);
    const canvas = this.renderer.domElement;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    this.cameras.forEach((c) => this.updateCamera(c));
  }

  private updateCamera(camera: THREE.PerspectiveCamera): void {
    camera.aspect = this.layout.width / this.layout.height;
    camera.updateProjectionMatrix();
  }
}
