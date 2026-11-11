import * as THREE from 'three';
import type { PlayerSlot } from '../config/controls';
import type { RoundEvent, RoundMachine } from '../core/RoundMachine';
import type { MatchScene } from '../scenes/MatchScene';
import type { PixelLayout } from './pixelLayout';

const CONTENT_NAMES: Record<string, string> = {
  crocchette: 'le CROCCHETTE',
  tonno: 'il TONNO',
  salmone: 'il SALMONE',
  gamberetto: 'il GAMBERETTO D’ORO',
  cacchetta: 'la CACCHETTA',
};

const KEY_LABELS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓' };
const keyLabel = (code: string) => KEY_LABELS[code] ?? code.replace(/^Key/, '');

export const formatPoints = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '');

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(2)} sec.`;

/** HUD in DOM sopra il canvas: punteggi agli angoli, banner, nuvolette sopra i gatti. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly scores: HTMLElement[] = [];
  private readonly bubbles: HTMLElement[] = [];
  private readonly banner: HTMLElement;
  private readonly tmp = new THREE.Vector3();

  constructor(
    container: HTMLElement,
    private readonly slots: readonly PlayerSlot[],
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    container.appendChild(this.root);

    const corners = ['tl', 'tr', 'bl', 'br'];
    slots.forEach((slot, i) => {
      const panel = document.createElement('div');
      panel.className = `hud-panel ${corners[i]}`;
      panel.style.setProperty('--badge', slot.badgeColor);
      panel.innerHTML = `
        <span class="hud-badge">P${i + 1}</span>
        <span class="hud-name">${slot.name}</span>
        <span class="hud-score">0</span>
        <span class="hud-key">scatto <kbd>${keyLabel(slot.keys.dash)}</kbd></span>`;
      this.root.appendChild(panel);
      this.scores.push(panel.querySelector('.hud-score')!);

      const bubble = document.createElement('div');
      bubble.className = 'hud-bubble';
      bubble.style.setProperty('--badge', slot.badgeColor);
      bubble.hidden = true;
      this.root.appendChild(bubble);
      this.bubbles.push(bubble);
    });

    this.banner = document.createElement('div');
    this.banner.className = 'hud-banner';
    this.root.appendChild(this.banner);
  }

  onEvent(e: RoundEvent, m: RoundMachine): void {
    switch (e.type) {
      case 'phase':
        if (e.phase === 'intro') {
          this.showBanner(`ROUND ${e.round}`);
          this.bubbles.forEach((b) => {
            b.hidden = true;
            b.classList.remove('win', 'stun');
          });
        } else if (e.phase === 'circling') {
          this.showBanner('');
        }
        break;
      case 'falseStart':
        this.setBubble(e.player, 'BONK!', 'stun');
        break;
      case 'dash':
        this.setBubble(e.player, formatSeconds(e.reactionMs));
        break;
      case 'resolved': {
        const { winners, content, pointsEach } = e.result;
        winners.forEach((w) => this.bubbles[w].classList.add('win'));
        if (winners.length === 0) {
          this.showBanner('Nessuno ha scattato…');
        } else {
          const names = winners.map((w) => this.slots[w].name).join(' e ');
          const verb = winners.length > 1 ? 'si spartiscono' : 'prende';
          this.showBanner(
            `${names} ${verb} ${CONTENT_NAMES[content.id] ?? content.id}! +${formatPoints(pointsEach)}`,
          );
        }
        m.scores.forEach((s, i) => (this.scores[i].textContent = formatPoints(s)));
        break;
      }
    }
  }

  /** Riposiziona le nuvolette sopra i gatti; ogni frame. */
  update(now: number, m: RoundMachine, scene: MatchScene, layout: PixelLayout): void {
    this.bubbles.forEach((b, i) => {
      const stunned = now < m.players[i].stunnedUntil;
      if (b.classList.contains('stun') && !stunned) {
        b.hidden = true;
        b.classList.remove('stun');
      }
      if (b.hidden) return;
      scene.headPosition(i, this.tmp).project(scene.camera);
      const x = ((this.tmp.x + 1) / 2) * layout.cssWidth;
      const y = ((1 - this.tmp.y) / 2) * layout.cssHeight;
      b.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    });
  }

  private setBubble(player: number, text: string, cls?: string): void {
    const b = this.bubbles[player];
    b.textContent = text;
    b.classList.toggle('stun', cls === 'stun');
    b.hidden = false;
  }

  private showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.hidden = text === '';
  }
}
