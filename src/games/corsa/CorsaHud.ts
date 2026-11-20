import * as THREE from 'three';
import type { PlayerSlot } from '../../config/controls';
import { keyLabel } from '../../config/keyLabel';
import type { KeyPair } from '../../config/settings';
import type { AudioStatus } from '../../game/GameDef';
import type { PixelLayout } from '../../render/pixelLayout';
import type { CorsaEvent, CorsaMatch } from './core/CorsaMatch';
import type { CorsaScene } from './render/CorsaScene';
import { corsaTuning } from './tuning';

/** Pannello di ogni gatto in un angolo, nell'ordine degli slot. */
const CORNER = ['bl', 'br', 'tl', 'tr'] as const;
/** Quanto restano le nuvolette (ms). */
const BUBBLE_MS = 1300;
/** "VIA!" e "ULTIMO GIRO!" restano un attimo. */
const GO_MS = 900;
const LAST_LAP_MS = 2200;

function restartAnimation(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth; // forza il reflow
  el.classList.add(cls);
}

const formatTime = (ms: number) => {
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
};

const ordinal = (n: number) => `${n}°`;

/**
 * HUD di Corsa pazza: nell'isola al centro la classifica live e il giro, negli
 * angoli un pannello per gatto con posizione e cacchette in riserva.
 */
export class CorsaHud {
  private readonly root: HTMLElement;
  private readonly panels: HTMLElement[] = [];
  private readonly places: HTMLElement[] = [];
  private readonly dots: HTMLElement[] = [];
  private readonly bubbles: { el: HTMLElement; until: number }[] = [];
  private readonly board: HTMLElement;
  private readonly boardRows: HTMLElement;
  private readonly boardLap: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly finalPanel: HTMLElement;
  private readonly audioLabel: HTMLElement;
  private bannerUntil = Infinity;
  private rankKey = '';
  private readonly tmp = new THREE.Vector3();

  constructor(
    container: HTMLElement,
    private readonly slots: readonly PlayerSlot[],
    cpuLabels: readonly (string | null)[],
    keys: readonly KeyPair[],
    private readonly laps: number,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    container.appendChild(this.root);

    slots.forEach((slot, i) => {
      const panel = document.createElement('div');
      panel.className = `hud-panel ${CORNER[i % CORNER.length]}`;
      panel.style.setProperty('--badge', slot.badgeColor);
      const k = keys[i];
      const arrows = (['up', 'left', 'down', 'right'] as const)
        .map((d) => `<kbd>${keyLabel(k[d]) || '–'}</kbd>`)
        .join('');
      panel.innerHTML = `
        <span class="hud-badge">P${i + 1}</span>
        <span class="hud-name">${slot.name}</span>
        <span class="hud-score">–</span>
        <span class="hud-key corsa-traps"></span>
        <span class="hud-key">${
          cpuLabels[i]
            ? `<span class="hud-cpu">${cpuLabels[i]}</span>`
            : `<span class="kbd-only">${arrows} cacca <kbd>${keyLabel(k.dash)}</kbd></span>`
        }</span>`;
      this.root.appendChild(panel);
      this.panels.push(panel);
      this.places.push(panel.querySelector('.hud-score')!);
      this.dots.push(panel.querySelector('.corsa-traps')!);

      const bubble = document.createElement('div');
      bubble.className = 'hud-bubble';
      bubble.style.setProperty('--badge', slot.badgeColor);
      bubble.hidden = true;
      this.root.appendChild(bubble);
      this.bubbles.push({ el: bubble, until: 0 });
    });

    this.board = this.el('corsa-board');
    this.board.innerHTML = '<div class="corsa-lap"></div><ol class="corsa-rows"></ol>';
    this.boardLap = this.board.querySelector('.corsa-lap')!;
    this.boardRows = this.board.querySelector('.corsa-rows')!;
    this.banner = this.el('hud-banner');
    this.finalPanel = this.el('hud-final');
    this.audioLabel = this.el('hud-audio');
    this.audioLabel.dataset.audioToggle = '';
    this.finalPanel.hidden = true;
  }

  setAudioStatus(status: AudioStatus): void {
    this.audioLabel.dataset.status = status;
    this.audioLabel.innerHTML =
      status === 'locked'
        ? '<span class="kbd-only">premi un tasto</span><span class="touch-only">tocca qui</span> per l’audio'
        : `<kbd class="kbd-only">M</kbd> audio ${status === 'on' ? 'sì' : 'no'}`;
  }

  dispose(): void {
    this.root.remove();
  }

  reset(): void {
    this.finalPanel.hidden = true;
    this.board.hidden = false;
    this.bubbles.forEach((b) => (b.el.hidden = true));
    this.rankKey = '';
  }

