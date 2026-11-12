import type { Controller } from '../config/settings';

/** Preferenza dell'utente per i comandi touch. */
export type TouchPref = 'auto' | 'on' | 'off';
export const TOUCH_PREFS: readonly TouchPref[] = ['auto', 'on', 'off'];

/** Giocatori umani al massimo in modalità touch (GDD §12.1). */
export const MAX_TOUCH_HUMANS = 2;

/**
 * Modalità touch attiva? In automatico si accende al primo tocco sullo schermo
 * o se il puntatore principale è un dito (`pointer: coarse`).
 */
export function resolveTouchMode(pref: TouchPref, sawTouch: boolean, coarse: boolean): boolean {
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return sawTouch || coarse;
}

/**
 * Lascia al massimo `max` umani: tiene `prefer` (lo slot appena scelto),
 * poi i primi nell'ordine; gli altri diventano CPU.
 */
export function limitHumans(
  players: readonly Controller[],
  max: number,
  prefer?: number,
): Controller[] {
  const humans = players.flatMap((c, i) => (c === 'human' ? [i] : []));
  if (humans.length <= max) return [...players];
  const keep = new Set<number>();
  if (prefer !== undefined && players[prefer] === 'human') keep.add(prefer);
  for (const i of humans) if (keep.size < max) keep.add(i);
  return players.map((c, i) => (c === 'human' && !keep.has(i) ? 'cpu' : c));
}

/** Slot umani con i pulsanti touch, nell'ordine (al massimo 2). */
export function touchHumans(players: readonly Controller[]): number[] {
  return players.flatMap((c, i) => (c === 'human' ? [i] : [])).slice(0, MAX_TOUCH_HUMANS);
}
