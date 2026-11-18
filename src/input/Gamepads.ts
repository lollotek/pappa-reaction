import type { PlayerAction, TimedInput } from '../core/MatchMachine';
import type { MenuKey } from '../ui/MenuModel';
import { NO_AXIS, type Axis } from './InputSource';

/** Quanto va spinta la levetta prima di contare (zona morta). */
export const DEADZONE = 0.25;
/** Levetta o croce tenuta nei menu: prima ripetizione e ripetizioni successive. */
const REPEAT_FIRST_MS = 380;
const REPEAT_MS = 140;

/** Pulsanti nella mappatura "standard" dei browser (Xbox: A B X Y, LB RB, LT RT…). */
const BTN = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  select: 8,
  start: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

/** Pulsanti che fanno lo scatto (smash) e la finta in partita. */
const ACTION_BUTTONS: Record<PlayerAction, readonly number[]> = {
  dash: [BTN.a, BTN.rb, BTN.rt],
  fake: [BTN.b, BTN.x, BTN.lb, BTN.lt],
};

/** Quel che serve di un `Gamepad` del browser (sostituibile nei test). */
export interface PadState {
  index: number;
  connected: boolean;
  buttons: readonly { pressed: boolean; value?: number }[];
  axes: readonly number[];
}

export interface PadFrame {
  /** Pressioni di scatto/finta, per controller (nell'ordine dei controller collegati). */
  presses: { pad: number; action: PlayerAction; t: number }[];
  /** Comandi dei menu da qualunque controller. */
  menu: MenuKey[];
  /** START premuto (pausa) su qualunque controller. */
  start: boolean;
}

interface PadMemory {
  buttons: boolean[];
  /** Direzione del menu tenuta e prossima ripetizione. */
  dir: MenuKey | null;
  repeatAt: number;
}

/**
 * Controller (Gamepad API): letti una volta per frame. Il k-esimo controller
 * collegato comanda il k-esimo gatto umano. Levetta sinistra e croce muovono,
 * A (o RB/RT) è lo scatto/smash, B (o X/LB/LT) la finta; nei menu A conferma,
 * B torna indietro, START mette in pausa.
 */
export class Gamepads {
  private readonly memory = new Map<number, PadMemory>();
  private pads: PadState[] = [];

  constructor(
    private readonly read: () => readonly (PadState | null)[] = () =>
      typeof navigator !== 'undefined' && navigator.getGamepads
        ? (navigator.getGamepads() as readonly (PadState | null)[])
        : [],
  ) {}

  /** Controller collegati ora. */
  get count(): number {
    return this.pads.length;
  }

  /** Legge i controller e restituisce le novità dall'ultimo frame. */
  poll(now: number): PadFrame {
    let list: readonly (PadState | null)[] = [];
    try {
      list = this.read();
    } catch {
      /* alcuni browser negano i controller in iframe: si gioca senza */
    }
    this.pads = list.filter((p): p is PadState => !!p && p.connected);
    const frame: PadFrame = { presses: [], menu: [], start: false };

    this.pads.forEach((pad, k) => {
      let mem = this.memory.get(pad.index);
      if (!mem) {
        // Appena collegato: i pulsanti già premuti non contano come pressioni.
        mem = { buttons: pad.buttons.map((b) => b.pressed), dir: null, repeatAt: 0 };
        this.memory.set(pad.index, mem);
      }
      const down = (i: number) => pad.buttons[i]?.pressed === true;
      const edge = (i: number) => down(i) && !mem.buttons[i];

      for (const action of ['dash', 'fake'] as const) {
        if (ACTION_BUTTONS[action].some(edge)) frame.presses.push({ pad: k, action, t: now });
      }
      if (edge(BTN.a)) frame.menu.push('enter');
      if (edge(BTN.b)) frame.menu.push('back');
      if (edge(BTN.start)) frame.start = true;

      // Direzione nei menu, con ripetizione se tenuta.
      const a = this.axisOf(pad);
      const dir: MenuKey | null =
        Math.abs(a.y) >= Math.abs(a.x)
          ? a.y < -0.5
            ? 'up'
            : a.y > 0.5
              ? 'down'
              : null
          : a.x < -0.5
            ? 'left'
            : a.x > 0.5
              ? 'right'
              : null;
      if (dir !== mem.dir) {
        mem.dir = dir;
        mem.repeatAt = now + REPEAT_FIRST_MS;
        if (dir) frame.menu.push(dir);
      } else if (dir && now >= mem.repeatAt) {
        mem.repeatAt = now + REPEAT_MS;
        frame.menu.push(dir);
      }

      mem.buttons = pad.buttons.map((b) => b.pressed);
    });
    return frame;
  }

  /** Direzione del controller k (levetta sinistra + croce), con zona morta. */
  axis(k: number): Axis {
    const pad = this.pads[k];
    return pad ? this.axisOf(pad) : NO_AXIS;
  }

  /**
   * Pressioni dei controller assegnate ai gatti: il k-esimo controller al
   * k-esimo slot di `players` (gli umani della partita).
   */
  static toInputs(frame: PadFrame, players: readonly number[]): TimedInput[] {
    return frame.presses.flatMap((p) =>
      p.pad < players.length ? [{ player: players[p.pad], action: p.action, t: p.t }] : [],
    );
  }

  private axisOf(pad: PadState): Axis {
    const dz = (v: number | undefined) => {
      const x = v ?? 0;
      if (Math.abs(x) < DEADZONE) return 0;
      // Riscalata: appena fuori dalla zona morta parte da 0, a fondo corsa vale 1.
      return (Math.sign(x) * (Math.abs(x) - DEADZONE)) / (1 - DEADZONE);
    };
    const btn = (i: number) => (pad.buttons[i]?.pressed ? 1 : 0);
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    return {
      x: clamp(dz(pad.axes[0]) + btn(BTN.right) - btn(BTN.left)),
      y: clamp(dz(pad.axes[1]) + btn(BTN.down) - btn(BTN.up)),
    };
  }
}
