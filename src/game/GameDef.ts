import type { AudioOut } from '../audio/AudioEngine';
import type { PlayerSlot } from '../config/controls';
import type { Controller, KeyAction, Settings } from '../config/settings';
import type { Difficulty } from '../config/tuning';
import type { GameId } from '../games/registry';
import type { FrameInput } from '../input/InputSource';
import type { PixelRenderer } from '../render/PixelRenderer';
import type { MenuItem } from '../ui/MenuModel';

/** Audio come lo vede una partita, più quel che serve per far ripartire la musica. */
export type SessionAudio = AudioOut;

/** Stato dell'audio mostrato nell'HUD. */
export type AudioStatus = 'locked' | 'on' | 'off';

/** Una partita (o la demo dietro al menu) di un minigioco, con il suo orologio. */
export interface GameSession {
  /** Partita finita: classifica a schermo, in attesa di rivincita o menu. */
  readonly finished: boolean;
  readonly paused: boolean;
  /** Chi controlla ogni gatto in questa partita. */
  readonly players: readonly Controller[];
  /** Un frame: comandi → logica → animazioni → rendering. */
  frame(realNow: number, input: FrameInput): void;
  /** Nuova partita con gli stessi giocatori (rivincita). */
  restart(realNow: number): void;
  pause(realNow: number): void;
  resume(realNow: number): void;
  dispose(): void;
  setAudioStatus(status: AudioStatus): void;
  /** Audio sbloccato a partita iniziata: la musica parte subito se serve. */
  resumeMusicIfNeeded(audio: AudioOut & { musicPlaying: boolean; ready: boolean }): void;
  /** Comandi touch accesi per questo gatto (spenti da stordito, in panchina…). */
  controlsEnabled(player: number, realNow: number): boolean;
}

export interface SessionDeps {
  container: HTMLElement;
  slots: readonly PlayerSlot[];
  pixel: PixelRenderer;
  audio: AudioOut;
}

/** Cosa chiede il menu a un gioco per avviare una partita. */
export interface SessionRequest {
  players: readonly Controller[];
  difficulty: Difficulty;
  settings: Settings;
  /** false = demo dietro al menu (niente HUD, nessun umano). */
  showHud: boolean;
  screenEffects: boolean;
  seed?: number;
}

/** Accesso alle impostazioni per le voci di menu dei giochi. */
export interface SettingsAccess {
  get(): Settings;
  update(patch: Partial<Settings>): void;
}

/**
 * Quel che distingue un minigioco dentro l'App comune (titolo, menu,
 * opzioni, pausa, touch, controller): partite, voci di menu proprie e testi.
 */
export interface GameDef<S extends GameSession = GameSession> {
  id: GameId;
  /** Titolo grande sopra il menu. */
  title: string;
  /** Tasti dei gatti che il gioco usa, nell'ordine di Comandi e Prova tasti. */
  keyActions: readonly { action: KeyAction; label: string }[];
  /** Comandi touch: pulsanti SCATTO e FINTA, o striscia da trascinare e SMASH. */
  touchControls: 'buttons' | 'strip';
  createSession(deps: SessionDeps, request: SessionRequest, realNow: number): S;
  /** Voci di "Nuova partita" proprie del gioco (dopo umano/CPU e difficoltà). */
  setupItems(s: SettingsAccess): MenuItem[];
  /** Voci di "Opzioni" proprie del gioco e note in fondo. */
  optionItems(s: SettingsAccess): { items: MenuItem[]; notes: string[] };
  rulesHtml: string;
  /** Regole aggiunte in modalità touch. */
  rulesTouchHtml: string;
  /** Comandi in modalità touch (schermata Comandi). */
  touchControlsHtml: string;
  /** Una riga sui comandi touch di 1 o 2 umani (tag colorati dei gatti). */
  touchHumansHtml(tags: readonly string[]): string;
}
