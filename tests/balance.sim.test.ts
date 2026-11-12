import { describe, it } from 'vitest';

// Variabili d'ambiente di Node (npm imposta npm_lifecycle_event = nome dello script).
declare const process: { env: Record<string, string | undefined> };
import { CpuPlayer, type CpuProfile } from '../src/ai/CpuPlayer';
import { tuning, type Difficulty } from '../src/config/tuning';
import { createMatchConfig } from '../src/core/matchConfig';
import { MatchMachine } from '../src/core/MatchMachine';
import { Rng } from '../src/core/Rng';
import { MatchDriver } from '../src/game/MatchDriver';

/**
 * Simulazione di bilanciamento: `npm run balance` (non gira con `npm test`).
 * L'"umano simulato" reagisce in media in 290 ms (reazione visiva + ritardo di
 * tastiera e schermo) e ogni tanto cade nelle finte.
 */
const HUMAN: CpuProfile = {
  reactionMeanMs: 290,
  reactionSdMs: 55,
  fooledByLid: 0.15,
  fooledByFakeDash: 0.15,
  recognizesPoop: 0.88,
  fakeDashChance: 0.2,
};

const MATCHES = 400;

function simulate(profiles: CpuProfile[], seedBase: number) {
  const wins = profiles.map(() => 0);
  const falseStarts = profiles.map(() => 0);
  for (let k = 0; k < MATCHES; k++) {
    const m = new MatchMachine(createMatchConfig(profiles.length), new Rng(seedBase + k), 0);
    const cpus = profiles.map((p, i) => new CpuPlayer(i, p, new Rng(seedBase * 31 + k * 13 + i)));
    const d = new MatchDriver(m, cpus);
    let now = 0;
    while (m.phase !== 'final' && now < 1e7) {
      now += 1000 / 60;
      for (const e of d.step(now, [])) if (e.type === 'falseStart') falseStarts[e.player]++;
      d.afterRender(now, m.phase === 'dash');
    }
    wins[m.standings![0]]++;
  }
  const pct = (n: number) => `${Math.round((n / MATCHES) * 100)}%`.padStart(4);
  return { wins: wins.map(pct), falseStarts: falseStarts.map((f) => (f / MATCHES).toFixed(2)) };
}

describe.runIf(process.env.npm_lifecycle_event === 'balance')('bilanciamento', () => {
  it('stampa le percentuali di vittoria', () => {
    const lines: string[] = [];
    const diffs = Object.keys(tuning.cpu) as Difficulty[];

    lines.push('Umano simulato contro 3 CPU (vittorie dell’umano; 25% = alla pari):');
    diffs.forEach((d, i) => {
      const r = simulate([HUMAN, tuning.cpu[d], tuning.cpu[d], tuning.cpu[d]], 1000 + i * 7919);
      lines.push(`  vs 3× ${d.padEnd(9)} umano ${r.wins[0]}   cpu ${r.wins.slice(1).join(' ')}`);
    });

    const mix: Difficulty[] = ['facile', 'normale', 'difficile', 'normale'];
    const r = simulate(
      mix.map((d) => tuning.cpu[d]),
      50_000,
    );
    lines.push('', `CPU tra loro (${mix.join(', ')}):`);
    lines.push(
      `  vittorie ${r.wins.join(' ')}   false partenze/partita ${r.falseStarts.join(' ')}`,
    );

    console.log(`\n${lines.join('\n')}\n`);
  }, 600_000);
});
