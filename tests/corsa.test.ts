import { describe, expect, it } from 'vitest';
import { CorsaCpu } from '../src/games/corsa/ai/CorsaCpu';
import {
  CorsaMatch,
  STEP_MS,
  NO_DIRECTION,
  type CorsaEvent,
} from '../src/games/corsa/core/CorsaMatch';
import {
  keepOnTrack,
  laneLength,
  lanePoint,
  project,
  roundBox,
} from '../src/games/corsa/core/track';
import { corsaTuning } from '../src/games/corsa/tuning';
import { Rng } from '../src/core/Rng';
import { playerSlots } from '../src/config/controls';
import { defaultSettings, loadSettings, saveSettings } from '../src/config/settings';
import { withCorsaKeys } from '../src/games/corsa/keys';
import { stickLayout } from '../src/input/touchLayout';

const T = corsaTuning;

function match(laps: number = T.race.laps, seed = 1) {
  return new CorsaMatch({ playerCount: 4, laps }, new Rng(seed), 0);
}

function startRace(m: CorsaMatch) {
  m.advanceTo(T.race.intro * 1000 + STEP_MS, () => NO_DIRECTION);
  m.drainEvents();
}

/** Corsa tra sole CPU fino all'arrivo (o al limite di tempo). */
function cpuRace(m: CorsaMatch, seed: number, level: keyof typeof T.cpu = 'normale') {
  const cpus = m.runners.map((_, p) => new CorsaCpu(p, T.cpu[level], new Rng(seed + p), T));
  const events: CorsaEvent[] = [];
  let now = 0;
  while (m.phase !== 'final' && now < 240_000) {
    now += 16;
    // Come in partita: le CPU decidono una volta per frame, poi si avanza.
    const axes = cpus.map((c) => c.control(m, m.time));
    const drops = cpus.flatMap((c) => c.drainDrops());
    m.advanceTo(now, (p) => axes[p], drops);
    events.push(...m.drainEvents());
  }
  return { events, now };
}

describe('pista', () => {
  it('la mediana è un anello chiuso e la griglia sta dietro al traguardo', () => {
    const L = laneLength();
    expect(L).toBeGreaterThan(30);
    expect(L).toBeLessThan(60);
    const start = lanePoint(0);
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(T.track.mid.y);
    // Si corre verso destra in basso (antiorario sullo schermo).
    expect(start.tx).toBeCloseTo(1);
    const end = lanePoint(L);
    expect(end.x).toBeCloseTo(start.x);
    expect(end.y).toBeCloseTo(start.y);
  });

  it('project() inverte lanePoint() in ogni tratto, anche con offset', () => {
    const L = laneLength();
    for (let s = 0.3; s < L; s += 1.7) {
      for (const off of [-1.4, 0, 1.4]) {
        const p = lanePoint(s, off);
        const back = project(p);
        expect(back.s).toBeCloseTo(s, 4);
        expect(back.off).toBeCloseTo(off, 4);
      }
    }
  });

  it('le corsie estreme stanno dentro la pista', () => {
    const L = laneLength();
    for (let s = 0; s < L; s += 0.9) {
      for (const off of [-1.5, 1.5]) {
        const p = lanePoint(s, off);
        expect(roundBox(p, T.track.outer).d).toBeLessThan(0);
        expect(roundBox(p, T.track.inner).d).toBeGreaterThan(0);
      }
    }
  });

  it('keepOnTrack tiene il gatto fuori dall’isola e dentro lo steccato', () => {
    const inIsland = { x: 0, y: 0 };
    expect(keepOnTrack(inIsland, 0.4)).not.toBeNull();
    expect(roundBox(inIsland, T.track.inner).d).toBeGreaterThanOrEqual(0.4 - 1e-6);
    const outside = { x: 20, y: 9 };
    keepOnTrack(outside, 0.4);
    expect(roundBox(outside, T.track.outer).d).toBeLessThanOrEqual(-0.4 + 1e-6);
  });
});

