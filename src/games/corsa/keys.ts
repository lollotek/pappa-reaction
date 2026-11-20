import { RESERVED_KEYS, type KeyPair } from '../../config/settings';

/**
 * Tasti su/giù predefiniti di Corsa pazza (gli altri giochi non li usano: nelle
 * impostazioni restano vuoti). Vicino ai tasti sinistra/destra di ogni gatto.
 */
const DIRECTIONS: readonly Pick<KeyPair, 'up' | 'down'>[] = [
  { up: 'KeyS', down: 'KeyD' }, // Priamo: Z X (sinistra, destra)
  { up: 'KeyH', down: 'KeyN' }, // Tempesta: V B
  { up: 'KeyK', down: 'Semicolon' }, // Poh: , .
  { up: 'Quote', down: 'Slash' }, // Mariù: ← →
];

/**
 * Riempie i tasti su/giù mancanti con quelli di Corsa pazza, se liberi (chi li
 * ha già assegnati a mano li tiene). Non salva nulla: vale per questa pagina.
 */
export function withCorsaKeys(keys: readonly KeyPair[]): KeyPair[] {
  const out = keys.map((k) => ({ ...k }));
  const used = new Set(out.flatMap((k) => Object.values(k)).filter(Boolean));
  out.forEach((k, i) => {
    for (const action of ['up', 'down'] as const) {
      const want = DIRECTIONS[i % DIRECTIONS.length][action];
      if (k[action] === '' && !used.has(want) && !RESERVED_KEYS.includes(want)) {
        k[action] = want;
        used.add(want);
      }
    }
  });
  return out;
}
