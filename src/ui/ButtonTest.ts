import type { TouchButtons } from './TouchButtons';

/**
 * Prova i pulsanti: i pulsanti touch dei due lati si accendono finché sono
 * premuti e si conta il massimo di dita appoggiate insieme (alcuni telefoni
 * ne leggono poche). Equivalente touch di "Prova i tasti".
 */
export class ButtonTest {
  private readonly root: HTMLElement;
  private best = 0;
  private active = false;

  constructor(
    container: HTMLElement,
    private readonly buttons: TouchButtons,
    private readonly onBack: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'menu buttontest';
    this.root.hidden = true;
    container.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-back]')) this.onBack();
    });
  }

  get visible(): boolean {
    return this.active;
  }

  show(): void {
    this.best = 0;
    this.active = true;
    this.root.hidden = false;
    this.buttons.onHeldChange = () => this.render();
    this.render();
  }

  hide(): void {
    if (!this.active) return;
    this.active = false;
    this.root.hidden = true;
    this.buttons.onHeldChange = () => {};
  }

  private render(): void {
    if (!this.active) return;
    const now = this.buttons.held;
    this.best = Math.max(this.best, now);
    this.root.innerHTML = `
      <h2>Prova i pulsanti</h2>
      <p class="menu-text">Toccate i pulsanti: si accendono finché il dito è appoggiato.
        Provate a toccarli tutti e quattro insieme.</p>
      <p class="menu-message">Dita sui pulsanti ora: ${now} · massimo insieme: ${this.best}</p>
      <ul><li class="menu-item menu-action accent" data-back><span class="menu-label">Indietro</span></li></ul>`;
  }
}
