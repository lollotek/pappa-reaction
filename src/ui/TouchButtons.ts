import type { PlayerSlot } from '../config/controls';
import type { PlayerAction } from '../core/MatchMachine';
import type { TouchButtonSpec } from '../input/touchLayout';

interface ButtonEl {
  spec: TouchButtonSpec;
  el: HTMLElement;
  /** Dita appoggiate in questo momento. */
  pointers: Set<number>;
}

/**
 * Pulsanti touch SCATTO e FINTA disegnati nel DOM sopra la scena.
 * Ogni appoggio del dito è una pressione (tenere premuto non ripete).
 * Il feedback è identico per scatto e finta: non deve tradire la finta.
 */
export class TouchButtons {
  private readonly root: HTMLElement;
  private buttons: ButtonEl[] = [];
  /** Chiamata a ogni appoggio, con il timestamp del `pointerdown`. */
  onPress: (player: number, action: PlayerAction, t: number) => void = () => {};
  /** Chiamata quando cambia il numero di dita appoggiate (Prova i pulsanti). */
  onHeldChange: () => void = () => {};

  constructor(
    container: HTMLElement,
    private readonly slots: readonly PlayerSlot[],
  ) {
    this.root = document.createElement('div');
    this.root.className = 'touch-buttons';
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** Dita appoggiate su tutti i pulsanti insieme. */
  get held(): number {
    return this.buttons.reduce((n, b) => n + b.pointers.size, 0);
  }

  /** Ricrea i pulsanti (cambio di giocatori o di dimensione dello schermo). */
  setLayout(specs: readonly TouchButtonSpec[]): void {
    const key = (s: TouchButtonSpec) => `${s.player}:${s.action}`;
    const same =
      specs.length === this.buttons.length &&
      specs.every((s, i) => key(s) === key(this.buttons[i].spec));
    if (same) {
      specs.forEach((s, i) => {
        this.buttons[i].spec = s;
        this.place(this.buttons[i].el, s);
      });
      return;
    }
    this.root.replaceChildren();
    this.buttons = specs.map((spec) => this.create(spec));
    this.onHeldChange();
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.buttons.forEach((b) => {
      b.pointers.clear();
      b.el.classList.remove('held');
    });
  }

  /** Pulsanti spenti per chi è stordito o in panchina. */
  setEnabled(player: number, enabled: boolean): void {
    for (const b of this.buttons) {
      if (b.spec.player === player) b.el.classList.toggle('off', !enabled);
    }
  }

  private create(spec: TouchButtonSpec): ButtonEl {
    const slot = this.slots[spec.player];
    const el = document.createElement('div');
    el.className = `touch-btn touch-${spec.action}`;
    el.style.setProperty('--badge', slot.badgeColor);
    el.innerHTML =
      spec.action === 'dash'
        ? `<span class="touch-label">SCATTO</span><span class="touch-name">${slot.name}</span>`
        : `<span class="touch-label">FINTA</span>`;
    this.place(el, spec);
    this.root.appendChild(el);
    const b: ButtonEl = { spec, el, pointers: new Set() };

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // Il dito resta "di questo pulsante" anche se scivola fuori.
      capture(el, e.pointerId);
      b.pointers.add(e.pointerId);
      el.classList.add('held');
      this.onPress(b.spec.player, b.spec.action, e.timeStamp);
      this.onHeldChange();
    });
    const release = (e: PointerEvent) => {
      if (!b.pointers.delete(e.pointerId)) return;
      if (b.pointers.size === 0) el.classList.remove('held');
      this.onHeldChange();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  private place(el: HTMLElement, s: TouchButtonSpec): void {
    el.style.left = `${s.cx - s.size / 2}px`;
    el.style.top = `${s.cy - s.size / 2}px`;
    el.style.width = `${s.size}px`;
    el.style.height = `${s.size}px`;
    el.style.fontSize = `${Math.round(s.size * 0.17)}px`;
  }
}

/** Il dito resta "di questo elemento" anche se scivola fuori (se il browser lo permette). */
export function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* puntatore non più attivo: pazienza */
  }
}