describe('partita', () => {
  it('prima del via nessuno si muove; poi parte', () => {
    const m = match();
    const before = m.runners.map((r) => ({ ...r.pos }));
    m.advanceTo(1000, () => ({ x: 1, y: 0 }));
    expect(m.phase).toBe('intro');
    expect(m.runners.map((r) => r.pos)).toEqual(before);
    m.advanceTo(T.race.intro * 1000 + 1500, () => ({ x: 1, y: 0 }));
    expect(m.phase).toBe('play');
    expect(m.runners[0].pos.x).toBeGreaterThan(before[0].x + 1);
  });

  it('le corsie di partenza sono diverse e a tutti la stessa distanza dal via (±1 m)', () => {
    const m = match();
    expect(new Set(m.lanes).size).toBe(4);
    for (const r of m.runners) {
      expect(r.dist).toBeLessThan(0);
      expect(r.dist).toBeGreaterThan(-T.race.gridBack - 1.2);
    }
  });

  it('un giro completo assegna le cacchette in base alla posizione', () => {
    const m = match();
    startRace(m);
    // Tutti dietro alla linea, uno alla volta la taglia: il 1° prende 0, gli altri 1, 2, 3.
    const L = m.lapLength;
    m.runners.forEach((r, i) => {
      r.dist = L - 0.01 - (3 - i) * 5; // gatto 3 in testa, gatto 0 ultimo
      r.laps = 0;
      const p = lanePoint(L - 0.01 - (3 - i) * 5, 0);
      r.pos = { x: p.x, y: p.y };
      r.lastS = project(r.pos).s;
    });
    // Il gatto 3 (primo) taglia il traguardo, poi gli altri.
    const order = [3, 2, 1, 0];
    const awarded: number[] = [];
    order.forEach((p, k) => {
      const r = m.runners[p];
      // Corsie diverse (niente urti) e ognuno un po' meno avanti del precedente.
      const next = lanePoint(0.12 - k * 0.03, (k - 1.5) * 0.95);
      r.pos = { x: next.x, y: next.y };
      r.heading = 0;
      m.advanceTo(m.time + 2 * STEP_MS, (q) => (q === p ? { x: 1, y: 0 } : NO_DIRECTION));
      for (const e of m.drainEvents())
        if (e.type === 'lap' && e.player === p) awarded.push(e.gained);
    });
    expect(m.runners[3].laps).toBe(1);
    expect(awarded).toEqual([0, 1, 2, 3]);
    expect(m.runners.map((r) => r.traps)).toEqual([3, 2, 1, 0]);
  });

  it('la riserva non supera 3 cacchette', () => {
    const m = match();
    startRace(m);
    m.runners[0].traps = 2;
    const L = m.lapLength;
    const p = lanePoint(L - 0.05, 0);
    m.runners[0].pos = { x: p.x, y: p.y };
    m.runners[0].dist = L - 0.05;
    m.runners[0].lastS = project(m.runners[0].pos).s;
    // Gli altri più avanti: il gatto 0 è ultimo e prenderebbe 3.
    m.runners.forEach((r, i) => i && (r.dist = L + 50));
    m.advanceTo(m.time + 200, (q) => (q === 0 ? { x: 1, y: 0 } : NO_DIRECTION));
    expect(m.runners[0].laps).toBe(1);
    expect(m.runners[0].traps).toBe(3);
  });

  it('rilascio: serve una riserva; l’avversario che la pesta si ferma, chi l’ha lasciata no', () => {
    const m = match();
    startRace(m);
    m.drop(0, m.time);
    expect(m.traps).toHaveLength(0); // nessuna riserva
    m.runners[0].traps = 1;
    m.drop(0, m.time);
    expect(m.traps).toHaveLength(1);
    expect(m.runners[0].traps).toBe(0);
    const trap = m.traps[0];

    // Il proprietario ci passa sopra: niente.
    m.runners[0].pos = { ...trap.pos };
    m.advanceTo(m.time + 4 * STEP_MS, () => NO_DIRECTION);
    expect(m.stunned(0)).toBe(false);
    expect(m.traps).toHaveLength(1);

    // Un altro gatto ci passa sopra: si ferma e la cacchetta sparisce.
    m.runners[1].pos = { ...trap.pos };
    m.runners[1].speed = 5;
    m.advanceTo(m.time + 4 * STEP_MS, () => NO_DIRECTION);
    expect(m.stunned(1)).toBe(true);
    expect(m.runners[1].speed).toBe(0);
    expect(m.traps).toHaveLength(0);
    const events = m.drainEvents();
    expect(events.some((e) => e.type === 'stun' && e.player === 1 && e.owner === 0)).toBe(true);

    // Stordito non avanza, anche se spinge.
    const at = { ...m.runners[1].pos };
    m.advanceTo(m.time + 500, (p) => (p === 1 ? { x: 1, y: 0 } : NO_DIRECTION));
    expect(Math.hypot(m.runners[1].pos.x - at.x, m.runners[1].pos.y - at.y)).toBeLessThan(0.05);
    // …poi riparte.
    m.advanceTo(m.time + T.trap.stunMs, (p) => (p === 1 ? { x: 1, y: 0 } : NO_DIRECTION));
    expect(m.stunned(1)).toBe(false);
  });

  it('le cacchette scadono', () => {
    const m = match();
    startRace(m);
    m.runners[0].traps = 1;
    m.drop(0, m.time);
    m.advanceTo(m.time + T.trap.life * 1000 + 100, () => NO_DIRECTION);
    expect(m.traps).toHaveLength(0);
    expect(m.drainEvents().some((e) => e.type === 'expire')).toBe(true);
  });

  it('due gatti che si urtano si separano e non si compenetrano', () => {
    const m = match();
    startRace(m);
    m.runners[0].pos = { x: 0, y: 3 };
    m.runners[1].pos = { x: 0.3, y: 3 };
    m.advanceTo(m.time + 4 * STEP_MS, () => NO_DIRECTION);
    const d = Math.hypot(
      m.runners[0].pos.x - m.runners[1].pos.x,
      m.runners[0].pos.y - m.runners[1].pos.y,
    );
    expect(d).toBeGreaterThanOrEqual(2 * T.runner.radius - 1e-6);
  });

  it('sterzare a fondo costa velocità', () => {
    const m = match();
    startRace(m);
    const run = (axis: { x: number; y: number }) => {
      const mm = match();
      startRace(mm);
      mm.advanceTo(mm.time + 600, (p) => (p === 0 ? { x: 1, y: 0 } : NO_DIRECTION));
      mm.advanceTo(mm.time + 150, (p) => (p === 0 ? axis : NO_DIRECTION));
      return mm.runners[0].speed;
    };
    expect(run({ x: 1, y: 0 })).toBeGreaterThan(run({ x: -1, y: 0.1 }));
  });

  it('tenere premuto lungo l’anello fa un giro nel tempo giusto', () => {
    // Un gatto guidato lungo la mediana: 9 giri in 45–90 secondi.
    const m = match(1);
    startRace(m);
    const cpu = new CorsaCpu(0, T.cpu.difficile, new Rng(3), T);
    let now = 0;
    while (m.phase !== 'final' && now < 120_000) {
      now += 50;
      m.advanceTo(now, (p) => (p === 0 ? cpu.control(m, m.time) : NO_DIRECTION));
    }
    expect(m.phase).toBe('final');
    expect(m.winner).toBe(0);
    expect(m.runners[0].laps).toBe(1);
    // Un giro dura circa lapLength / velocità.
    const seconds = (m.time - m.playStart) / 1000;
    expect(seconds).toBeGreaterThan(m.lapLength / T.runner.maxSpeed / 1.4);
    expect(seconds).toBeLessThan((m.lapLength / T.runner.maxSpeed) * 1.8);
  });
});

