import { describe, expect, it } from 'vitest';
import type { AudioOut, Mood, SfxName } from '../src/audio/AudioEngine';
import { GameAudio } from '../src/audio/GameAudio';
import { LOOP_STEPS, musicTempo, noteToFreq, notesAt } from '../src/audio/notes';
import { MatchMachine, type MatchConfig } from '../src/core/MatchMachine';
import { Rng } from '../src/core/Rng';

describe('note', () => {
  it('converte le note in frequenze', () => {
    expect(noteToFreq('A4')).toBeCloseTo(440);
    expect(noteToFreq('A5')).toBeCloseTo(880);
    expect(noteToFreq('C4')).toBeCloseTo(261.63, 1);
    expect(noteToFreq('C#5')).toBeCloseTo(554.37, 1);
    expect(() => noteToFreq('H2')).toThrow();
  });

  it('lo spartito è valido in ogni croma e in loop', () => {
    for (let s = 0; s < LOOP_STEPS; s++) {
      const n = notesAt(s);
      expect(() => noteToFreq(n.bass)).not.toThrow();
      if (n.lead) {
        expect(() => noteToFreq(n.lead!.note)).not.toThrow();
        expect(n.lead.steps).toBeGreaterThanOrEqual(1);
      }
      expect(notesAt(s + LOOP_STEPS)).toEqual(n);
    }
    expect(notesAt(0).lead).toEqual({ note: 'C5', steps: 1 });
    expect(notesAt(6).lead).toEqual({ note: 'E5', steps: 2 }); // prolungata da "-"
    expect(notesAt(7).lead).toBeNull();
  });

  it('il tempo accelera nei round e nello spareggio', () => {
    expect(musicTempo(1, false)).toBeLessThan(musicTempo(5, false));
    expect(musicTempo(9, false)).toBe(musicTempo(5, false));
    expect(musicTempo(6, true)).toBeGreaterThan(musicTempo(5, false));
  });
});

/** Registra le chiamate audio invece di suonare. */
class FakeAudio implements AudioOut {
  log: string[] = [];
  startMusic(bpm: number) {
    this.log.push(`music:start:${bpm}`);
  }
  stopMusic() {
    this.log.push('music:stop');
  }
  hiccupMusic() {
    this.log.push('music:hiccup');
  }
  sfx(name: SfxName, player?: number) {
    this.log.push(player === undefined ? `sfx:${name}` : `sfx:${name}:${player}`);
  }
  meow(player: number, mood: Mood) {
    this.log.push(`meow:${player}:${mood}`);
  }
}

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
  fakeLid: {
    maxPerRound: 1,
    baseChance: 1,
    chancePerRound: 0,
    durationMs: 450,
    minGapMs: 700,
    marginStartMs: 600,
    marginEndMs: 800,
  },
  contents: [{ id: 'tonno', points: 2, weight: 1 }],
  poopId: 'cacchetta',
  lastRoundPoopPenalty: -1,
};

function run(cfg: MatchConfig, hiccup: boolean, play: (m: MatchMachine) => void) {
  const out = new FakeAudio();
  const audio = new GameAudio(out, { hiccupOnFakeLid: hiccup });
  const m = new MatchMachine(cfg, new Rng(1), 0);
  const flush = () => m.drainEvents().forEach((e) => audio.onEvent(e, m));
  flush();
  play(m);
  flush();
  return out.log;
}

describe('GameAudio', () => {
  it('la musica parte nel giro, NON si ferma alla finta del coperchio, si ferma al reveal', () => {
    const log = run(config, false, (m) => {
      m.advanceTo(3999);
    });
    expect(log).toEqual(['music:stop', 'sfx:roundStart', 'music:start:132', 'sfx:lidFake']);

    const log2 = run(config, false, (m) => m.advanceTo(4000));
    expect(log2.slice(-2)).toEqual(['music:stop', 'sfx:lidOpen']);
  });

  it('a difficoltà alta la finta del coperchio fa singhiozzare la musica', () => {
    const log = run(config, true, (m) => m.advanceTo(3999));
    expect(log).toContain('music:hiccup');
  });

  it('suoni di scatto, vittoria e falsa partenza', () => {
    const log = run({ ...config, fakeLid: { ...config.fakeLid, maxPerRound: 0 } }, false, (m) => {
      m.input(2, 'dash', 2000); // falsa partenza
      m.input(1, 'fake', 2500);
      m.advanceTo(4000);
      m.markRevealShown(4010);
      m.input(0, 'dash', 4200);
      m.advanceTo(6000);
    });
    expect(log).toEqual(
      expect.arrayContaining([
        'sfx:dash:2',
        'sfx:bonk:2',
        'meow:2:annoyed',
        'sfx:fakeDash:1',
        'sfx:dash:0',
        'sfx:eat',
        'meow:0:happy',
      ]),
    );
  });

  it('cacchetta: "blegh" e miagolio triste; nessuno ci casca: sospiro di sollievo', () => {
    const poop = { ...config, contents: [{ id: 'cacchetta', points: 0, weight: 1 }] };
    const victim = run(poop, false, (m) => {
      m.advanceTo(4000);
      m.markRevealShown(4000);
      m.input(3, 'dash', 4300);
      m.advanceTo(6000);
    });
    expect(victim).toEqual(expect.arrayContaining(['sfx:poop:3', 'meow:3:sad']));

    const dodged = run(poop, false, (m) => {
      m.advanceTo(4000);
      m.markRevealShown(4000);
      m.advanceTo(6000);
    });
    expect(dodged).toContain('sfx:phew');
  });

  it('ultimo round con jingle speciale, fanfara finale', () => {
    const cfg = { ...config, roundCount: 1, fakeLid: { ...config.fakeLid, maxPerRound: 0 } };
    const log = run(cfg, false, (m) => {
      m.advanceTo(4000);
      m.markRevealShown(4000);
      m.input(1, 'dash', 4250);
      m.advanceTo(20_000);
    });
    expect(log[1]).toBe('sfx:roundStartFinal');
    expect(log.slice(-3)).toEqual(['music:stop', 'sfx:fanfare', 'meow:1:happy']);
  });
});
