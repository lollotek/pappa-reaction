import * as THREE from 'three';
import { playerSlots } from '../config/controls';
import { GAMES } from '../games/registry';
import { Gamepads } from '../input/Gamepads';
import { openGame } from '../platform/navigation';
import { gamePath } from '../platform/routes';
import type { PixelRenderer } from '../render/PixelRenderer';
import { onTap } from '../ui/tap';
import { HubScene } from './HubScene';

/** Tempo dell'animazione di apertura prima di passare alla pagina del gioco. */
const OPEN_DELAY_MS = 480;

/**
 * Hub di Priamo Stadium: un oggetto 3D per minigioco. Frecce o tocco per
 * scegliere, "Avvia" (o INVIO) per giocare.
 */
export class Hub {
  private readonly scene3d = new HubScene(GAMES, playerSlots);
  private readonly logo: HTMLElement;
  private readonly info: HTMLElement;
  private readonly fade: HTMLElement;
  private opening = false;
  private message = '';
  private sawTouch = false;
  private readonly gamepads = new Gamepads();

  constructor(
    root: HTMLElement,
    private readonly pixel: PixelRenderer,
    private readonly base: string,
    private readonly debug: { el: HTMLElement; visible: () => boolean } | null,
  ) {
    document.body.classList.add('hub');
    pixel.attachCamera(this.scene3d.camera);
    window.addEventListener('resize', () => this.scene3d.fit());

    this.logo = el('div', 'hub-logo', '<h1>Priamo Stadium</h1><p>Scegli un gioco</p>');
    this.info = el('div', 'hub-info');
    this.fade = el('div', 'hub-fade');
    const play = el('div', 'hub-play');
    play.innerHTML = '<button type="button" data-tap="play">Avvia</button>';
    root.append(this.logo, this.info, play, this.fade);
    onTap(play, () => this.activate());

    window.addEventListener('keydown', (e) => this.onKey(e));
    const canvas = pixel.renderer.domElement;
    // Il tocco (o il clic) sceglie soltanto: per giocare c'è "Avvia".
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') {
        this.sawTouch = true;
        this.renderInfo();
      }
      if (this.opening) return;
      const i = this.pick(e);
      if (i !== null) this.select(i);
    });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    // Tornati all'hub con l'Indietro: la pagina può riprendere da dove era (cache del browser).
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) this.reset();
    });
  }

  start(): void {
    this.scene3d.fit();
    this.renderInfo();
    const loop = (now: number) => {
      this.onPad(now);
      this.scene3d.update(now);
      this.pixel.render(this.scene3d.scene, this.scene3d.camera);
      if (this.debug?.visible()) {
        const l = this.pixel.layout;
        this.debug.el.textContent = `hub · ${l.width}×${l.height} ×${l.scale} · gioco ${this.scene3d.selected}`;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.opening || e.repeat) return;
    const n = GAMES.length;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.select((this.scene3d.selected - 1 + n) % n);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.select((this.scene3d.selected + 1) % n);
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        this.activate();
        break;
      default: {
        const digit = /^Digit([1-9])$/.exec(e.code);
        if (!digit || Number(digit[1]) > n) return;
        this.select(Number(digit[1]) - 1);
        this.activate();
      }
    }
    e.preventDefault();
  }

  /** Controller: levetta o croce per scegliere, A o START per giocare. */
  private onPad(now: number): void {
    const pad = this.gamepads.poll(now);
    if (this.opening) return;
    const n = GAMES.length;
    for (const key of pad.menu) {
      if (key === 'left') this.select((this.scene3d.selected - 1 + n) % n);
      else if (key === 'right') this.select((this.scene3d.selected + 1) % n);
      else if (key === 'enter') this.activate();
    }
    if (pad.start) this.activate();
  }

  private pick(e: PointerEvent): number | null {
    const r = this.pixel.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    return this.scene3d.pick(ndc);
  }

  private select(i: number): void {
    if (i === this.scene3d.selected) return;
    this.scene3d.selected = i;
    this.message = '';
    this.renderInfo();
  }

  private activate(): void {
    if (this.opening) return;
    const game = GAMES[this.scene3d.selected];
    const now = performance.now();
    if (game.status !== 'ready') {
      this.scene3d.shake(this.scene3d.selected, now);
      this.message = `${game.title.join(' ')} arriva presto!`;
      this.renderInfo();
      return;
    }
    this.opening = true;
    this.scene3d.open(now);
    this.fade.classList.add('on');
    window.setTimeout(() => openGame(gamePath(this.base, game.id)), OPEN_DELAY_MS);
  }

  private reset(): void {
    this.opening = false;
    this.scene3d.reset();
    this.fade.classList.remove('on');
    this.renderInfo();
  }

  private renderInfo(): void {
    const game = GAMES[this.scene3d.selected];
    const touch = this.sawTouch || window.matchMedia?.('(pointer: coarse)').matches;
    const hint = touch ? 'Tocca un gioco per sceglierlo' : '← → scegli · INVIO avvia';
    this.info.style.setProperty('--accent', game.colors.ink);
    this.info.innerHTML = `
      <h2>${game.title.join(' ')}</h2>
      <p class="hub-tagline">${this.message || game.tagline}</p>
      <p class="hub-players">${game.players}</p>
      <p class="hub-hint">${hint}</p>`;
  }
}

function el(tag: string, className: string, html = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  e.innerHTML = html;
  return e;
}