describe('gara tra CPU', () => {
  it.each(['facile', 'normale', 'difficile'] as const)(
    '%s: 9 giri finiscono con un vincitore',
    (level) => {
      const m = match(T.race.laps, 5);
      startRace(m);
      const { events, now } = cpuRace(m, 11, level);
      expect(m.phase).toBe('final');
      expect(m.winner).not.toBeNull();
      expect(m.standings).toHaveLength(4);
      expect(m.runners[m.winner!].laps).toBe(T.race.laps);
      // Un giro per ogni gatto è stato contato più volte e i premi sono stati dati.
      expect(events.filter((e) => e.type === 'lap').length).toBeGreaterThanOrEqual(T.race.laps - 1);
      expect(events.some((e) => e.type === 'lastLap')).toBe(true);
      // Durata ragionevole: tra 40 e 150 secondi.
      expect(now / 1000).toBeGreaterThan(40);
      expect(now / 1000).toBeLessThan(150);
    },
  );

  it('con le cacchette in gioco qualcuno le pesta', () => {
    let stuns = 0;
    let drops = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const m = match(T.race.laps, seed);
      startRace(m);
      const { events } = cpuRace(m, 100 + seed, 'difficile');
      stuns += events.filter((e) => e.type === 'stun').length;
      drops += events.filter((e) => e.type === 'drop').length;
    }
    expect(drops).toBeGreaterThan(5);
    expect(stuns).toBeGreaterThan(0);
  });

  it('è riproducibile con lo stesso seed', () => {
    const run = () => {
      const m = match(3, 9);
      startRace(m);
      cpuRace(m, 21);
      return { winner: m.winner, t: m.time, standings: m.standings };
    };
    expect(run()).toEqual(run());
  });
});

