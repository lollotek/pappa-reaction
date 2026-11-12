import { describe, expect, it } from 'vitest';
import { playerSlots } from '../src/config/controls';
import { keyLabel } from '../src/config/keyLabel';
import {
  assignKey,
  defaultSettings,
  loadSettings,
  saveSettings,
  type KeyValueStore,
} from '../src/config/settings';
import { GameClock } from '../src/game/GameClock';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('settings', () => {
  const def = defaultSettings(playerSlots);

  it('default: P1 umano, 3 CPU normali, 5 round, tasti predefiniti', () => {
    expect(def.players).toEqual(['human', 'cpu', 'cpu', 'cpu']);
    expect(def.difficulty).toBe('normale');
    expect(def.roundCount).toBe(5);
    expect(def.keys[0]).toEqual({ dash: 'KeyQ', fake: 'KeyA' });
  });

  it('salva e rilegge', () => {
    const store = new MemoryStore();
    const s = { ...def, players: ['cpu', 'human', 'human', 'cpu'] as const, roundCount: 7 };
    saveSettings(store, { ...s, players: [...s.players] });
    expect(loadSettings(store, playerSlots)).toEqual({ ...s, players: [...s.players] });
  });

  it('valori non validi o JSON rotto tornano ai default', () => {
    const store = new MemoryStore();
    store.setItem(
      'pappa.settings',
      JSON.stringify({ difficulty: 'impossibile', roundCount: 4, musicVolume: 99, players: ['x'] }),
    );
    const s = loadSettings(store, playerSlots);
    expect(s.difficulty).toBe('normale');
    expect(s.roundCount).toBe(5);
    expect(s.musicVolume).toBe(def.musicVolume);
    expect(s.players[0]).toBe('human');

    store.setItem('pappa.settings', '{rotto');
    expect(loadSettings(store, playerSlots)).toEqual(def);
    expect(loadSettings(null, playerSlots)).toEqual(def);
  });

  it('tasti duplicati o riservati nel salvataggio: si torna ai predefiniti', () => {
    const store = new MemoryStore();
    const dup = def.keys.map((k) => ({ ...k }));
    dup[1].dash = 'KeyQ';
    store.setItem('pappa.settings', JSON.stringify({ keys: dup }));
    expect(loadSettings(store, playerSlots).keys).toEqual(def.keys);

    const reserved = def.keys.map((k) => ({ ...k }));
    reserved[2].fake = 'Enter';
    store.setItem('pappa.settings', JSON.stringify({ keys: reserved }));
    expect(loadSettings(store, playerSlots).keys[2]).toEqual(def.keys[2]);
  });

  it('assegna un tasto libero', () => {
    const r = assignKey(def.keys, 0, 'dash', 'KeyZ');
    expect(r.ok && r.keys[0]).toEqual({ dash: 'KeyZ', fake: 'KeyA' });
    expect(r.ok && r.swapped).toBe(false);
    expect(def.keys[0].dash).toBe('KeyQ'); // input non modificato
  });

  it('tasto già usato: le due azioni si scambiano', () => {
    const r = assignKey(def.keys, 0, 'dash', 'KeyT'); // T è lo scatto di Tempesta
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.keys[0].dash).toBe('KeyT');
    expect(r.keys[1].dash).toBe('KeyQ');
    expect(r.swapped).toBe(true);
    const all = r.keys.flatMap((k) => [k.dash, k.fake]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('rifiuta i tasti riservati', () => {
    expect(assignKey(def.keys, 0, 'dash', 'Enter').ok).toBe(false);
    expect(assignKey(def.keys, 0, 'fake', 'KeyM').ok).toBe(false);
  });
});

describe('keyLabel', () => {
  it('nomi leggibili', () => {
    expect(keyLabel('KeyQ')).toBe('Q');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('Digit7')).toBe('7');
    expect(keyLabel('Numpad5')).toBe('Num 5');
    expect(keyLabel('Space')).toBe('Spazio');
  });
});

describe('GameClock', () => {
  it('il tempo di gioco si ferma in pausa e riprende da dove era', () => {
    const c = new GameClock();
    expect(c.now(1000)).toBe(1000);
    c.pause(1500);
    expect(c.paused).toBe(true);
    expect(c.now(4000)).toBe(1500);
    c.resume(4000);
    expect(c.now(4100)).toBe(1600);
    expect(c.toGame(4050)).toBe(1550);
    c.resume(5000); // doppio resume: nessun effetto
    expect(c.now(5000)).toBe(2500);
  });
});
