import type { PlayerSlot } from '../config/controls';
import type { PlayerAction } from '../core/MatchMachine';
import type { Axis } from '../input/InputSource';
import type { TouchButtonSpec } from '../input/touchLayout';

/** Quanto del raggio percorre il cerchietto del joystick (il resto è margine). */
const STICK_REACH = 0.62;

interface ButtonEl {
  spec: TouchButtonSpec;
  el: HTMLElement;
  /** Dita appoggiate in questo momento. */
  pointers: Set<number>;
  /** Striscia: posizione dell'ultimo dito (0 = sinistra, 1 = destra), null se nessuno. */
  value: number | null;
  /** Joystick: direzione tenuta (−1..1 per asse), null se nessun dito. */
  axis: Axis | null;
  knob: HTMLElement | null;
}

/**
 * Pulsanti touch disegnati nel DOM sopra la scena: SCATTO e FINTA (Pappa) o
 * SMASH e la striscia da trascinare (Scaccia la palla).
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
    /** Scritta sul pulsante principale (SCATTO, SMASH). */
    private readonly dashLabel = 'SCATTO',
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
      b.value = null;
      b.axis = null;
      b.el.classList.remove('held');
    });
  }

  /** Direzione del joystick del giocatore, null se non c'è un dito (o non ha un joystick). */
  stickAxis(player: number): Axis | null {
    if (this.root.hidden) return null;
    for (const b of this.buttons) {
      if (b.spec.player === player && b.spec.action === 'stick') return b.axis;
    }
    return null;
  }

  /** Posizione del dito sulla striscia del giocatore (0..1), null se non c'è un dito. */
  stripValue(player: number): number | null {
    if (this.root.hidden) return null;
    for (const b of this.buttons) {
      if (b.spec.player === player && b.spec.action === 'move') return b.value;
    }
    return null;
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
        ? `<span class="touch-label">${this.dashLabel}</span><span class="touch-name">${slot.name}</span>`
        : spec.action === 'move'
          ? '<span class="touch-knob"></span><span class="touch-label">◀ trascina ▶</span>'
          : spec.action === 'stick'
            ? '<span class="touch-knob"></span>'
            : '<span class="touch-label">FINTA</span>';
    this.place(el, spec);
    this.root.appendChild(el);
    const b: ButtonEl = {
      spec,
      el,
      pointers: new Set(),
      value: null,
      axis: null,
      knob: el.querySelector<HTMLElement>('.touch-knob'),
    };
    // Striscia: la posizione del dito lungo la striscia, anche se scivola fuori.
    const track = (e: PointerEvent) => {
      if (b.spec.action === 'stick') {
        // Joystick: il cerchietto segue il dito dentro il cerchio grande.
        const r = el.getBoundingClientRect();
        const reach = Math.max(1, r.width / 2) * STICK_REACH;
        let x = (e.clientX - (r.left + r.width / 2)) / reach;
        let y = (e.clientY - (r.top + r.height / 2)) / reach;
        const len = Math.hypot(x, y);
        if (len > 1) {
          x /= len;
          y /= len;
        }
        b.axis = { x, y };
        if (b.knob)
          b.knob.style.transform = `translate(calc(-50% + ${x * 50 * STICK_REACH}%), calc(-50% + ${y * 50 * STICK_REACH}%))`;
        return;
      }
      if (b.spec.action !== 'move') return;
      const r = el.getBoundingClientRect();
      b.value = Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)));
      if (b.knob) b.knob.style.left = `${b.value * 100}%`;
    };

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // Il dito resta "di questo pulsante" anche se scivola fuori.
      capture(el, e.pointerId);
      b.pointers.add(e.pointerId);
      el.classList.add('held');
      track(e);
      const action = b.spec.action;
      if (action !== 'move' && action !== 'stick') this.onPress(b.spec.player, action, e.timeStamp);
      this.onHeldChange();
    });
    el.addEventListener('pointermove', (e) => {
      if (b.pointers.has(e.pointerId)) track(e);
    });
    const release = (e: PointerEvent) => {
      if (!b.pointers.delete(e.pointerId)) return;
      if (b.pointers.size === 0) {
        el.classList.remove('held');
        b.value = null;
        b.axis = null;
        if (b.spec.action === 'stick' && b.knob) b.knob.style.transform = '';
      }
      this.onHeldChange();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  private place(el: HTMLElement, s: TouchButtonSpec): void {
    const w = s.width ?? s.size;
    el.style.left = `${s.cx - w / 2}px`;
    el.style.top = `${s.cy - s.size / 2}px`;
    el.style.width = `${w}px`;
    el.style.height = `${s.size}px`;
    el.style.fontSize = `${Math.round(s.size * (s.width ? 0.2 : 0.17))}px`;
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