describe('comandi touch e impostazioni', () => {
  const SCREENS: [number, number][] = [
    [568, 320],
    [844, 390],
    [1024, 768],
  ];

  it('joystick e CACCA stanno dentro lo schermo e non si sovrappongono', () => {
    for (const [w, h] of SCREENS) {
      for (const humans of [[0], [0, 1]]) {
        const specs = stickLayout(w, h, humans);
        expect(specs.filter((s) => s.action === 'stick')).toHaveLength(humans.length);
        expect(specs.filter((s) => s.action === 'dash')).toHaveLength(humans.length);
        for (const s of specs) {
          expect(s.cx - s.size / 2).toBeGreaterThanOrEqual(0);
          expect(s.cx + s.size / 2).toBeLessThanOrEqual(w);
          expect(s.cy - s.size / 2).toBeGreaterThanOrEqual(0);
          expect(s.cy + s.size / 2).toBeLessThanOrEqual(h);
        }
        specs.forEach((a, i) =>
          specs.slice(i + 1).forEach((b) => {
            expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThanOrEqual(
              (a.size + b.size) / 2,
            );
          }),
        );
      }
    }
    expect(stickLayout(844, 390, [])).toEqual([]);
  });

  it('giri: 9 di base, si salvano e un valore non valido torna a 9', () => {
    expect(defaultSettings(playerSlots).lapCount).toBe(9);
    const store = new Map<string, string>();
    const kv = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    saveSettings(kv, { ...defaultSettings(playerSlots), lapCount: 5 });
    expect(loadSettings(kv, playerSlots).lapCount).toBe(5);
    saveSettings(kv, { ...defaultSettings(playerSlots), lapCount: 4 });
    expect(loadSettings(kv, playerSlots).lapCount).toBe(9);
  });

  it('i tasti su/giù di Corsa pazza sono liberi e non doppi', () => {
    const keys = withCorsaKeys(defaultSettings(playerSlots).keys);
    const all = keys.flatMap((k) => Object.values(k)).filter(Boolean);
    expect(new Set(all).size).toBe(all.length);
    for (const k of keys) {
      expect(k.up).not.toBe('');
      expect(k.down).not.toBe('');
    }
    // Chi li ha già assegnati a mano li tiene.
    const custom = defaultSettings(playerSlots).keys;
    custom[0].up = 'KeyW';
    expect(withCorsaKeys(custom)[0].up).toBe('KeyW');
  });
});
