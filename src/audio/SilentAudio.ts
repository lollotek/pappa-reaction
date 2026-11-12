import type { AudioOut } from './AudioEngine';

/** Audio muto: per la partita dimostrativa dietro al menu. */
export const silentAudio: AudioOut = {
  startMusic: () => {},
  stopMusic: () => {},
  hiccupMusic: () => {},
  sfx: () => {},
  meow: () => {},
};
