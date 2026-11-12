import * as THREE from 'three';
import type { PlayerSlot } from '../config/controls';
import type { MatchMachine, RoundEvent, RoundResult } from '../core/MatchMachine';
import type { MatchScene } from '../scenes/MatchScene';
import type { PixelLayout } from './pixelLayout';

const CONTENT_NAMES: Record<string, string> = {
  crocchette: 'le CROCCHETTE',
  tonno: 'il TONNO',
  salmone: 'il SALMONE',
  gamberetto: 'il GAMBERETTO D’ORO',
};

const KEY_LABELS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓' };
const keyLabel = (code: string) => KEY_LABELS[code] ?? code.replace(/^Key/, '');

export const formatPoints = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '');

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(2)} sec.`;
const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;

type BubbleKind = 'time' | 'stun' | 'poop' | 'bench';

/** HUD in DOM sopra il canvas: punteggi, banner, nuvolette sopra i gatti, classifica. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly scores: HTMLElement[] = [];
  private readonly bubbles: HTMLElement[] = [];
  private readonly banner: HTMLElement;
  private readonly roundLabel: HTMLElement;
  private readonly finalPanel: HTMLElement;
  private readonly audioLabel: HTMLElement;
  private readonly tmp = new THREE.Vector3();

  constructor(
    container: HTMLElement,
    private readonly slots: readonly PlayerSlot[],
    /** Per ogni slot: etichetta CPU (es. "CPU normale") oppure null se umano. */
    cpuLabels: readonly (string | null)[] = [],
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
        <span class="hud-key">${
          cpuLabels[i]
            ? `<span class="hud-cpu">${cpuLabels[i]}</span>`
            : `scatto <kbd>${keyLabel(slot.keys.dash)}</kbd>
               finta <kbd>${keyLabel(slot.keys.fake)}</kbd>`
        }</span>`;
      this.root.appendChild(panel);
      this.scores.push(panel.querySelector('.hud-score')!);

      const bubble = document.createElement('div');
      bubble.className = 'hud-bubble';
      bubble.style.setProperty('--badge', slot.badgeColor);
      bubble.hidden = true;
      this.root.appendChild(bubble);
      this.bubbles.push(bubble);
    });

    this.banner = this.el('hud-banner');
    this.roundLabel = this.el('hud-round');
    this.finalPanel = this.el('hud-final');
    this.audioLabel = this.el('hud-audio');
    this.finalPanel.hidden = true;
  }

  /** Stato dell'audio: bloccato dal browser finché non si preme un tasto. */
  setAudioStatus(status: 'locked' | 'on' | 'off'): void {
    this.audioLabel.dataset.status = status;
    this.audioLabel.innerHTML =
      status === 'locked'
        ? 'premi un tasto per l’audio'
        : `<kbd>M</kbd> audio ${status === 'on' ? 'sì' : 'no'}`;
  }

  /** Nuova partita. */
  reset(): void {
    this.scores.forEach((s) => (s.textContent = '0'));
    this.finalPanel.hidden = true;
  }

  onEvent(e: RoundEvent, m: MatchMachine): void {
    switch (e.type) {
      case 'phase':
        if (e.phase === 'intro') {
          this.showBanner(m.suddenDeath ? 'SPAREGGIO!' : `ROUND ${e.round}`);
          this.roundLabel.textContent = m.suddenDeath
            ? 'Spareggio'
            : `Round ${e.round} / ${m.config.roundCount}`;
          this.bubbles.forEach((_, i) => {
            if (m.players[i].active) this.hideBubble(i);
            else this.setBubble(i, m.suddenDeath ? 'fuori' : 'SALTA IL TURNO', 'bench');
          });
        } else if (e.phase === 'circling') {
          this.showBanner('');
        } else if (e.phase === 'final') {
          this.showFinal(m);
        }
        break;
      case 'falseStart':
        this.setBubble(e.player, 'BONK!', 'stun');
        break;
      case 'dash':
        this.setBubble(e.player, formatSeconds(e.reactionMs), 'time');
        break;
      case 'poop':
        this.setBubble(e.player, 'BLEAH!', 'poop');
        break;
      case 'fakeDash':
      case 'fakeLid':
        break; // le finte non si annunciano: devono ingannare
      case 'resolved':
        e.result.winners.forEach((w) => this.bubbles[w].classList.add('win'));
        this.showBanner(this.resultText(e.result));
        m.scores.forEach((s, i) => (this.scores[i].textContent = formatPoints(s)));
        break;
    }
  }

  /** Riposiziona le nuvolette sopra i gatti; ogni frame. */
  update(now: number, m: MatchMachine, scene: MatchScene, layout: PixelLayout): void {
    this.bubbles.forEach((b, i) => {
      if (b.dataset.kind === 'stun' && now >= m.players[i].stunnedUntil) this.hideBubble(i);
      if (b.hidden) return;
      scene.headPosition(i, this.tmp).project(scene.camera);
      const x = ((this.tmp.x + 1) / 2) * layout.cssWidth;
      const y = ((1 - this.tmp.y) / 2) * layout.cssHeight;
      b.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    });
  }

  private resultText(r: RoundResult): string {
    const name = (i: number) => this.slots[i].name;
    if (r.poopVictims.length > 0) {
      const who = joinNames(r.poopVictims.map(name));
      return r.poopSkipsNext
        ? `Che schifo! ${who} salta il prossimo turno`
        : `Che schifo! ${who}: −1 punto`;
    }
    if (r.content.id === 'cacchetta') return 'Era una cacchetta! Nessuno ci è cascato';
    if (r.winners.length === 0) return 'Nessuno ha scattato…';
    const verb = r.winners.length > 1 ? 'si spartiscono' : 'prende';
    const what = CONTENT_NAMES[r.content.id] ?? r.content.id;
    return `${joinNames(r.winners.map(name))} ${verb} ${what}! +${formatPoints(r.pointsEach)}`;
  }

  private showFinal(m: MatchMachine): void {
    const standings = m.standings ?? [];
    this.showBanner('');
    this.roundLabel.textContent = '';
    this.bubbles.forEach((_, i) => this.hideBubble(i));
    const rows = standings
      .map((p, rank) => {
        const slot = this.slots[p];
        return `<li style="--badge:${slot.badgeColor}">
          <span class="pos">${rank + 1}°</span>
          <span class="name">${slot.name}</span>
          <span class="pts">${formatPoints(m.scores[p])}</span></li>`;
      })
      .join('');
    this.finalPanel.innerHTML = `
      <h2>${this.slots[standings[0]].name} vince la pappa!</h2>
      <ol>${rows}</ol>
      <p>Premi <kbd>INVIO</kbd> per la rivincita</p>`;
    this.finalPanel.hidden = false;
  }

  private el(className: string): HTMLElement {
    const div = document.createElement('div');
    div.className = className;
    this.root.appendChild(div);
    return div;
  }

  private setBubble(player: number, text: string, kind: BubbleKind): void {
    const b = this.bubbles[player];
    b.textContent = text;
    b.dataset.kind = kind;
    b.classList.remove('win');
    b.hidden = false;
  }

  private hideBubble(player: number): void {
    const b = this.bubbles[player];
    b.hidden = true;
    delete b.dataset.kind;
    b.classList.remove('win');
  }

  private showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.hidden = text === '';
  }
}