  onEvent(e: CorsaEvent, m: CorsaMatch): void {
    switch (e.type) {
      case 'phase':
        if (e.phase === 'intro') this.showBanner('Pronti…');
        else if (e.phase === 'play') this.showBanner('VIA!', e.t + GO_MS);
        else if (e.phase === 'final') this.showFinal(m);
        break;
      case 'lap':
        if (e.gained > 0) this.setBubble(e.player, `+${e.gained} cacca`, 'win', e.t);
        break;
      case 'lastLap':
        this.showBanner('ULTIMO GIRO!', e.t + LAST_LAP_MS);
        break;
      case 'stun':
        this.setBubble(e.player, 'puah!', 'poop', e.t);
        break;
      default:
        break;
    }
  }

  /** Classifica, riserve e nuvolette; ogni frame. */
  update(now: number, m: CorsaMatch, scene: CorsaScene, layout: PixelLayout): void {
    if (now > this.bannerUntil) this.showBanner('');

    const order = m.ranking();
    order.forEach((p, rank) => (this.places[p].textContent = ordinal(rank + 1)));
    m.runners.forEach((r, i) => {
      const n = corsaTuning.trap.max;
      const html = Array.from(
        { length: n },
        (_, k) => `<i class="${k < r.traps ? 'on' : ''}"></i>`,
      ).join('');
      if (this.dots[i].dataset.html !== html) {
        this.dots[i].innerHTML = html;
        this.dots[i].dataset.html = html;
      }
    });

    const leader = m.runners[order[0]];
    const lap = Math.min(this.laps, Math.max(1, leader.laps + 1));
    const key = order.join() + lap;
    if (key !== this.rankKey) {
      this.rankKey = key;
      this.boardLap.textContent = m.phase === 'final' ? '' : `GIRO ${lap}/${this.laps}`;
      this.boardRows.innerHTML = order
        .map(
          (p, rank) =>
            `<li style="--badge:${this.slots[p].badgeColor}"><b>${rank + 1}</b><span>${this.slots[p].name}</span></li>`,
        )
        .join('');
    }
    // La classifica sta nell'isola al centro della pista.
    scene.islandCenter(this.tmp).project(scene.camera);
    const x = ((this.tmp.x + 1) / 2) * layout.cssWidth;
    const y = ((1 - this.tmp.y) / 2) * layout.cssHeight;
    this.board.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    this.board.hidden = m.phase === 'final';

    this.bubbles.forEach((b, i) => {
      if (!b.el.hidden && now > b.until) b.el.hidden = true;
      if (b.el.hidden) return;
      scene.headPosition(i, this.tmp).project(scene.camera);
      const bx = ((this.tmp.x + 1) / 2) * layout.cssWidth;
      const by = ((1 - this.tmp.y) / 2) * layout.cssHeight;
      b.el.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -100%)`;
    });
  }

  private showFinal(m: CorsaMatch): void {
    const standings = m.standings ?? [];
    this.showBanner('');
    this.bubbles.forEach((b) => (b.el.hidden = true));
    const rows = standings
      .map((p, rank) => {
        const r = m.runners[p];
        const slot = this.slots[p];
        const detail =
          r.finishedAt !== null
            ? formatTime(r.finishedAt - m.playStart)
            : `giro ${Math.min(this.laps, r.laps + 1)}/${this.laps}`;
        return `<li style="--badge:${slot.badgeColor}">
          <span class="pos">${rank + 1}°</span>
          <span class="name">${slot.name}</span>
          <span class="pts">${detail}</span></li>`;
      })
      .join('');
    this.finalPanel.innerHTML = `
      <h2>${this.slots[standings[0]].name} vince la corsa!</h2>
      <ol>${rows}</ol>
      <div class="hud-final-actions">
        <button type="button" data-final="rematch">Rivincita <kbd class="kbd-only">INVIO</kbd></button>
        <button type="button" data-final="menu">Menu <kbd class="kbd-only">ESC</kbd></button>
      </div>`;
    this.finalPanel.hidden = false;
  }

  private setBubble(player: number, text: string, kind: 'win' | 'poop', now: number): void {
    const b = this.bubbles[player];
    if (!b) return;
    b.el.textContent = text;
    b.el.classList.toggle('win', kind === 'win');
    if (kind === 'win') delete b.el.dataset.kind;
    else b.el.dataset.kind = 'poop';
    b.el.hidden = false;
    b.until = now + BUBBLE_MS;
    restartAnimation(b.el, 'pop');
  }

  private showBanner(text: string, until = Infinity): void {
    this.banner.textContent = text;
    this.banner.hidden = text === '';
    this.bannerUntil = until;
    if (text) restartAnimation(this.banner, 'pop');
  }

  private el(className: string): HTMLElement {
    const div = document.createElement('div');
    div.className = className;
    this.root.appendChild(div);
    return div;
  }
}
