/**
 * Note e spartito della musichetta (logica pura, testabile).
 * Melodia originale in Do maggiore, 8 battute da 8 crome, in loop.
 */

const SEMITONES: Record<string, number> = {
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
  A: 9,
  'A#': 10,
  B: 11,
};

/** Frequenza (Hz) di una nota tipo "A4", "C#5". */
export function noteToFreq(note: string): number {
  const m = /^([A-G]#?)(-?\d)$/.exec(note);
  if (!m) throw new Error(`Nota non valida: ${note}`);
  const midi = (Number(m[2]) + 1) * 12 + SEMITONES[m[1]];
  return 440 * 2 ** ((midi - 69) / 12);
}

/** "." = pausa, "-" = prolunga la nota precedente. */
const MELODY = [
  'C5 E5 G5 E5 A5 G5 E5 -',
  'F5 A5 G5 E5 D5 E5 C5 -',
  'C5 E5 G5 C6 B5 G5 A5 -',
  'G5 F5 E5 D5 C5 . G4 .',
  'C5 E5 G5 E5 A5 G5 E5 -',
  'F5 A5 G5 E5 D5 E5 C5 -',
  'E5 G5 A5 C6 D6 C6 A5 -',
  'G5 E5 D5 E5 C5 - . .',
];

/** Accordo (fondamentale e quinta del basso) per battuta. */
const BASS = [
  ['C3', 'G3'],
  ['F2', 'C3'],
  ['C3', 'G3'],
  ['G2', 'D3'],
  ['C3', 'G3'],
  ['F2', 'C3'],
  ['A2', 'E3'],
  ['G2', 'D3'],
];

export const STEPS_PER_BAR = 8;
export const LOOP_STEPS = MELODY.length * STEPS_PER_BAR;

export interface StepNotes {
  /** Nota della melodia che inizia su questa croma, con durata in crome. */
  lead: { note: string; steps: number } | null;
  /** Basso "oom-pah": fondamentale sui tempi forti, quinta sui deboli. */
  bass: string;
  /** Charleston (rumore) sui controtempi. */
  hat: boolean;
}

/** Cosa suona alla croma `step` (qualsiasi intero ≥ 0, il pezzo è in loop). */
export function notesAt(step: number): StepNotes {
  const s = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  const bar = Math.floor(s / STEPS_PER_BAR);
  const inBar = s % STEPS_PER_BAR;
  const tokens = MELODY[bar].split(' ');
  const token = tokens[inBar];

  let lead: StepNotes['lead'] = null;
  if (token !== '.' && token !== '-') {
    let steps = 1;
    while (tokens[inBar + steps] === '-') steps++;
    lead = { note: token, steps };
  }
  return { lead, bass: BASS[bar][inBar % 2], hat: inBar % 2 === 1 };
}

/** Tempo della musica: accelera a ogni round, ancora di più nello spareggio. */
export function musicTempo(round: number, suddenDeath: boolean): number {
  if (suddenDeath) return 176;
  return 132 + 8 * (Math.min(round, 5) - 1);
}
