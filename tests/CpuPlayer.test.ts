import { describe, expect, it } from 'vitest';
import { CpuPlayer, type CpuProfile } from '../src/ai/CpuPlayer';
import { tuning, type Difficulty } from '../src/config/tuning';
import { createMatchConfig } from '../src/core/matchConfig';
import { MatchMachine, type MatchConfig, type RoundEvent } from '../src/core/MatchMachine';
import { Rng } from '../src/core/Rng';
import { MatchDriver } from '../src/game/MatchDriver';

const TONNO = { id: 'tonno', points: 2, weight: 1 };
const POOP = { id: 'cacchetta', points: 0, weight: 1 };
const noFakes = {
  maxPerRound: 0,
  baseChance: 0,
  chancePerRound: 0,
  durationMs: 450,
  minGapMs: 700,
  marginStartMs: 600,
  marginEndMs: 800,
};

const config: MatchConfig = {
  playerCount: 4,
  roundCount: 5,
  introMs: 1000,
  circlingMinMs: 3000,
  circlingMaxMs: 3000,
  revealWindowMs: 1500,
  resolveMs: 2000,
  endMs: 1000,
  tieThresholdMs: 30,
  stunMs: 1500,
  fakeDashCooldownMs: 1000,
  fakeLid: noFakes,
  contents: [TONNO],
  poopId: 'cacchetta',
  lastRoundPoopPenalty: -1,
};

/** CPU "di laboratorio": reazione fissa, mai ingannata, non finge. */
const steady: CpuProfile = {
  reactionMeanMs: 300,
  reactionSdMs: 0,
  fooledByLid: 0,
  fooledByFakeDash: 0,
  recognizesPoop: 1,
  fakeDashChance: 0,
};

const FRAME_MS = 1000 / 60;

/** Simula frame a 60 Hz fino a `until` (o a fine partita). */
function simulate(
  driver: MatchDriver,
  opts: {
    until?: (m: MatchMachine) => boolean;
    start?: number;
    maxMs?: number;
    humans?: (now: number) => { player: number; action: 'dash' | 'fake'; t: number }[];
  } = {},
) {
  const m = driver.machine;
  const events: RoundEvent[] = [];
  let now = opts.start ?? 0;
  const end = now + (opts.maxMs ?? 600_000);
  while (now < end && m.phase !== 'final' && !opts.until?.(m)) {
    now += FRAME_MS;
    events.push(...driver.step(now, opts.humans?.(now) ?? []));
    driver.afterRender(now, m.phase === 'dash');
  }
  return { events, now };
}

const cpu = (player: number, profile: CpuProfile, seed = player + 1) =>
  new CpuPlayer(player, profile, new Rng(seed));

const eventsOf = <T extends RoundEvent['type']>(events: RoundEvent[], type: T, player?: number) =>
  events.filter(
    (e): e is Extract<RoundEvent, { type: T }> =>
      e.type === type && (player === undefined || ('player' in e && e.player === player)),
  );

