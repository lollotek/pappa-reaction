import type { PlayerSlot } from '../config/controls';
import { keyLabel } from '../config/keyLabel';
import type { KeyPair } from '../config/settings';

/**
 * Prova tasti: ogni tasto dei gatti si illumina finché è premuto. Serve a
 * scoprire il "ghosting" (tastiere che non leggono certi tasti premuti insieme).
 */
export class KeyTest {
  private readonly root: HTMLElement;
  private readonly held = new Set<string>();
  private best = 0;
  private keys: readonly KeyPair[] = [];
  private active = false;

  constructor(
    container: HTMLElement,
    private readonly slots: readonly PlayerSlot[],
  ) {
    this.root = document.createElement('div');
    this.root.className = 'menu keytest';
    this.root.hidden = true;
    container.appendChild(this.root);

    window.addEventListener('keydown', (e) => {
      if (!this.active || e.code === 'Escape') return;
      e.preventDefault();
      this.held.add(e.code);
      this.best = Math.max(this.best, this.countGameKeys());
      this.render();
    });
    window.addEventListener('keyup', (e) => {
      if (!this.active) return;
      this.held.delete(e.code);
      this.render();
    });
    window.addEventListener('blur', () => {
      this.held.clear();
      if (this.active) this.render();
    });
  }

  show(keys: readonly KeyPair[]): void {
    this.keys = keys;
    this.held.clear();
    this.best = 0;
    this.active = true;
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.active = false;
    this.root.hidden = true;
  }

  private countGameKeys(): number {
    return this.keys.flatMap((k) => [k.dash, k.fake]).filter((c) => this.held.has(c)).length;
  }

  private render(): void {
    const cell = (code: string, label: string) =>
      `<div class="keytest-key${this.held.has(code) ? ' on' : ''}"><kbd>${keyLabel(code)}</kbd><span>${label}</span></div>`;
    const rows = this.slots
      .map(
        (slot, i) => `
        <div class="keytest-row" style="--accent:${slot.badgeColor}">
          <span class="keytest-name">${slot.name}</span>
          ${cell(this.keys[i].dash, 'scatto')}${cell(this.keys[i].fake, 'finta')}
        </div>`,
      )
      .join('');
    this.root.innerHTML = `
      <h2>Prova tasti</h2>
      <p class="menu-text">Premete i tasti tutti insieme: se un tasto premuto non si accende,
        la tastiera non regge quella combinazione. Provate i tasti di scatto di tutti
        contemporaneamente.</p>
      <div class="keytest-grid">${rows}</div>
      <p class="menu-message">Tasti di gioco premuti ora: ${this.countGameKeys()} · massimo insieme: ${this.best}</p>
      <p class="menu-help">ESC indietro</p>`;
  }
}
