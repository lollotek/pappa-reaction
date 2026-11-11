import { tuning, type Difficulty } from './tuning';

/** Chi controlla ogni gatto e a che difficoltà giocano le CPU. */
export interface MatchSetup {
  /** `true` = slot controllato dalla CPU (indice 0..playerCount-1). */
  cpu: boolean[];
  difficulty: Difficulty;
  seed?: number;
}

const DIFFICULTIES = Object.keys(tuning.cpu) as Difficulty[];

/**
 * Legge la configurazione dai parametri URL (provvisorio, finché il menu di M6 non c'è):
 * - `cpu=2,3,4` slot CPU (1-based); `cpu=none` tutti umani. Default: 2,3,4.
 * - `diff=facile|normale|difficile`. Default: normale.
 * - `seed=123` partita riproducibile.
 */
export function parseMatchSetup(search: string, playerCount: number): MatchSetup {
  const params = new URLSearchParams(search);

  const cpuParam = params.get('cpu') ?? '2,3,4';
  const cpuSlots = new Set(
    cpuParam
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10) - 1)
      .filter((i) => Number.isInteger(i) && i >= 0 && i < playerCount),
  );
  const cpu = Array.from({ length: playerCount }, (_, i) => cpuSlots.has(i));

  const diffParam = params.get('diff') as Difficulty | null;
  const difficulty = diffParam && DIFFICULTIES.includes(diffParam) ? diffParam : 'normale';

  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  return { cpu, difficulty, seed: Number.isFinite(seed) && seed > 0 ? seed : undefined };
}
