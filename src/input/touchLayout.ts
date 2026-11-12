import type { PlayerAction } from '../core/MatchMachine';

/**
 * Posizione dei pulsanti touch (logica pura, misure in pixel CSS).
 *
 * - 1 giocatore (dispositivo in mano): SCATTO sotto il pollice destro,
 *   FINTA sotto il pollice sinistro, alla stessa altezza.
 * - 2 giocatori (dispositivo appoggiato): una colonna per lato, FINTA sopra
 *   e SCATTO sotto; il primo umano a sinistra, il secondo a destra.
 *
 * I pulsanti stanno a metà altezza, lontani dai bordi (gesti di sistema)
 * e dagli angoli (pannelli dei punteggi). Vedi docs/GDD.md §12.3.
 */

export interface TouchButtonSpec {
  player: number;
  action: PlayerAction;
  side: 'left' | 'right';
  /** Centro e dimensione (lato del quadrato che contiene il pulsante). */
  cx: number;
  cy: number;
  size: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Limiti del pulsante SCATTO (px CSS): ~15 mm minimo su un telefono. */
export const DASH_MIN = 64;
export const DASH_MAX = 128;
/** FINTA più piccola dello scatto. */
export const FAKE_RATIO = 0.72;
/** Distanza minima tra due pulsanti dello stesso giocatore. */
export const MIN_GAP = 16;
/** Distanza minima dal bordo laterale (oltre all'area sicura). */
export const MIN_SIDE_MARGIN = 18;

export function touchLayout(
  viewW: number,
  viewH: number,
  /** Slot dei giocatori umani con i pulsanti (al massimo 2, nell'ordine). */
  humans: readonly number[],
  insets: Insets = NO_INSETS,
): TouchButtonSpec[] {
  const dash = Math.round(Math.min(DASH_MAX, Math.max(DASH_MIN, viewH * 0.26)));
  const fake = Math.round(dash * FAKE_RATIO);
  const gap = Math.max(MIN_GAP, Math.round(dash * 0.2));
  const margin = Math.max(MIN_SIDE_MARGIN, Math.round(viewW * 0.025));
  // Centro della colonna: allineato al pulsante più grande.
  const leftX = insets.left + margin + dash / 2;
  const rightX = viewW - insets.right - margin - dash / 2;
  const usableTop = insets.top;
  const usableH = viewH - insets.top - insets.bottom;

  if (humans.length === 0) return [];

  if (humans.length === 1) {
    const p = humans[0];
    const cy = usableTop + usableH * 0.55;
    return [
      { player: p, action: 'fake', side: 'left', cx: leftX, cy, size: fake },
      { player: p, action: 'dash', side: 'right', cx: rightX, cy, size: dash },
    ];
  }

  const column = fake + gap + dash;
  const top = usableTop + usableH * 0.52 - column / 2;
  const fakeY = top + fake / 2;
  const dashY = top + fake + gap + dash / 2;
  const [a, b] = humans;
  return [
    { player: a, action: 'fake', side: 'left', cx: leftX, cy: fakeY, size: fake },
    { player: a, action: 'dash', side: 'left', cx: leftX, cy: dashY, size: dash },
    { player: b, action: 'fake', side: 'right', cx: rightX, cy: fakeY, size: fake },
    { player: b, action: 'dash', side: 'right', cx: rightX, cy: dashY, size: dash },
  ];
}
