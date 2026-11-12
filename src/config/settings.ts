import type { PlayerSlot } from './controls';
import { tuning, type Difficulty } from './tuning';

export type Controller = 'human' | 'cpu';
export type KeyAction = 'dash' | 'fake';
export interface KeyPair {
  dash: string;
  fake: string;
}

/** Preferenze salvate nel browser tra una sessione e l'altra. */
export interface Settings {
  players: Controller[];
  difficulty: Difficulty;
  roundCount: number;
  keys: KeyPair[];
  /** 0..10 */
  musicVolume: number;
  /** 0..10 */
  sfxVolume: number;
  /** Arbitro "furbo": alla finta del coperchio la musica fa un singhiozzo. */
  trickyReferee: boolean;
  /** Lampo al reveal, scosse e zoom della camera. */
  screenEffects: boolean;
}

export const ROUND_OPTIONS = [3, 5, 7] as const;
export const DIFFICULTIES = Object.keys(tuning.cpu) as Difficulty[];
/** Tasti riservati ai menu e alle funzioni del gioco: non assegnabili ai gatti. */
export const RESERVED_KEYS = ['Enter', 'Escape', 'KeyM', 'F3', 'Tab'];

const STORAGE_KEY = 'pappa.settings';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultSettings(slots: readonly PlayerSlot[]): Settings {
  return {
    players: slots.map((_, i) => (i === 0 ? 'human' : 'cpu')),
    difficulty: 'normale',
    roundCount: tuning.round.count,
    keys: slots.map((s) => ({ ...s.keys })),
    musicVolume: 7,
    sfxVolume: 8,
    trickyReferee: false,
    screenEffects: true,
  };
}

/** Legge le impostazioni salvate; i valori mancanti o non validi tornano ai default. */
export function loadSettings(store: KeyValueStore | null, slots: readonly PlayerSlot[]): Settings {
  const def = defaultSettings(slots);
  let raw: Partial<Settings> = {};
  try {
    const text = store?.getItem(STORAGE_KEY);
    if (text) raw = JSON.parse(text) as Partial<Settings>;
  } catch {
    return def;
  }
  const volume = (v: unknown, d: number) =>
    typeof v === 'number' && v >= 0 && v <= 10 ? Math.round(v) : d;

  const players = slots.map((_, i) => {
    const p = raw.players?.[i];
    return p === 'human' || p === 'cpu' ? p : def.players[i];
  });

  let keys = slots.map((_, i) => {
    const k = raw.keys?.[i];
    const valid = (c: unknown) => typeof c === 'string' && c !== '' && !RESERVED_KEYS.includes(c);
    return k && valid(k.dash) && valid(k.fake) ? { dash: k.dash, fake: k.fake } : def.keys[i];
  });
  // Tasti duplicati (salvataggio corrotto): si torna ai predefiniti.
  const all = keys.flatMap((k) => [k.dash, k.fake]);
  if (new Set(all).size !== all.length) keys = def.keys;

  return {
    players,
    difficulty: DIFFICULTIES.includes(raw.difficulty as Difficulty)
      ? (raw.difficulty as Difficulty)
      : def.difficulty,
    roundCount: ROUND_OPTIONS.includes(raw.roundCount as (typeof ROUND_OPTIONS)[number])
      ? (raw.roundCount as number)
      : def.roundCount,
    keys,
    musicVolume: volume(raw.musicVolume, def.musicVolume),
    sfxVolume: volume(raw.sfxVolume, def.sfxVolume),
    trickyReferee: typeof raw.trickyReferee === 'boolean' ? raw.trickyReferee : def.trickyReferee,
    screenEffects: typeof raw.screenEffects === 'boolean' ? raw.screenEffects : def.screenEffects,
  };
}

export function saveSettings(store: KeyValueStore | null, settings: Settings): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage non disponibile: le impostazioni valgono solo per questa sessione */
  }
}

export type AssignResult =
  { ok: true; keys: KeyPair[]; swapped: boolean } | { ok: false; error: string };

/**
 * Assegna `code` all'azione di un giocatore. Se il tasto era già usato da
 * un'altra azione, le due si scambiano (nessun tasto resta doppio).
 */
export function assignKey(
  keys: readonly KeyPair[],
  player: number,
  action: KeyAction,
  code: string,
): AssignResult {
  if (RESERVED_KEYS.includes(code)) {
    return { ok: false, error: 'Tasto riservato al gioco: scegline un altro' };
  }
  const next = keys.map((k) => ({ ...k }));
  const previous = next[player][action];
  let swapped = false;
  next.forEach((k, p) => {
    (['dash', 'fake'] as const).forEach((a) => {
      if (k[a] === code && !(p === player && a === action)) {
        k[a] = previous;
        swapped = true;
      }
    });
  });
  next[player][action] = code;
  return { ok: true, keys: next, swapped };
}
