import { describe, expect, it } from 'vitest';
import { playerSlots } from '../src/config/controls';
import {
  loadSettings,
  saveSettings,
  defaultSettings,
  type KeyValueStore,
} from '../src/config/settings';
import { MergedInput, TouchInput } from '../src/input/InputSource';
import {
  DASH_MAX,
  DASH_MIN,
  MIN_GAP,
  MIN_SIDE_MARGIN,
  touchLayout,
  type TouchButtonSpec,
} from '../src/input/touchLayout';
import { limitHumans, resolveTouchMode, touchHumans } from '../src/platform/touchMode';

/** Schermi tipici in orizzontale (px CSS): telefono piccolo, telefono, tablet. */
const SCREENS: [number, number][] = [
  [568, 320],
  [844, 390],
  [1024, 768],
  [1366, 1024],
];

const dist = (a: TouchButtonSpec, b: TouchButtonSpec) => Math.hypot(a.cx - b.cx, a.cy - b.cy);

describe('touchLayout', () => {
  it('nessun umano: nessun pulsante', () => {
    expect(touchLayout(844, 390, [])).toEqual([]);
  });

  it('1 giocatore: SCATTO a destra, FINTA a sinistra, alla stessa altezza', () => {
    const [fake, dash] = touchLayout(844, 390, [2]);
    expect(fake).toMatchObject({ player: 2, action: 'fake', side: 'left' });
    expect(dash).toMatchObject({ player: 2, action: 'dash', side: 'right' });
    expect(fake.cy).toBe(dash.cy);
    expect(dash.size).toBeGreaterThan(fake.size);
  });

  it('2 giocatori: una colonna per lato, FINTA sopra e SCATTO sotto', () => {
    const b = touchLayout(844, 390, [0, 3]);
    expect(b.map((x) => `${x.player}${x.action}${x.side}`)).toEqual([
      '0fakeleft',
      '0dashleft',
      '3fakeright',
      '3dashright',
    ]);
    expect(b[0].cy).toBeLessThan(b[1].cy);
    expect(b[0].cx).toBe(b[1].cx);
  });

  for (const [w, h] of SCREENS) {
    for (const humans of [[0], [0, 1]]) {
      it(`${w}×${h}, ${humans.length} giocatori: dentro lo schermo, lontano dai bordi, senza sovrapposizioni`, () => {
        const buttons = touchLayout(w, h, humans);
        for (const b of buttons) {
          expect(b.cx - b.size / 2).toBeGreaterThanOrEqual(MIN_SIDE_MARGIN);
          expect(b.cx + b.size / 2).toBeLessThanOrEqual(w - MIN_SIDE_MARGIN);
          expect(b.cy - b.size / 2).toBeGreaterThan(h * 0.15); // sotto i pannelli in alto
          expect(b.cy + b.size / 2).toBeLessThan(h * 0.9);
          if (b.action === 'dash') {
            expect(b.size).toBeGreaterThanOrEqual(DASH_MIN);
            expect(b.size).toBeLessThanOrEqual(DASH_MAX);
          }
        }
        for (let i = 0; i < buttons.length; i++) {
          for (let j = i + 1; j < buttons.length; j++) {
            const a = buttons[i];
            const c = buttons[j];
            // Distanza minima tra i bordi (quadrati inscritti nei cerchi: misura prudente).
            expect(dist(a, c) - a.size / 2 - c.size / 2).toBeGreaterThanOrEqual(MIN_GAP);
          }
        }
      });
    }
  }

  it('rispetta le aree sicure (notch)', () => {
    const plain = touchLayout(844, 390, [0, 1]);
    const notch = touchLayout(844, 390, [0, 1], { top: 0, right: 44, bottom: 21, left: 44 });
    expect(notch[0].cx).toBe(plain[0].cx + 44);
    expect(notch[2].cx).toBe(plain[2].cx - 44);
  });
});

describe('touchMode', () => {
  it('auto: si accende al primo tocco o con puntatore "coarse"', () => {
    expect(resolveTouchMode('auto', false, false)).toBe(false);
    expect(resolveTouchMode('auto', true, false)).toBe(true);
    expect(resolveTouchMode('auto', false, true)).toBe(true);
    expect(resolveTouchMode('on', false, false)).toBe(true);
    expect(resolveTouchMode('off', true, true)).toBe(false);
  });

  it('limitHumans: al massimo 2 umani, tiene quello appena scelto', () => {
    expect(limitHumans(['human', 'human', 'human', 'cpu'], 2)).toEqual([
      'human',
      'human',
      'cpu',
      'cpu',
    ]);
    expect(limitHumans(['human', 'human', 'cpu', 'human'], 2, 3)).toEqual([
      'human',
      'cpu',
      'cpu',
      'human',
    ]);
    expect(limitHumans(['cpu', 'human', 'cpu', 'cpu'], 2)).toEqual(['cpu', 'human', 'cpu', 'cpu']);
  });

  it('touchHumans: i primi 2 umani nell’ordine', () => {
    expect(touchHumans(['cpu', 'human', 'cpu', 'human'])).toEqual([1, 3]);
    expect(touchHumans(['human', 'human', 'human', 'human'])).toEqual([0, 1]);
  });
});

describe('input touch', () => {
  it('TouchInput accoda le pressioni ordinate per tempo e si svuota', () => {
    const t = new TouchInput();
    t.press(1, 'dash', 20);
    t.press(0, 'fake', 10);
    expect(t.drain()).toEqual([
      { player: 0, action: 'fake', t: 10 },
      { player: 1, action: 'dash', t: 20 },
    ]);
    expect(t.drain()).toEqual([]);
    t.press(0, 'dash', 5);
    t.clear();
    expect(t.drain()).toEqual([]);
  });

  it('MergedInput unisce tastiera e tocco in ordine di tempo', () => {
    const a = new TouchInput();
    const b = new TouchInput();
    const m = new MergedInput([a, b]);
    a.press(0, 'dash', 30);
    b.press(1, 'dash', 25);
    a.press(0, 'fake', 10);
    expect(m.drain().map((i) => i.t)).toEqual([10, 25, 30]);
    a.press(0, 'dash', 1);
    m.clear();
    expect(m.drain()).toEqual([]);
  });
});

describe('impostazione pulsanti touch', () => {
  class MemoryStore implements KeyValueStore {
    data = new Map<string, string>();
    getItem(k: string) {
      return this.data.get(k) ?? null;
    }
    setItem(k: string, v: string) {
      this.data.set(k, v);
    }
  }

  it('default auto; si salva; valori non validi tornano ad auto', () => {
    const store = new MemoryStore();
    expect(defaultSettings(playerSlots).touch).toBe('auto');
    saveSettings(store, { ...defaultSettings(playerSlots), touch: 'off' });
    expect(loadSettings(store, playerSlots).touch).toBe('off');
    store.setItem('pappa.settings', JSON.stringify({ touch: 'forse' }));
    expect(loadSettings(store, playerSlots).touch).toBe('auto');
  });
});
