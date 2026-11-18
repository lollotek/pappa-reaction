import * as THREE from 'three';
import type { PlayerSlot } from '../../config/controls';
import { keyLabel } from '../../config/keyLabel';
import type { KeyPair } from '../../config/settings';
import type { AudioStatus } from '../../game/GameDef';
import type { PixelLayout } from '../../render/pixelLayout';
import type { CutResult, GraffioEvent, GraffioMatch } from './core/GraffioMatch';
import type { GraffioScene } from './render/GraffioScene';
import { graffioTuning } from './tuning';

/** Quanto restano le nuvolette con i punti di un taglio (ms). */
const BUBBLE_MS = 1700;

function restartAnimation(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth; // forza il reflow
  el.classList.add(cls);
}

/**
 * HUD di Graffio Killer: i punti stanno sulla faccia anteriore dei trespoli
 * (uno per colonna), i punti di ogni taglio compaiono sopra la linea di taglio.
 */
export class GraffioHud {
  private readonly root: HTMLElement;
  private readonly panels: HTMLElement[] = [];
  private readonly scores: HTMLElement[] = [];
  private readonly bubbles: { el: HTMLElement; until: number }[] = [];
  private readonly banner: HTMLElement;
  private readonly roundLabel: HTMLElement;
  private readonly finalPanel: HTMLElement;
  private readonly audioLabel: HTMLElement;
  private readonly tmp = new THREE.Vector3();

  constructor(
    container: HTMLElement,
    private readonly slots: readonly PlayerSlot[],
    cpuLabels: readonly (string | null)[],
    keys: readonly KeyPair[],
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    container.appendChild(this.root);

    slots.forEach((slot, i) => {
      const panel = document.createElement('div');
      panel.className = 'gk-col';
      panel.style.setProperty('--badge', slot.badgeColor);
      panel.innerHTML = `
        <span class="hud-badge">P${i + 1}</span>
        <span class="gk-score hud-score">0</span>
        <span class="gk-key">${
          cpuLabels[i]
            ? `<span class="hud-cpu">${cpuLabels[i]}</span>`
            : `<span class="kbd-only">zampata <kbd>${keyLabel(keys[i].dash)}</kbd></span>`
        }</span>`;
      this.root.appendChild(panel);
      this.panels.push(panel);
      this.scores.push(panel.querySelector('.gk-score')!);

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

  onEvent(e: GraffioEvent, m: GraffioMatch): void {
    switch (e.type) {
      case 'phase':
        if (e.phase === 'intro') this.showBanner('Pronti…');
        else if (e.phase === 'show') {
          const last = e.round === m.roundCount - 1;
          this.showBanner(last ? 'Ultimo round! Taglia alla tacca!' : 'Taglia alla tacca rossa!');
        } else if (e.phase === 'lift') this.showBanner('');
        else if (e.phase === 'wait') this.showBanner('Attenti…');
        else if (e.phase === 'drop') this.showBanner('');
        else if (e.phase === 'final') this.showFinal(m);
        break;
      case 'cut':
        this.showCut(e.result, e.t, m);
        break;
    }
  }

  /** Nuvolette, pannelli sulle colonne e scritte; ogni frame. */
  update(now: number, m: GraffioMatch, scene: GraffioScene, layout: PixelLayout): void {
    this.roundLabel.textContent =
      m.phase === 'final' || m.phase === 'intro' ? '' : `Round ${m.round + 1}/${m.roundCount}`;

    // Misure dei pannelli in proporzione alla scena (la scritta resta leggibile ovunque).
    const unit = scene.pixelsPerUnit(layout.cssHeight);
    this.root.style.setProperty('--gk-u', `${Math.max(14, Math.min(unit, 90))}px`);

    this.panels.forEach((panel, i) => {
      scene.columnPosition(i, this.tmp).project(scene.camera);
      const x = ((this.tmp.x + 1) / 2) * layout.cssWidth;
      const y = ((1 - this.tmp.y) / 2) * layout.cssHeight;
      panel.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    });
    this.bubbles.forEach((b, i) => {
      if (!b.el.hidden && now > b.until) b.el.hidden = true;
      if (b.el.hidden) return;
      scene.headPosition(i, this.tmp).project(scene.camera);
      const x = ((this.tmp.x + 1) / 2) * layout.cssWidth;
      const y = ((1 - this.tmp.y) / 2) * layout.cssHeight;
      b.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    });
  }

  private showCut(r: CutResult, now: number, m: GraffioMatch): void {
    const text =
      r.whiff !== null
        ? r.label
        : r.points === graffioTuning.scoring[0].points
          ? `+${r.points} ${r.label}`
          : `+${r.points}`;
    const b = this.bubbles[r.player];
    b.el.textContent = text;
    b.el.classList.toggle('win', r.points >= 7);
    if (r.points === 0) b.el.dataset.kind = 'poop';
    else delete b.el.dataset.kind;
    b.el.hidden = false;
    b.until = now + BUBBLE_MS;
    restartAnimation(b.el, 'pop');

    const text2 = String(m.scores[r.player]);
    if (this.scores[r.player].textContent !== text2) {
      this.scores[r.player].textContent = text2;
      restartAnimation(this.scores[r.player], 'pop');
    }
  }

  private showFinal(m: GraffioMatch): void {
    const standings = m.standings ?? [];
    this.showBanner('');
    this.bubbles.forEach((b) => (b.el.hidden = true));
    const rows = standings
      .map((p, rank) => {
        const slot = this.slots[p];
        const pos = m.winners.includes(p) ? 1 : rank + 1;
        return `<li style="--badge:${slot.badgeColor}">
          <span class="pos">${pos}°</span>
          <span class="name">${slot.name}</span>
          <span class="pts">${m.scores[p]}</span></li>`;
      })
      .join('');
    const names = m.winners.map((p) => this.slots[p].name);
    const title =
      names.length > 1
        ? `Pari! ${names.join(' e ')} vincono`
        : `${names[0] ?? ''} vince la partita!`;
    this.finalPanel.innerHTML = `
      <h2>${title}</h2>
      <ol>${rows}</ol>
      <div class="hud-final-actions">
        <button type="button" data-final="rematch">Rivincita <kbd class="kbd-only">INVIO</kbd></button>
        <button type="button" data-final="menu">Menu <kbd class="kbd-only">ESC</kbd></button>
      </div>`;
    this.finalPanel.hidden = false;
  }

  private showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.hidden = text === '';
    if (text) restartAnimation(this.banner, 'pop');
  }

  private el(className: string): HTMLElement {
    const div = document.createElement('div');
    div.className = className;
    this.root.appendChild(div);
    return div;
  }
}
