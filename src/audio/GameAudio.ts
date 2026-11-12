import type { MatchMachine, RoundEvent } from '../core/MatchMachine';
import type { AudioOut } from './AudioEngine';
import { musicTempo } from './notes';

export interface GameAudioOptions {
  /** Alla finta del coperchio la musica fa un "singhiozzo" (difficoltà alta). */
  hiccupOnFakeLid: boolean;
}

/**
 * Regia sonora: traduce gli eventi della partita in musica ed effetti.
 * Regola chiave: la musica si ferma SOLO al reveal vero (fase `dash`),
 * mai durante le finte del coperchio — è l'indizio per i giocatori attenti.
 */
export class GameAudio {
  constructor(
    private readonly out: AudioOut,
    private readonly options: GameAudioOptions,
  ) {}

  onEvent(e: RoundEvent, m: MatchMachine): void {
    switch (e.type) {
      case 'phase':
        switch (e.phase) {
          case 'intro':
            this.out.stopMusic();
            this.out.sfx(
              m.suddenDeath || e.round === m.config.roundCount ? 'roundStartFinal' : 'roundStart',
            );
            break;
          case 'circling':
            this.out.startMusic(musicTempo(e.round, m.suddenDeath));
            break;
          case 'dash':
            this.out.stopMusic();
            this.out.sfx('lidOpen');
            break;
          case 'end':
            this.out.sfx('lidClose');
            break;
          case 'final': {
            this.out.stopMusic();
            this.out.sfx('fanfare');
            const winner = m.standings?.[0];
            if (winner !== undefined) this.out.meow(winner, 'happy');
            break;
          }
          case 'resolve':
            break;
        }
        break;
      case 'fakeLid':
        this.out.sfx('lidFake');
        if (this.options.hiccupOnFakeLid) this.out.hiccupMusic();
        break;
      case 'dash':
        this.out.sfx('dash', e.player);
        break;
      case 'fakeDash':
        this.out.sfx('fakeDash', e.player);
        break;
      case 'falseStart':
        this.out.sfx('dash', e.player);
        this.out.sfx('bonk', e.player);
        this.out.meow(e.player, 'annoyed');
        break;
      case 'poop':
        this.out.sfx('dash', e.player);
        this.out.sfx('poop', e.player);
        break;
      case 'resolved': {
        const r = e.result;
        if (r.winners.length > 0) {
          this.out.sfx('eat');
          for (const w of r.winners) this.out.meow(w, 'happy');
        } else if (r.poopVictims.length > 0) {
          for (const v of r.poopVictims) this.out.meow(v, 'sad');
        } else if (r.content.id === m.config.poopId) {
          this.out.sfx('phew'); // nessuno ci è cascato
        }
        break;
      }
    }
  }
}
