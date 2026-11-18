import { TOUCH_PREFS, type TouchPref } from '../platform/touchMode';
import type { PlayerSlot } from './controls';
import { tuning, type Difficulty } from './tuning';

export type Controller = 'human' | 'cpu';
/**
 * Azioni con un tasto per ogni gatto. `dash` è il tasto principale (scatto in
 * Pappa, smash in Scaccia la palla); le direzioni servono ai giochi con il
 * movimento. Su e giù per ora non hanno tasti predefiniti ('' = nessun tasto).
 */
export type KeyAction = 'dash' | 'fake' | 'left' | 'right' | 'up' | 'down';
export const KEY_ACTIONS: readonly KeyAction[] = ['dash', 'fake', 'left', 'right', 'up', 'down'];
/** Azioni che possono restare senza tasto. */
const OPTIONAL_ACTIONS: readonly KeyAction[] = ['up', 'down'];

/** Tasti di un gatto (`KeyboardEvent.code`, '' = nessun tasto). */
export type KeyPair = Record<KeyAction, string>;

/** Preferenze salvate nel browser tra una sessione e l'altra. */
export interface Settings {
  players: Controller[];
  difficulty: Difficulty;
  roundCount: number;
  /** Scaccia la palla: punti per vincere. */
  targetScore: number;
  /** Scaccia la palla: partita a tempo (poi vince chi è in testa). */
  timeLimit: boolean;
  keys: KeyPair[];
  /** 0..10 */
  musicVolume: number;
  /** 0..10 */
  sfxVolume: number;
  /** Arbitro "furbo": alla finta del coperchio la musica fa un singhiozzo. */
  trickyReferee: boolean;
  /** Lampo al reveal, scosse e zoom della camera. */
  screenEffects: boolean;
  /** Pulsanti touch: automatici (al primo tocco), sempre o mai. */
  touch: TouchPref;
  /** In modalità touch: schermo intero (e rotazione bloccata) quando si gioca. */
  fullscreen: boolean;
}

export const ROUND_OPTIONS = [3, 5, 7] as const;
export const TARGET_OPTIONS = [3, 5, 7] as const;
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
    targetScore: 5,
    timeLimit: false,
    keys: slots.map((s) => ({ ...s.keys })),
    musicVolume: 7,
    sfxVolume: 8,
    trickyReferee: false,
    screenEffects: true,
    touch: 'auto',
    fullscreen: true,
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

  const keys = loadKeys(raw.keys, def.keys);

  return {
    players,
    difficulty: DIFFICULTIES.includes(raw.difficulty as Difficulty)
      ? (raw.difficulty as Difficulty)
      : def.difficulty,
    roundCount: ROUND_OPTIONS.includes(raw.roundCount as (typeof ROUND_OPTIONS)[number])
      ? (raw.roundCount as number)
      : def.roundCount,
    targetScore: TARGET_OPTIONS.includes(raw.targetScore as (typeof TARGET_OPTIONS)[number])
      ? (raw.targetScore as number)
      : def.targetScore,
    timeLimit: typeof raw.timeLimit === 'boolean' ? raw.timeLimit : def.timeLimit,
    keys,
    musicVolume: volume(raw.musicVolume, def.musicVolume),
    sfxVolume: volume(raw.sfxVolume, def.sfxVolume),
    trickyReferee: typeof raw.trickyReferee === 'boolean' ? raw.trickyReferee : def.trickyReferee,
    screenEffects: typeof raw.screenEffects === 'boolean' ? raw.screenEffects : def.screenEffects,
    touch: TOUCH_PREFS.includes(raw.touch as TouchPref) ? (raw.touch as TouchPref) : def.touch,
    fullscreen: typeof raw.fullscreen === 'boolean' ? raw.fullscreen : def.fullscreen,
  };
}

/**
 * Tasti salvati: quelli validi restano; le azioni mancanti (es. le direzioni,
 * arrivate dopo) prendono il predefinito se è libero, altrimenti restano senza
 * tasto. Tasti doppi (salvataggio corrotto): si torna ai predefiniti.
 */
const MISSING = '<missing>';
const validCode = (c: string) => c !== '' && c !== MISSING;

function loadKeys(raw: unknown, def: readonly KeyPair[]): KeyPair[] {
  const saved = Array.isArray(raw) ? (raw as Partial<Record<KeyAction, unknown>>[]) : [];
  const valid = (c: unknown): c is string =>
    typeof c === 'string' && c !== '' && !RESERVED_KEYS.includes(c);
  // Prima i tasti salvati (dash e finta obbligatori per ogni gatto).
  const keys = def.map((d, i): KeyPair | null => {
    const k = saved[i];
    if (!k || !valid(k.dash) || !valid(k.fake)) return null;
    const out = { ...d };
    for (const a of KEY_ACTIONS) {
      const c = k[a];
      out[a] = valid(c) ? c : c === '' && OPTIONAL_ACTIONS.includes(a) ? '' : MISSING;
    }
    return out;
  });
  if (keys.some((k) => k === null)) return def.map((k) => ({ ...k }));
  const result = keys as KeyPair[];
  const used = () => result.flatMap((k) => KEY_ACTIONS.map((a) => k[a])).filter(validCode);
  const all = used();
  if (new Set(all).size !== all.length) return def.map((k) => ({ ...k }));
  // Poi le azioni mancanti: predefinito se libero.
  result.forEach((k, i) => {
    for (const a of KEY_ACTIONS) {
      if (k[a] !== MISSING) continue;
      k[a] = used().includes(def[i][a]) ? '' : def[i][a];
    }
  });
  return result;
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
  let error: string | null = null;
  next.forEach((k, p) => {
    KEY_ACTIONS.forEach((a) => {
      if (k[a] !== code || (p === player && a === action)) return;
      // Scambio con un'azione senza tasto: va bene solo se quell'azione può restare senza.
      if (previous === '' && !OPTIONAL_ACTIONS.includes(a)) {
        error = 'Tasto già usato da un altro comando: scegline un altro';
        return;
      }
      k[a] = previous;
      swapped = true;
    });
  });
  if (error) return { ok: false, error };
  next[player][action] = code;
  return { ok: true, keys: next, swapped };
}
