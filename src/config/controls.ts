/** Gatti e mappa tasti predefinita (KeyboardEvent.code, indipendente dal layout). */
export type CatId = 'priamo' | 'tempesta' | 'poh' | 'margot';
export type CatBreed = 'nero_pelolungo' | 'tuxedo';

export interface PlayerSlot {
  cat: CatId;
  name: string;
  /** Assegnazione provvisoria, vedi docs/DOMANDE_APERTE.md #1. */
  breed: CatBreed;
  badgeColor: string;
  keys: { dash: string; fake: string };
}

export const playerSlots: readonly PlayerSlot[] = [
  {
    cat: 'priamo',
    name: 'Priamo',
    breed: 'nero_pelolungo',
    badgeColor: '#3b6fe0',
    keys: { dash: 'KeyQ', fake: 'KeyA' },
  },
  {
    cat: 'tempesta',
    name: 'Tempesta',
    breed: 'nero_pelolungo',
    badgeColor: '#e04848',
    keys: { dash: 'KeyT', fake: 'KeyG' },
  },
  {
    cat: 'poh',
    name: 'Poh',
    breed: 'tuxedo',
    badgeColor: '#3fae5a',
    keys: { dash: 'KeyO', fake: 'KeyL' },
  },
  {
    cat: 'margot',
    name: 'Margot',
    breed: 'tuxedo',
    badgeColor: '#e0b83b',
    keys: { dash: 'ArrowUp', fake: 'ArrowDown' },
  },
];
