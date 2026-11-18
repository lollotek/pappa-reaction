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
  /** `move`: striscia da trascinare (Scaccia la palla). */
  action: PlayerAction | 'move';
  side: 'left' | 'right';
  /** Centro e dimensione (lato del quadrato che contiene il pulsante). */
  cx: number;
  cy: number;
  size: number;
  /** Solo per la striscia: larghezza (l'altezza è `size`). */
  width?: number;
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

/** Striscia: larghezza rispetto allo schermo, con minimo e massimo (px CSS). */
export const STRIP_MIN = 150;
export const STRIP_MAX = 340;

/**
 * Comandi touch di Scaccia la palla: una striscia orizzontale su cui si
 * trascina il dito (la posizione del dito è la posizione del cuscino) e il
 * pulsante SMASH.
 *
 * - 1 giocatore: striscia sotto il pollice sinistro, SMASH sotto il destro.
 * - 2 giocatori: una colonna per lato, SMASH sopra e striscia sotto.
 *
 * Stesse distanze dai bordi e dagli angoli dei pulsanti di Pappa.
 */
export function stripLayout(
  viewW: number,
  viewH: number,
  humans: readonly number[],
  insets: Insets = NO_INSETS,
): TouchButtonSpec[] {
  const dash = Math.round(Math.min(DASH_MAX, Math.max(DASH_MIN, viewH * 0.26)));
  const stripH = Math.round(dash * 0.8);
  const gap = Math.max(MIN_GAP, Math.round(dash * 0.25));
  const margin = Math.max(MIN_SIDE_MARGIN, Math.round(viewW * 0.025));
  const usableTop = insets.top;
  const usableH = viewH - insets.top - insets.bottom;
  const leftEdge = insets.left + margin;
  const rightEdge = viewW - insets.right - margin;

  if (humans.length === 0) return [];

  if (humans.length === 1) {
    const p = humans[0];
    const width = Math.round(Math.min(STRIP_MAX, Math.max(STRIP_MIN, viewW * 0.24)));
    const cy = usableTop + usableH * 0.58;
    return [
      {
        player: p,
        action: 'move',
        side: 'left',
        cx: leftEdge + width / 2,
        cy,
        size: stripH,
        width,
      },
      { player: p, action: 'dash', side: 'right', cx: rightEdge - dash / 2, cy, size: dash },
    ];
  }

  const width = Math.round(Math.min(STRIP_MAX * 0.8, Math.max(STRIP_MIN * 0.85, viewW * 0.2)));
  const column = dash + gap + stripH;
  const top = usableTop + usableH * 0.55 - column / 2;
  const dashY = top + dash / 2;
  const stripY = top + dash + gap + stripH / 2;
  const [a, b] = humans;
  return [
    { player: a, action: 'dash', side: 'left', cx: leftEdge + dash / 2, cy: dashY, size: dash },
    {
      player: a,
      action: 'move',
      side: 'left',
      cx: leftEdge + width / 2,
      cy: stripY,
      size: stripH,
      width,
    },
    { player: b, action: 'dash', side: 'right', cx: rightEdge - dash / 2, cy: dashY, size: dash },
    {
      player: b,
      action: 'move',
      side: 'right',
      cx: rightEdge - width / 2,
      cy: stripY,
      size: stripH,
      width,
    },
  ];
}

/**
 * Comandi touch di Graffio Killer: un solo pulsante grande, ZAMPATA.
 *
 * - 1 giocatore: sotto il pollice destro.
 * - 2 giocatori: uno per lato (il primo a sinistra, il secondo a destra).
 *
 * Più grande del pulsante SCATTO: qui conta il tempismo, non la mira.
 */
export function singleLayout(
  viewW: number,
  viewH: number,
  humans: readonly number[],
  insets: Insets = NO_INSETS,
): TouchButtonSpec[] {
  const size = Math.round(Math.min(DASH_MAX * 1.2, Math.max(DASH_MIN, viewH * 0.3)));
  const margin = Math.max(MIN_SIDE_MARGIN, Math.round(viewW * 0.025));
  const cy = insets.top + (viewH - insets.top - insets.bottom) * 0.6;
  const leftX = insets.left + margin + size / 2;
  const rightX = viewW - insets.right - margin - size / 2;
  if (humans.length === 0) return [];
  if (humans.length === 1) {
    return [{ player: humans[0], action: 'dash', side: 'right', cx: rightX, cy, size }];
  }
  const [a, b] = humans;
  return [
    { player: a, action: 'dash', side: 'left', cx: leftX, cy, size },
    { player: b, action: 'dash', side: 'right', cx: rightX, cy, size },
  ];
}
