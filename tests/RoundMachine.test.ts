import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { RoundMachine, type RoundConfig } from '../src/core/RoundMachine';

const config: RoundConfig = {
  playerCount: 4,
  introMs: 1000,
  circlingMinMs: 3000,
  circlingMaxMs: 3000, // durata fissa per test prevedibili
  revealWindowMs: 1500,
  resolveMs: 2000,
  endMs: 1000,
  tieThresholdMs: 30,
  stunMs: 1500,
  contents: [{ id: 'tonno', points: 2, weight: 1 }],
};

/** Porta la macchina al reveal: coperchio a schermo all'istante 4010. */
function atReveal(cfg: RoundConfig = config) {
  const m = new RoundMachine(cfg, new Rng(1), 0);
  m.advanceTo(4000); // intro 0-1000, circling 1000-4000
  expect(m.phase).toBe('dash');
  m.markRevealShown(4010);
  return m;
}

describe('RoundMachine', () => {
  it('attraversa le fasi in ordine con i tempi configurati', () => {
    const m = new RoundMachine(config, new Rng(1), 0);
    expect(m.phase).toBe('intro');
    m.advanceTo(999);
    expect(m.phase).toBe('intro');
    m.advanceTo(1000);
    expect(m.phase).toBe('circling');
    m.advanceTo(4000);
    expect(m.phase).toBe('dash');
  });

  it('la finestra di scatto aspetta che il coperchio sia a schermo', () => {
    const m = new RoundMachine(config, new Rng(1), 0);
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
    const m = new RoundMachine(config, new Rng(1), 0);
    m.input(0, 'dash', 3000); // durante circling
    expect(m.players[0].stunnedUntil).toBe(4500);
    expect(m.drainEvents().some((e) => e.type === 'falseStart')).toBe(true);

    m.advanceTo(4000);
    m.markRevealShown(4010);
    m.input(0, 'dash', 4100); // ancora stordito: ignorato
    expect(m.players[0].reactionMs).toBeNull();
    m.input(0, 'dash', 4600); // stordimento finito
    expect(m.players[0].reactionMs).toBe(590);
  });

  it('premere prima che il coperchio sia a schermo è falsa partenza', () => {
    const m = new RoundMachine(config, new Rng(1), 0);
    m.input(1, 'dash', 4005); // fase dash ma coperchio non ancora visibile
    expect(m.players[1].stunnedUntil).toBe(5505);
    m.markRevealShown(4010);
    m.input(2, 'dash', 4008); // timestamp precedente al frame di reveal
    expect(m.players[2].stunnedUntil).toBe(5508);
  });

  it('ignora pressioni durante intro e un secondo scatto', () => {
    const m = new RoundMachine(config, new Rng(1), 0);
    m.input(0, 'dash', 500);
    expect(m.players[0].stunnedUntil).toBe(-Infinity);
    m.advanceTo(4000);
    m.markRevealShown(4010);
    m.input(0, 'dash', 4200);
    m.input(0, 'dash', 4210);
    expect(m.players[0].reactionMs).toBe(190);
  });

  it('dopo la fine il round successivo riparte pulito, punteggi conservati', () => {
    const m = atReveal();
    m.input(0, 'dash', 4200);
    m.advanceTo(5510 + 2000 + 1000); // fine finestra + resolve + end
    expect(m.round).toBe(2);
    expect(m.phase).toBe('intro');
    expect(m.players[0].reactionMs).toBeNull();
    expect(m.revealShownAt).toBeNull();
    expect(m.scores[0]).toBe(2);
  });

  it('stesso seed = stessa sequenza di round', () => {
    const cfg = {
      ...config,
      circlingMaxMs: 7000,
      contents: [
        { id: 'a', points: 1, weight: 1 },
        { id: 'b', points: 2, weight: 1 },
      ],
    };
    const run = () => {
      const m = new RoundMachine(cfg, new Rng(42), 0);
      const seen: string[] = [];
      for (let round = 1; round <= 5; round++) {
        expect(m.round).toBe(round);
        expect(m.phase).toBe('intro');
        seen.push(m.content.id);
        m.advanceTo(m.phaseEndsAt()); // → circling
        seen.push(String(m.phaseEndsAt()));
        m.advanceTo(m.phaseEndsAt()); // → dash
        m.markRevealShown(m.phaseStart);
        m.advanceTo(m.phaseEndsAt()); // → resolve
        m.advanceTo(m.phaseEndsAt()); // → end
        m.advanceTo(m.phaseEndsAt()); // → intro del round successivo
      }
      return seen;
    };
    expect(run()).toEqual(run());
  });
});

describe('Rng', () => {
  it('pickWeighted rispetta i pesi (circa)', () => {
    const rng = new Rng(7);
    const items = [
      { id: 'x', weight: 3 },
      { id: 'y', weight: 1 },
    ];
    let x = 0;
    for (let i = 0; i < 4000; i++) if (rng.pickWeighted(items).id === 'x') x++;
    expect(x / 4000).toBeGreaterThan(0.7);
    expect(x / 4000).toBeLessThan(0.8);
  });
});
