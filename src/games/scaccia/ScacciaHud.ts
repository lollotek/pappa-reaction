import * as THREE from 'three';
import type { PlayerSlot } from '../../config/controls';
import { keyLabel } from '../../config/keyLabel';
import type { KeyPair } from '../../config/settings';
import type { AudioStatus } from '../../game/GameDef';
import type { PixelLayout } from '../../render/pixelLayout';
import type { ScacciaEvent, ScacciaMatch, Side } from './core/ScacciaMatch';
import type { ScacciaScene } from './render/ScacciaScene';

/** Pannello dei punti nell'angolo vicino al lato del gatto. */
const CORNER: Record<Side, string> = { 0: 'bl', 1: 'br', 2: 'tr', 3: 'tl' };
/** Quanto restano le nuvolette "+1" e "−1" (ms). */
const BUBBLE_MS = 1300;
/** "VIA!" resta un attimo dopo la partenza. */
const GO_MS = 900;

function restartAnimation(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth; // forza il reflow
  el.classList.add(cls);
}

const formatClock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** HUD di Scaccia la palla: punti negli angoli, "+1"/"−1" sui gatti, tempo, classifica. */
export class ScacciaHud {
  private readonly root: HTMLElement;
  private readonly panels: HTMLElement[] = [];
  private readonly scores: HTMLElement[] = [];
  private readonly bubbles: { el: HTMLElement; until: number }[] = [];
  private readonly banner: HTMLElement;
  private readonly roundLabel: HTMLElement;
  private readonly finalPanel: HTMLElement;
  private readonly audioLabel: HTMLElement;
  private bannerUntil = Infinity;
  private readonly tmp = new THREE.Vector3();

  constructor(
    container: HTMLElement,
    private readonly slots: readonly PlayerSlot[],
    sides: readonly Side[],
    cpuLabels: readonly (string | null)[],
    keys: readonly KeyPair[],
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    container.appendChild(this.root);

    slots.forEach((slot, i) => {
      const panel = document.createElement('div');
      panel.className = `hud-panel ${CORNER[sides[i]]}`;
      panel.style.setProperty('--badge', slot.badgeColor);
      const k = keys[i];
      // Ai lati: "sinistra" sale e "destra" scende (lo dicono le frecce).
      const vertical = sides[i] === 1 || sides[i] === 3;
      const [l, r] = vertical ? ['▲', '▼'] : ['◀', '▶'];
      panel.innerHTML = `
        <span class="hud-badge">P${i + 1}</span>
        <span class="hud-name">${slot.name}</span>
        <span class="hud-score">0</span>
        <span class="hud-key">${
          cpuLabels[i]
            ? `<span class="hud-cpu">${cpuLabels[i]}</span>`
            : `<span class="kbd-only">${l}<kbd>${keyLabel(k.left) || '–'}</kbd>
               ${r}<kbd>${keyLabel(k.right) || '–'}</kbd>
               smash <kbd>${keyLabel(k.dash)}</kbd></span>`
        }</span>`;
      this.root.appendChild(panel);
      this.panels.push(panel);
      this.scores.push(panel.querySelector('.hud-score')!);

      const bubble = document.createElement('div');
      bubble.className = 'hud-bubble';
      bubble.style.setProperty('--badge', slot.badgeColor);
      bubble.hidden = true;
      this.root.appendChild(bubble);
      this.bubbles.push({ el: bubble, until: 0 });
    });

    this.banner = this.el('hud-banner');
    this.roundLabel = this.el('hud-round');
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
    this.scores.forEach((s) => (s.textContent = '0'));
    this.finalPanel.hidden = true;
    this.bubbles.forEach((b) => (b.el.hidden = true));
  }

  onEvent(e: ScacciaEvent, m: ScacciaMatch): void {
    switch (e.type) {
      case 'phase':
        if (e.phase === 'intro') this.showBanner('Pronti…');
        else if (e.phase === 'play') this.showBanner('VIA!', e.t + GO_MS);
        else if (e.phase === 'final') this.showFinal(m);
        break;
      case 'goal':
        if (e.scorer !== null) this.setBubble(e.scorer, '+1', true, e.t);
        this.setBubble(e.conceder, '−1', false, e.t);
        m.scores.forEach((s, i) => {
          const text = String(s);
          if (this.scores[i].textContent !== text) restartAnimation(this.scores[i], 'pop');
          this.scores[i].textContent = text;
        });
        break;
      case 'suddenDeath':
        this.showBanner('SPAREGGIO! Vince chi va in testa', e.t + 2500);
        break;
      default:
        break;
    }
  }

  /** Nuvolette sopra i gatti, tempo o obiettivo, banner a tempo; ogni frame. */
  update(now: number, m: ScacciaMatch, scene: ScacciaScene, layout: PixelLayout): void {
    if (now > this.bannerUntil) this.showBanner('');
    const left = m.timeLeft(now);
    this.roundLabel.textContent =
      m.phase === 'final'
        ? ''
        : m.suddenDeath
          ? 'Spareggio'
          : left !== null
            ? `${formatClock(left)} · primo a ${m.config.target}`
            : `Primo a ${m.config.target} punti`;
    this.roundLabel.classList.toggle('hurry', left !== null && left < 10_000 && m.phase === 'play');

    this.bubbles.forEach((b, i) => {
      if (!b.el.hidden && now > b.until) b.el.hidden = true;
      if (b.el.hidden) return;
      scene.headPosition(i, this.tmp).project(scene.camera);
      const x = ((this.tmp.x + 1) / 2) * layout.cssWidth;
      const y = ((1 - this.tmp.y) / 2) * layout.cssHeight;
      b.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    });
  }

  private showFinal(m: ScacciaMatch): void {
    const standings = m.standings ?? [];
    this.showBanner('');
    this.bubbles.forEach((b) => (b.el.hidden = true));
    const rows = standings
      .map((p, rank) => {
        const slot = this.slots[p];
        return `<li style="--badge:${slot.badgeColor}">
          <span class="pos">${rank + 1}°</span>
          <span class="name">${slot.name}</span>
          <span class="pts">${m.scores[p]}</span></li>`;
      })
      .join('');
    this.finalPanel.innerHTML = `
      <h2>${this.slots[standings[0]].name} vince la partita!</h2>
      <ol>${rows}</ol>
      <div class="hud-final-actions">
        <button type="button" data-final="rematch">Rivincita <kbd class="kbd-only">INVIO</kbd></button>
        <button type="button" data-final="menu">Menu <kbd class="kbd-only">ESC</kbd></button>
      </div>`;
    this.finalPanel.hidden = false;
  }

  private setBubble(player: number, text: string, win: boolean, now: number): void {
    const b = this.bubbles[player];
    if (!b) return;
    b.el.textContent = text;
    b.el.classList.toggle('win', win);
    if (win) delete b.el.dataset.kind;
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
