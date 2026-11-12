import { capture } from './TouchButtons';

/** Durata del tocco lungo che mette in pausa. */
export const PAUSE_HOLD_MS = 600;

/**
 * Pulsante pausa per il touch: serve un **tocco lungo**, così un dito che
 * sfiora lo schermo durante la partita non la ferma per sbaglio.
 */
export class PauseButton {
  private readonly el: HTMLElement;
  private timer: number | null = null;

  constructor(
    container: HTMLElement,
    private readonly onPause: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'touch-pause';
    this.el.innerHTML =
      '<span class="touch-pause-icon">II</span><span class="touch-pause-hint">tieni premuto</span>';
    this.el.hidden = true;
    container.appendChild(this.el);

    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(this.el, e.pointerId);
      this.cancel();
      this.el.classList.add('holding');
      this.timer = window.setTimeout(() => {
        this.cancel();
        this.onPause();
      }, PAUSE_HOLD_MS);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      this.el.addEventListener(type, () => this.cancel());
    }
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  show(): void {
    this.el.hidden = false;
  }

  hide(): void {
    this.cancel();
    this.el.hidden = true;
  }

  private cancel(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.el.classList.remove('holding');
  }
}
