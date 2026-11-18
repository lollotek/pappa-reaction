import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { GraffioCpu } from '../src/games/graffio/ai/GraffioCpu';
import { GraffioMatch, type GraffioPress } from '../src/games/graffio/core/GraffioMatch';
import { fallSpeed, graffioTuning } from '../src/games/graffio/tuning';

const T = graffioTuning;

function match(rounds = 3, seed = 1, players = 4): GraffioMatch {
  return new GraffioMatch({ playerCount: players, rounds }, new Rng(seed), 0);
}

/** Porta la partita all'inizio di una fase del round in corso (poi si può comandare a mano). */
function goTo(m: GraffioMatch, phase: GraffioMatch['phase']): void {
  let t = m.phaseStart;
  for (let guard = 0; m.phase !== phase && guard < 2000; guard++) {
    t += 20;
    m.advanceTo(t);
  }
  expect(m.phase).toBe(phase);
}
const toDrop = (m: GraffioMatch) => goTo(m, 'drop');

describe('velocità', () => {
  it('cresce a ogni round fino al massimo', () => {
    expect(fallSpeed(1)).toBeGreaterThan(fallSpeed(0));
    expect(fallSpeed(30)).toBe(T.speed.max);
  });
});

describe('sequenza del round', () => {
  it('intro → show → lift → wait → drop → result', () => {
    const m = match();
    const seen: string[] = [m.phase];
    for (let t = 0; t < 12_000 && m.phase !== 'result'; t += 20) {
      m.advanceTo(t);
      if (seen[seen.length - 1] !== m.phase) seen.push(m.phase);
    }
    expect(seen).toEqual(['intro', 'show', 'lift', 'wait', 'drop', 'result']);
  });

  it('i tubi cadono sfalsati e la tacca incrocia la quota di taglio', () => {
    const m = match();
    toDrop(m);
    const starts = m.dropStart.map((s) => s).sort((a, b) => a - b);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBeGreaterThan(
        (T.timing.staggerStep - T.timing.staggerJitter) * 1000 - 1,
      );
    }
    const g = T.geometry;
    for (let p = 0; p < 4; p++) {
      const bottom = m.bottomAt(p, m.crossTime(p));
      expect(bottom + m.mark).toBeCloseTo(g.cutY, 6);
    }
  });

  it('con gli stessi seed e comandi la partita è identica', () => {
    const run = () => {
      const m = match(3, 42);
      for (let t = 0; t < 40_000; t += 16) {
        const presses: GraffioPress[] = [];
        if (m.phase === 'drop')
          for (let p = 0; p < 4; p++) presses.push({ player: p, t: t - 5 + p });
        m.advanceTo(t, presses);
      }
      return [...m.scores, ...m.errTotals.map(Math.round)];
    };
    expect(run()).toEqual(run());
  });
});

describe('giudizio', () => {
  it('zampata esatta sulla tacca = 10 punti', () => {
    const m = match();
    toDrop(m);
    m.advanceTo(m.crossTime(0) + 1, [{ player: 0, t: m.crossTime(0) }]);
    const cut = m.cuts[0]!;
    expect(cut.points).toBe(10);
    expect(cut.distance).toBeCloseTo(0, 6);
    expect(cut.stub).toBeCloseTo(m.mark, 6);
    expect(m.scores[0]).toBe(10);
  });

  it('più lontano dalla tacca, meno punti; presto o tardi pari scarto = stessi punti', () => {
    const m = match();
    toDrop(m);
    const base = m.crossTime(0);
    const dt = (T.scoring[1].maxDist * 0.9 * 1000) / m.speed; // dentro la fascia da 7
    m.advanceTo(base + 1, [{ player: 0, t: base - dt }]);
    m.advanceTo(m.crossTime(1) + dt + 1, [{ player: 1, t: m.crossTime(1) + dt }]);
    expect(m.cuts[0]!.points).toBe(7);
    expect(m.cuts[1]!.points).toBe(7);
    expect(m.cuts[0]!.distance!).toBeLessThan(0);
    expect(m.cuts[1]!.distance!).toBeGreaterThan(0);
  });

  it('zampata troppo in anticipo: a vuoto, 0 punti', () => {
    const m = match();
    toDrop(m);
    m.advanceTo(m.dropStart[2], [{ player: 2, t: m.dropStart[2] - 300 }]);
    expect(m.cuts[2]!.whiff).toBe('early');
    expect(m.cuts[2]!.points).toBe(0);
  });

  it('zampata mentre i gatti aspettano (falsa partenza): 0 punti', () => {
    const m = match();
    goTo(m, 'wait');
    m.advanceTo(m.phaseStart + 10, [{ player: 3, t: m.phaseStart + 5 }]);
    expect(m.cuts[3]!.whiff).toBe('early');
    expect(m.scores[3]).toBe(0);
  });

  it('una sola zampata a round', () => {
    const m = match();
    toDrop(m);
    const t = m.crossTime(0);
    m.advanceTo(t + 1, [
      { player: 0, t },
      { player: 0, t: t + 10 },
    ]);
    expect(m.scores[0]).toBe(10);
  });

  it('chi non taglia prende 0 e lo scarto massimo; il round finisce da solo', () => {
    const m = match(1);
    toDrop(m);
    m.advanceTo(m.crossTime(0) + 20_000);
    expect(m.phase).toBe('final');
    expect(m.scores.every((s) => s === 0)).toBe(true);
    expect(m.errTotals[0]).toBe(T.missErrorMs);
  });

  it('zampata con il tubo già a terra: troppo tardi, 0 punti', () => {
    const m = match();
    toDrop(m);
    const t = m.restTime(0) + 50;
    m.advanceTo(t + 1, [{ player: 0, t }]);
    expect(m.cuts[0]!.whiff).toBe('late');
    expect(m.scores[0]).toBe(0);
  });

  it('nessuna scorciatoia: appena prima dell’atterraggio o sull’estremità si prende 0', () => {
    const g = T.geometry;
    for (const mark of [g.markMin, g.markMax]) {
      // Distanza minima possibile all'atterraggio e all'arrivo del fondo del tubo.
      expect(Math.abs(g.cutY - mark)).toBeGreaterThan(T.scoring[T.scoring.length - 1].maxDist);
      expect(Math.abs(mark)).toBeGreaterThanOrEqual(g.markMin);
    }
    expect(g.markMin).toBeGreaterThan(T.scoring[T.scoring.length - 1].maxDist * 0.85);
  });
});

