import type { KeyPair } from './settings';

/** Gatti e mappa tasti predefinita (KeyboardEvent.code, indipendente dal layout). */
export type CatId = 'priamo' | 'tempesta' | 'poh' | 'mariu';
export type CatBreed = 'nero_pelolungo' | 'tuxedo';

export interface PlayerSlot {
  cat: CatId;
  name: string;
  breed: CatBreed;
  /** 0/1: distingue i due gatti della stessa razza (macchie, riflessi). */
  variant: 0 | 1;
  badgeColor: string;
  /** Tasti predefiniti: scatto/smash, finta, direzioni (su e giù per ora senza tasto). */
  keys: KeyPair;
}

export const playerSlots: readonly PlayerSlot[] = [
  {
    cat: 'priamo',
    name: 'Priamo',
    breed: 'nero_pelolungo',
    variant: 0,
    badgeColor: '#3b6fe0',
    keys: { dash: 'KeyQ', fake: 'KeyA', left: 'KeyZ', right: 'KeyX', up: '', down: '' },
  },
  {
    cat: 'tempesta',
    name: 'Tempesta',
    breed: 'tuxedo',
    variant: 1,
    badgeColor: '#e04848',
    keys: { dash: 'KeyT', fake: 'KeyG', left: 'KeyV', right: 'KeyB', up: '', down: '' },
  },
  {
    cat: 'poh',
    name: 'Poh',
    breed: 'tuxedo',
    variant: 0,
    badgeColor: '#3fae5a',
    keys: { dash: 'KeyO', fake: 'KeyL', left: 'Comma', right: 'Period', up: '', down: '' },
  },
  {
    cat: 'mariu',
    name: 'Mariù',
    breed: 'nero_pelolungo',
    variant: 1,
    badgeColor: '#e0b83b',
    keys: {
      dash: 'ArrowUp',
      fake: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
      up: '',
      down: '',
    },
  },
];