describe('CpuPlayer', () => {
  it('scatta esattamente dopo il suo tempo di reazione dal reveal', () => {
    const m = new MatchMachine(config, new Rng(1), 0);
    const d = new MatchDriver(m, [cpu(1, steady)]);
    const { events } = simulate(d, { until: (mm) => mm.phase === 'resolve' });
    expect(eventsOf(events, 'dash', 1).map((e) => e.reactionMs)).toEqual([300]);
    expect(m.lastResult?.winners).toEqual([1]);
  });

  it('senza finte né inganni non fa mai false partenze', () => {
    const cfg = { ...config, fakeLid: { ...noFakes, maxPerRound: 2, baseChance: 1 } };
    const m = new MatchMachine(cfg, new Rng(2), 0);
    const d = new MatchDriver(
      m,
      [0, 1, 2, 3].map((p) => cpu(p, { ...steady, reactionMeanMs: 250 + p * 50 })),
    );
    const { events } = simulate(d);
    expect(eventsOf(events, 'fakeLid').length).toBeGreaterThan(0);
    expect(eventsOf(events, 'falseStart')).toHaveLength(0);
    expect(m.phase).toBe('final');
  });

  it('abbocca alle finte del coperchio secondo il profilo', () => {
    const cfg = {
      ...config,
      circlingMinMs: 6000,
      circlingMaxMs: 6000,
      fakeLid: { ...noFakes, maxPerRound: 1, baseChance: 1 },
    };
    const m = new MatchMachine(cfg, new Rng(3), 0);
    const d = new MatchDriver(m, [cpu(2, { ...steady, fooledByLid: 1 })]);
    const { events } = simulate(d, { until: (mm) => mm.phase === 'resolve' });
    const [fake] = eventsOf(events, 'fakeLid');
    const [bonk] = eventsOf(events, 'falseStart', 2);
    expect(bonk.t).toBeCloseTo(fake.t + 300);
    // Dopo lo stordimento riprova comunque sul reveal vero.
    expect(eventsOf(events, 'dash', 2)).toHaveLength(1);
  });

  it('abbocca alla finta di un avversario, non alla propria', () => {
    const m = new MatchMachine(config, new Rng(4), 0);
    const fooled = cpu(1, { ...steady, fooledByFakeDash: 1 });
    const faker = cpu(2, { ...steady, fooledByFakeDash: 1, fakeDashChance: 1 });
    const d = new MatchDriver(m, [fooled, faker]);
    const { events } = simulate(d, { until: (mm) => mm.phase === 'dash' });
    const fakes = eventsOf(events, 'fakeDash', 2);
    expect(fakes).toHaveLength(1);
    expect(eventsOf(events, 'falseStart', 1).map((e) => e.t)).toEqual([fakes[0].t + 300]);
    expect(eventsOf(events, 'falseStart', 2)).toHaveLength(0);
  });

  it('una finta umana inganna la CPU', () => {
    const m = new MatchMachine(config, new Rng(5), 0);
    const d = new MatchDriver(m, [cpu(3, { ...steady, fooledByFakeDash: 1 })]);
    let sent = false;
    const { events } = simulate(d, {
      until: (mm) => mm.phase === 'dash',
      humans: (now) => {
        if (sent || now < 2000) return [];
        sent = true;
        return [{ player: 0, action: 'fake', t: now }];
      },
    });
    expect(eventsOf(events, 'falseStart', 3)).toHaveLength(1);
  });

  it('riconosce la cacchetta (o ci casca) secondo il profilo', () => {
    const run = (recognizesPoop: number) => {
      const m = new MatchMachine({ ...config, contents: [POOP] }, new Rng(6), 0);
      const d = new MatchDriver(m, [cpu(0, { ...steady, recognizesPoop })]);
      return simulate(d, { until: (mm) => mm.phase === 'resolve' }).events;
    };
    expect(eventsOf(run(1), 'poop')).toHaveLength(0);
    expect(eventsOf(run(0), 'poop', 0)).toHaveLength(1);
  });

  it('in panchina non fa nulla', () => {
    const m = new MatchMachine({ ...config, contents: [POOP] }, new Rng(7), 0);
    const d = new MatchDriver(m, [cpu(0, { ...steady, recognizesPoop: 0, fakeDashChance: 1 })]);
    simulate(d, { until: (mm) => mm.round === 2 });
    expect(m.players[0].active).toBe(false);
    const { events } = simulate(d, { start: m.phaseStart, until: (mm) => mm.round === 3 });
    expect(events.filter((e) => 'player' in e && e.player === 0)).toHaveLength(0);
  });

  it('se è stordito al reveal, scatta appena lo stordimento finisce', () => {
    const m = new MatchMachine(config, new Rng(8), 0);
    const d = new MatchDriver(m, [cpu(1, steady)]);
    m.input(1, 'dash', 3500); // falsa partenza forzata: stordito fino a 5000
    const { events } = simulate(d, { until: (mm) => mm.phase === 'resolve' });
    const [dash] = eventsOf(events, 'dash', 1);
    expect(dash.t).toBeCloseTo(5000 + 120);
  });

  it('il driver ignora i tasti umani sugli slot CPU', () => {
    const m = new MatchMachine(config, new Rng(9), 0);
    const d = new MatchDriver(m, [cpu(1, steady)]);
    d.step(2000, [{ player: 1, action: 'dash', t: 2000 }]);
    expect(m.players[1].stunnedUntil).toBe(-Infinity);
  });

  it('tempi di reazione distribuiti attorno alla media del profilo', () => {
    const profile = {
      ...tuning.cpu.normale,
      fooledByLid: 0,
      fooledByFakeDash: 0,
      fakeDashChance: 0,
    };
    const m = new MatchMachine({ ...config, roundCount: 300 }, new Rng(10), 0);
    const d = new MatchDriver(m, [cpu(0, profile, 99)]);
    const { events } = simulate(d, { maxMs: 10_000_000 });
    const times = eventsOf(events, 'dash', 0).map((e) => e.reactionMs);
    expect(times.length).toBeGreaterThan(250);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    expect(mean).toBeGreaterThan(profile.reactionMeanMs - 15);
    expect(mean).toBeLessThan(profile.reactionMeanMs + 15);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(140);
  });
});

describe('bilanciamento CPU', () => {
  it('a parità di condizioni la difficoltà più alta vince più spesso', () => {
    const lineup: Difficulty[] = ['facile', 'normale', 'difficile', 'facile'];
    const wins = [0, 0, 0, 0];
    for (let match = 0; match < 80; match++) {
      const m = new MatchMachine(createMatchConfig(4), new Rng(1000 + match), 0);
      const cpus = lineup.map((diff, p) => cpu(p, tuning.cpu[diff], match * 10 + p));
      simulate(new MatchDriver(m, cpus));
      expect(m.phase).toBe('final');
      wins[m.standings![0]]++;
    }
    const facile = (wins[0] + wins[3]) / 2;
    expect(wins[2]).toBeGreaterThan(wins[1]);
    expect(wins[1]).toBeGreaterThan(facile);
  });
});
