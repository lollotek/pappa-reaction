import { playerSlots } from '../config/controls';
import { GAMES } from '../games/registry';
import { AudioEngine } from '../audio/AudioEngine';
import { loadSettings, type KeyValueStore, type Settings } from '../config/settings';
import { Device } from '../platform/Device';
import { MobileShell } from '../platform/MobileShell';
import { resolveTouchMode } from '../platform/touchMode';
import { Gamepads } from '../input/Gamepads';
import { openGame } from '../platform/navigation';
import { gamePath } from '../platform/routes';
import type { GameId } from '../games/registry';
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
  private readonly dots: HTMLElement;
  private readonly fade: HTMLElement;
  private readonly shell: MobileShell;
  private frame: HTMLIFrameElement | null = null;
  private gameId: GameId | null = null;
  private opening = false;
  private message = '';
  private sawTouch = false;
  private readonly gamepads = new Gamepads();
  private readonly audio = new AudioEngine();
  private readonly settings: Settings;
  private readonly coarse = window.matchMedia?.('(pointer: coarse)');

  constructor(
    private readonly root: HTMLElement,
    private readonly pixel: PixelRenderer,
    private readonly base: string,
    private readonly debug: { el: HTMLElement; visible: () => boolean } | null,
    store: KeyValueStore | null = null,
  ) {
    document.body.classList.add('hub');
    this.settings = loadSettings(store, playerSlots);
    pixel.attachCamera(this.scene3d.camera);
    window.addEventListener('resize', () => this.scene3d.fit());

    this.logo = el('div', 'hub-logo', '<h1>Priamo Stadium</h1><p>Scegli un gioco</p>');
    // A sinistra la vetrina 3D con le frecce, a destra nome, descrizione e Avvia.
    const nav = el(
      'div',
      'hub-nav',
      '<button type="button" class="hub-arrow" data-tap="prev" aria-label="Gioco precedente">‹</button>' +
        '<button type="button" class="hub-arrow" data-tap="next" aria-label="Gioco successivo">›</button>',
    );
    const panel = el('div', 'hub-panel');
    this.info = el('div', 'hub-info');
    this.dots = el('div', 'hub-dots');
    const play = el('div', 'hub-play');
    play.innerHTML = '<button type="button" data-tap="play">Avvia</button>';
    panel.append(this.info, play, this.dots);
    this.fade = el('div', 'hub-fade');
    root.append(this.logo, nav, panel, this.fade);
    // Come nei giochi: avviso di rotazione, schermo intero al primo tocco, pulsante per forzarlo.
    this.shell = new MobileShell(root, new Device(() => {}), {
      touch: () => this.touchMode(),
      auto: () => this.settings.fullscreen,
    });
    this.updateTouchMode();
    this.coarse?.addEventListener?.('change', () => this.updateTouchMode());
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || this.sawTouch) return;
      this.sawTouch = true;
      this.updateTouchMode();
    });
    const [prev, next] = Array.from(nav.querySelectorAll<HTMLElement>('.hub-arrow'));
    onTap(prev, () => this.step(-1));
    onTap(next, () => this.step(1));
    onTap(play, () => this.activate());

    window.addEventListener('keydown', (e) => this.onKey(e));
    const canvas = pixel.renderer.domElement;
    // Il tocco (o il clic) sceglie soltanto: per giocare c'è "Avvia".
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') {
        this.sawTouch = true;
        this.renderInfo();
      }
    });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    // Tornati all'hub con l'Indietro: la pagina può riprendere da dove era (cache del browser).
    // Il gioco (in iframe) chiede di tornare all'hub; Indietro/Avanti del browser aprono e chiudono il gioco.
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !this.frame || e.source !== this.frame.contentWindow) return;
      if (e.data?.priamo === 'close') this.closeGame(Number(e.data.extra) || 0);
      // Il gioco vuole una voce di cronologia per l'Indietro (pausa, menu precedente…).
      else if (e.data?.priamo === 'arm' && this.gameId) {
        history.pushState({ priamoGame: this.gameId, armed: true }, '', location.href);
      }
    });
    window.addEventListener('popstate', (e) => {
      const id = (e.state as { priamoGame?: GameId } | null)?.priamoGame;
      if (this.frame && !id) this.closeGame(0, true);
      // Tornati sulla voce base del gioco: l'Indietro è del gioco.
      else if (this.frame) this.frame.contentWindow?.postMessage({ priamo: 'back' }, location.origin);
      else if (id) {
        this.opening = true;
        this.fade.classList.add('on');
        this.launch(id, false);
      }
    });
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) this.reset();
    });
  }

  start(): void {
    this.scene3d.fit();
    this.renderInfo();
    const loop = (now: number) => {
      // Con un gioco aperto sopra l'hub non si disegna né si legge nulla.
      if (this.frame) {
        requestAnimationFrame(loop);
        return;
      }
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
    if (this.opening || this.frame || e.repeat) return;
    const n = GAMES.length;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.step(-1);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.step(1);
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
    for (const key of pad.menu) {
      if (key === 'left') this.step(-1);
      else if (key === 'right') this.step(1);
      else if (key === 'enter') this.activate();
    }
    if (pad.start) this.activate();
  }

  /** Modalità touch (stessa regola dei giochi, con la preferenza salvata). */
  private touchMode(): boolean {
    return resolveTouchMode(this.settings.touch, this.sawTouch, this.coarse?.matches ?? false);
  }

  private updateTouchMode(): void {
    document.body.classList.toggle('touch-mode', this.touchMode());
    this.renderInfo();
    this.shell.update();
  }

  /** Passa al gioco successivo (+1) o precedente (−1), in cerchio. */
  private step(dir: number): void {
    if (this.opening) return;
    const n = GAMES.length;
    this.audio.sfx('click');
    this.select((this.scene3d.selected + dir + n) % n);
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
      this.audio.sfx('click');
      this.scene3d.shake(this.scene3d.selected, now);
      this.message = `${game.title.join(' ')} arriva presto!`;
      this.renderInfo();
      return;
    }
    this.audio.sfx('confirm');
    this.opening = true;
    this.scene3d.open(now);
    this.fade.classList.add('on');
    window.setTimeout(() => this.launch(game.id), OPEN_DELAY_MS);
  }

  /**
   * Apre il gioco senza cambiare pagina: l'indirizzo cambia (e l'Indietro
   * funziona) ma il gioco sta in un iframe sopra l'hub. Così lo schermo intero
   * e la rotazione bloccata restano; chi non lo permette ricarica la pagina.
   */
  private launch(id: GameId, push = true): void {
    const url = gamePath(this.base, id);
    if (!window.history?.pushState) {
      openGame(url);
      return;
    }
    if (push) history.pushState({ priamoGame: id }, '', url);
    this.gameId = id;
    const frame = document.createElement('iframe');
    frame.className = 'hub-game';
    frame.title = GAMES.find((g) => g.id === id)?.title.join(' ') ?? 'Gioco';
    frame.allow = 'fullscreen; gamepad; autoplay; screen-wake-lock';
    frame.addEventListener('load', () => {
      frame.classList.add('ready');
      frame.contentWindow?.focus();
    });
    frame.src = url;
    this.root.appendChild(frame);
    this.frame = frame;
  }

  /** Chiude il gioco in iframe e torna all'hub; `extra` = voci di cronologia aggiunte dal gioco. */
  private closeGame(extra: number, fromHistory = false): void {
    if (!this.frame) return;
    this.frame.remove();
    this.frame = null;
    this.gameId = null;
    window.focus();
    this.reset();
    if (!fromHistory && history.state?.priamoGame) history.go(-(1 + extra));
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
    const hint = touch ? 'Usa le frecce per scegliere' : '← → scegli · INVIO avvia';
    this.info.style.setProperty('--accent', game.colors.ink);
    this.info.innerHTML = `
      <h2>${game.title.join(' ')}</h2>
      <p class="hub-tagline">${this.message || game.tagline}</p>
      <p class="hub-players">${game.players}</p>
      <p class="hub-hint">${hint}</p>`;
    this.dots.innerHTML = GAMES.map(
      (_, i) => `<i class="${i === this.scene3d.selected ? 'on' : ''}"></i>`,
    ).join('');
  }
}

function el(tag: string, className: string, html = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  e.innerHTML = html;
  return e;
}
