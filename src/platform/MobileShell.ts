import { onTap } from '../ui/tap';
import type { Device } from './Device';

export interface MobileShellOptions {
  /** Siamo in modalità touch (telefono o tablet). */
  touch: () => boolean;
  /** L'utente vuole lo schermo intero automatico (Opzioni). */
  auto: () => boolean;
  /** Il pulsante "Schermo intero" può comparire in questa schermata. */
  allowButton?: () => boolean;
}

/**
 * Parte "da telefono" comune a hub e giochi: avviso "ruota il dispositivo" in
 * verticale, schermo intero (con blocco della rotazione) al primo tocco di
 * ogni pagina e, se il browser non l'ha concesso o è stato chiuso, un
 * pulsante per forzarlo. Il browser vuole un gesto dell'utente a ogni pagina
 * nuova: per questo si riprova a ogni tocco finché non funziona.
 */
export class MobileShell {
  private readonly button: HTMLElement;
  private shown: boolean | null = null;

  constructor(
    container: HTMLElement,
    private readonly device: Device,
    private readonly opts: MobileShellOptions,
  ) {
    const hint = document.createElement('div');
    hint.className = 'rotate-hint';
    hint.innerHTML =
      '<div class="rotate-phone"></div><p>Ruota il dispositivo<br />in orizzontale</p>';
    container.appendChild(hint);

    this.button = document.createElement('div');
    this.button.className = 'fs-button';
    this.button.hidden = true;
    this.button.innerHTML = '<button type="button" data-tap="fs">⛶ Schermo intero</button>';
    container.appendChild(this.button);
    onTap(this.button, () => {
      void this.device.enterFullscreen().then(() => this.update());
    });

    // Un tocco qualsiasi vale come gesto: schermo intero e rotazione bloccata.
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' || !this.opts.touch() || !this.opts.auto()) return;
      void this.device.enterFullscreen().then(() => this.update());
    });
    const changed = () => this.update();
    const doc = this.device.fullscreenDocument;
    doc.addEventListener('fullscreenchange', changed);
    doc.addEventListener('webkitfullscreenchange', changed);
    this.update();
  }

  /** Mostra o nasconde il pulsante secondo lo stato (da chiamare quando cambia qualcosa). */
  update(): void {
    const show =
      this.opts.touch() &&
      this.device.fullscreenSupported &&
      !this.device.isFullscreen &&
      (this.opts.allowButton?.() ?? true);
    if (show === this.shown) return;
    this.shown = show;
    this.button.hidden = !show;
  }
}