describe('fine partita', () => {
  function playAll(m: GraffioMatch, offsetMs: (p: number, round: number) => number) {
    for (let guard = 0; m.phase !== 'final' && guard < 200_000; guard++) {
      const now = guard * 10;
      const presses: GraffioPress[] = [];
      if (m.phase === 'drop') {
        for (let p = 0; p < 4; p++) {
          if (!m.hasCut(p)) presses.push({ player: p, t: m.crossTime(p) + offsetMs(p, m.round) });
        }
      }
      m.advanceTo(
        now,
        presses.filter((x) => x.t <= now),
      );
    }
  }

  it('vince chi ha più punti', () => {
    const m = match(3, 7);
    playAll(m, (p) => (p === 2 ? 0 : 400 + p * 50));
    expect(m.phase).toBe('final');
    expect(m.winners).toEqual([2]);
    expect(m.standings![0]).toBe(2);
    expect(m.scores[2]).toBe(30);
  });

  it('a pari punti vince chi ha lo scarto totale minore', () => {
    const m = match(3, 7);
    // Tutti fuori tacca di tanto (0 punti), ma il gatto 1 meno degli altri.
    playAll(m, (p) => (p === 1 ? 700 : 1200));
    expect(m.scores.every((s) => s === m.scores[0])).toBe(true);
    expect(m.winners).toEqual([1]);
  });

  it('pari anche nello scarto: vittoria condivisa', () => {
    const m = match(3, 7, 2);
    for (let guard = 0; m.phase !== 'final' && guard < 200_000; guard++) {
      const now = guard * 10;
      const presses: GraffioPress[] = [];
      if (m.phase === 'drop') {
        for (let p = 0; p < 2; p++) {
          if (!m.hasCut(p)) presses.push({ player: p, t: m.crossTime(p) });
        }
      }
      m.advanceTo(
        now,
        presses.filter((x) => x.t <= now),
      );
    }
    expect(m.winners.sort()).toEqual([0, 1]);
  });
});

describe('CPU', () => {
  function cpuMatch(sd: number, seed: number) {
    const m = match(5, seed, 2);
    const cpu = new GraffioCpu(0, { sdMs: sd, missChance: 0 }, new Rng(seed + 1));
    for (let guard = 0; m.phase !== 'final' && guard < 200_000; guard++) {
      const now = guard * 10;
      m.advanceTo(now, cpu.drain(m, now));
    }
    return m;
  }

  it('la CPU precisa fa quasi sempre punti alti', () => {
    const m = cpuMatch(5, 3);
    expect(m.scores[0]).toBeGreaterThanOrEqual(40);
  });

  it('la CPU imprecisa fa meno punti di quella precisa (media su più partite)', () => {
    const avg = (sd: number) => {
      let s = 0;
      for (let seed = 1; seed <= 12; seed++) s += cpuMatch(sd, seed).scores[0];
      return s / 12;
    };
    expect(avg(10)).toBeGreaterThan(avg(150));
  });

  it('con missChance 1 non taglia mai', () => {
    const m = match(2, 5, 2);
    const cpu = new GraffioCpu(0, { sdMs: 10, missChance: 1 }, new Rng(1));
    for (let guard = 0; m.phase !== 'final' && guard < 100_000; guard++) {
      const now = guard * 10;
      m.advanceTo(now, cpu.drain(m, now));
    }
    expect(m.scores[0]).toBe(0);
  });
});
