import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { MatchMachine, type MatchConfig, type RoundEvent } from '../src/core/MatchMachine';

const noFakes = {
  maxPerRound: 0,
  baseChance: 0,
  chancePerRound: 0,
  durationMs: 450,
  minGapMs: 700,
  marginStartMs: 600,
  marginEndMs: 800,
};

const TONNO = { id: 'tonno', points: 2, weight: 1 };
const POOP = { id: 'cacchetta', points: 0, weight: 1 };

const config: MatchConfig = {
  playerCount: 4,
  roundCount: 5,
  introMs: 1000,
  circlingMinMs: 3000,
  circlingMaxMs: 3000, // durata fissa per test prevedibili
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

const poopConfig: MatchConfig = { ...config, contents: [POOP] };

/** Porta la macchina al reveal: coperchio a schermo all'istante 4010. */
function atReveal(cfg: MatchConfig = config) {
  const m = new MatchMachine(cfg, new Rng(1), 0);
  m.advanceTo(4000); // intro 0-1000, circling 1000-4000
  expect(m.phase).toBe('dash');
  m.markRevealShown(4010);
  return m;
}

/** Gioca un round intero: `presses` = [giocatore, ms dopo il reveal]. */
function playRound(m: MatchMachine, presses: [number, number][] = []): void {
  expect(m.phase).toBe('intro');
  m.advanceTo(m.phaseEndsAt()); // → circling
  m.advanceTo(m.phaseEndsAt()); // → dash
  const shown = m.phaseStart + 10;
  m.markRevealShown(shown);
  for (const [p, r] of presses) m.input(p, 'dash', shown + r);
  while (m.phase !== 'intro' && m.phase !== 'final') m.advanceTo(m.phaseEndsAt());
}

const ofType = <T extends RoundEvent['type']>(events: RoundEvent[], type: T) =>
  events.filter((e): e is Extract<RoundEvent, { type: T }> => e.type === type);

describe('MatchMachine — round base', () => {
  it('attraversa le fasi in ordine con i tempi configurati', () => {
    const m = new MatchMachine(config, new Rng(1), 0);
    expect(m.phase).toBe('intro');
    m.advanceTo(999);
    expect(m.phase).toBe('intro');
    m.advanceTo(1000);
    expect(m.phase).toBe('circling');
    m.advanceTo(4000);
    expect(m.phase).toBe('dash');
  });

  it('la finestra di scatto aspetta che il coperchio sia a schermo', () => {
    const m = new MatchMachine(config, new Rng(1), 0);
    m.advanceTo(100_000);
    expect(m.phase).toBe('dash');
    m.markRevealShown(100_000);
    m.advanceTo(101_499);
    expect(m.phase).toBe('dash');
    m.advanceTo(101_500);
    expect(m.phase).toBe('resolve');
  });

  it('misura la reazione dal frame di reveal e premia il più veloce', () => {
    const m = atReveal();
    m.input(2, 'dash', 4300);
    m.input(0, 'dash', 4200);
    m.advanceTo(6000);
    expect(m.players[0].reactionMs).toBe(190);
    expect(m.lastResult?.winners).toEqual([0]);
    expect(m.scores).toEqual([2, 0, 0, 0]);
  });

  it('pareggio entro la soglia: porzione spartita', () => {
    const m = atReveal();
    m.input(1, 'dash', 4200); // 190
    m.input(3, 'dash', 4220); // 210 → entro 30 ms
    m.input(0, 'dash', 4250); // 240 → fuori
    m.advanceTo(6000);
    expect(m.lastResult?.winners).toEqual([1, 3]);
    expect(m.scores).toEqual([0, 1, 0, 1]);
  });

  it('nessuno scatta: nessun punto', () => {
    const m = atReveal();
    m.advanceTo(6000);
    expect(m.lastResult?.winners).toEqual([]);
    expect(m.scores).toEqual([0, 0, 0, 0]);
  });

  it('chiude subito il round quando tutti hanno scattato', () => {
    const m = atReveal();
    [0, 1, 2, 3].forEach((p, i) => m.input(p, 'dash', 4100 + i * 50));
    expect(m.phase).toBe('resolve');
    expect(m.phaseStart).toBe(4250);
  });

  it('falsa partenza: stordito 1.5 s, poi può scattare di nuovo', () => {
    const m = new MatchMachine(config, new Rng(1), 0);
    m.input(0, 'dash', 3000); // durante circling
    expect(m.players[0].stunnedUntil).toBe(4500);
    expect(ofType(m.drainEvents(), 'falseStart')).toHaveLength(1);

    m.advanceTo(4000);
    m.markRevealShown(4010);
    m.input(0, 'dash', 4100); // ancora stordito: ignorato
    expect(m.players[0].reactionMs).toBeNull();
    m.input(0, 'dash', 4600); // stordimento finito
    expect(m.players[0].reactionMs).toBe(590);
  });

  it('premere prima che il coperchio sia a schermo è falsa partenza', () => {
    const m = new MatchMachine(config, new Rng(1), 0);
    m.input(1, 'dash', 4005); // fase dash ma coperchio non ancora visibile
    expect(m.players[1].stunnedUntil).toBe(5505);
    m.markRevealShown(4010);
    m.input(2, 'dash', 4008); // timestamp precedente al frame di reveal
    expect(m.players[2].stunnedUntil).toBe(5508);
  });

  it('ignora pressioni durante intro e un secondo scatto', () => {
    const m = new MatchMachine(config, new Rng(1), 0);
    m.input(0, 'dash', 500);
    expect(m.players[0].stunnedUntil).toBe(-Infinity);
    m.advanceTo(4000);
    m.markRevealShown(4010);
    m.input(0, 'dash', 4200);
    m.input(0, 'dash', 4210);
    expect(m.players[0].reactionMs).toBe(190);
  });
});

describe('MatchMachine — partita', () => {
  it('dopo 5 round con un leader unico: classifica finale', () => {
    const m = new MatchMachine(config, new Rng(1), 0);
    playRound(m, [[0, 200]]);
    playRound(m, [[1, 200]]);
    playRound(m, [[0, 200]]);
    playRound(m, [[2, 200]]);
    expect(m.round).toBe(5);
    playRound(m, [[0, 200]]);
    expect(m.phase).toBe('final');
    expect(m.scores).toEqual([6, 2, 2, 0]);
    expect(m.standings).toEqual([0, 1, 2, 3]);
    m.advanceTo(1e9); // resta in final
    expect(m.phase).toBe('final');
  });

  it('parità in testa dopo 5 round: spareggio solo tra i leader', () => {
    const m = new MatchMachine(config, new Rng(1), 0);
    playRound(m, [[0, 200]]);
    playRound(m, [[3, 200]]);
    playRound(m);
    playRound(m);
    playRound(m);
    expect(m.scores).toEqual([2, 0, 0, 2]);
    expect(m.phase).toBe('intro');
    expect(m.round).toBe(6);
    expect(m.suddenDeath).toBe(true);
    expect(m.players.map((p) => p.active)).toEqual([true, false, false, true]);

    // Il giocatore 1 non è in spareggio: la sua pressione non conta.
    playRound(m, [
      [1, 100],
      [3, 250],
    ]);
    expect(m.lastResult?.winners).toEqual([3]);
    expect(m.phase).toBe('final');
    expect(m.standings?.[0]).toBe(3);
  });

  it('lo spareggio continua finché la parità non si rompe', () => {
    const m = new MatchMachine(config, new Rng(1), 0);
    for (let i = 0; i < 5; i++) playRound(m);
    expect(m.suddenDeath).toBe(true); // tutti a 0: spareggio a 4
    playRound(m); // nessuno scatta
    expect(m.phase).toBe('intro');
    expect(m.round).toBe(7);
    playRound(m, [[2, 300]]);
    expect(m.phase).toBe('final');
    expect(m.standings?.[0]).toBe(2);
  });
});

describe('MatchMachine — cacchetta', () => {
  it('chi scatta sulla cacchetta non prende punti e salta il round successivo', () => {
    const m = atReveal(poopConfig);
    m.input(1, 'dash', 4200);
    const events = m.drainEvents();
    expect(ofType(events, 'poop')).toEqual([{ type: 'poop', player: 1, t: 4200, reactionMs: 190 }]);
    expect(ofType(events, 'dash')).toHaveLength(0);
    m.advanceTo(m.phaseEndsAt()); // → resolve
    expect(m.lastResult?.winners).toEqual([]);
    expect(m.lastResult?.poopVictims).toEqual([1]);
    expect(m.lastResult?.poopSkipsNext).toBe(true);
    expect(m.scores).toEqual([0, 0, 0, 0]);

    while (m.phase !== 'intro') m.advanceTo(m.phaseEndsAt());
    expect(m.round).toBe(2);
    expect(m.players.map((p) => p.active)).toEqual([true, false, true, true]);
    m.advanceTo(m.phaseEndsAt());
    m.input(1, 'dash', m.phaseStart + 100); // in panchina: nemmeno falsa partenza
    expect(m.players[1].stunnedUntil).toBe(-Infinity);

    playRoundFrom(m);
    expect(m.round).toBe(3);
    expect(m.players[1].active).toBe(true);
  });

  it('il round si chiude quando hanno scattato tutti i gatti in gioco', () => {
    const m = atReveal(poopConfig);
    m.input(0, 'dash', 4100);
    while (m.phase !== 'intro') m.advanceTo(m.phaseEndsAt());
    m.advanceTo(m.phaseEndsAt());
    m.advanceTo(m.phaseEndsAt());
    m.markRevealShown(m.phaseStart);
    [1, 2, 3].forEach((p) => m.input(p, 'dash', m.phaseStart + 100 + p));
    expect(m.phase).toBe('resolve');
  });

  it("all'ultimo round regolare la cacchetta costa 1 punto", () => {
    const m = new MatchMachine(poopConfig, new Rng(1), 0);
    for (let i = 0; i < 4; i++) playRound(m);
    expect(m.round).toBe(5);
    m.advanceTo(m.phaseEndsAt());
    m.advanceTo(m.phaseEndsAt());
    m.markRevealShown(m.phaseStart);
    m.input(2, 'dash', m.phaseStart + 300);
    m.advanceTo(m.phaseEndsAt());
    expect(m.lastResult?.poopSkipsNext).toBe(false);
    expect(m.scores).toEqual([0, 0, -1, 0]);
  });
});

/** Completa il round corrente da qualunque fase, senza pressioni. */
function playRoundFrom(m: MatchMachine): void {
  const round = m.round;
  while (m.round === round && m.phase !== 'final') {
    if (m.phase === 'dash' && m.revealShownAt === null) m.markRevealShown(m.phaseStart);
    m.advanceTo(m.phaseEndsAt());
  }
}

describe('MatchMachine — finte', () => {
  it('finta di scatto: solo durante il giro, con cooldown, senza stordimento', () => {
    const m = new MatchMachine(config, new Rng(1), 0);
    m.input(0, 'fake', 500); // intro: ignorata
    m.input(0, 'fake', 1500);
    m.input(0, 'fake', 2000); // cooldown
    m.input(1, 'fake', 2000);
    m.input(0, 'fake', 2600);
    const fakes = ofType(m.drainEvents(), 'fakeDash');
    expect(fakes.map((f) => [f.player, f.t])).toEqual([
      [0, 1500],
      [1, 2000],
      [0, 2600],
    ]);
    expect(m.players[0].stunnedUntil).toBe(-Infinity);

    m.advanceTo(4000);
    m.markRevealShown(4010);
    m.input(0, 'fake', 4100); // a coperchio aperto la finta non serve
    expect(ofType(m.drainEvents(), 'fakeDash')).toHaveLength(0);
  });

  it('chi è stordito non può fingere', () => {
    const m = new MatchMachine(config, new Rng(1), 0);
    m.input(0, 'dash', 1200); // falsa partenza → stordito fino a 2700
    m.input(0, 'fake', 2000);
    m.input(0, 'fake', 2800);
    expect(ofType(m.drainEvents(), 'fakeDash').map((f) => f.t)).toEqual([2800]);
  });

  it('finte del coperchio: emesse in ordine durante il giro, mai dopo il reveal', () => {
    const cfg: MatchConfig = {
      ...config,
      circlingMinMs: 6000,
      circlingMaxMs: 6000,
      fakeLid: { ...noFakes, maxPerRound: 2, baseChance: 1 },
    };
    const m = new MatchMachine(cfg, new Rng(3), 0);
    m.advanceTo(6999);
    const fakes = ofType(m.drainEvents(), 'fakeLid');
    expect(fakes.length).toBeGreaterThanOrEqual(1);
    for (const f of fakes) {
      expect(f.t).toBeGreaterThanOrEqual(1000 + 600);
      expect(f.t + f.durationMs).toBeLessThanOrEqual(7000 - 800);
    }
    expect([...fakes].sort((a, b) => a.t - b.t)).toEqual(fakes);
    m.advanceTo(7000);
    expect(m.phase).toBe('dash');
    expect(ofType(m.drainEvents(), 'fakeLid')).toHaveLength(0);
  });

  it('la finta del coperchio non apre la finestra di scatto', () => {
    const cfg: MatchConfig = { ...config, fakeLid: { ...noFakes, maxPerRound: 1, baseChance: 1 } };
    const m = new MatchMachine(cfg, new Rng(5), 0);
    m.advanceTo(3999);
    const [fake] = ofType(m.drainEvents(), 'fakeLid');
    expect(fake).toBeDefined();
    m.input(0, 'dash', fake.t + 100); // abbocca alla finta
    expect(m.players[0].stunnedUntil).toBe(fake.t + 1600);
  });
});

describe('MatchMachine — determinismo', () => {
  it('stesso seed = stessa partita', () => {
    const cfg: MatchConfig = {
      ...config,
      circlingMaxMs: 7000,
      fakeLid: { ...noFakes, maxPerRound: 2, baseChance: 0.5 },
      contents: [TONNO, { id: 'salmone', points: 3, weight: 1 }, POOP],
    };
    const run = () => {
      const m = new MatchMachine(cfg, new Rng(42), 0);
      const log: string[] = [];
      for (let i = 0; i < 5; i++) {
        log.push(m.content.id);
        playRound(m, [[i % 4, 200]]);
        log.push(...m.drainEvents().map((e) => `${e.type}@${e.t}`));
      }
      return log;
    };
    expect(run()).toEqual(run());
  });
});
