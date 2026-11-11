import type { MatchMachine, RoundEvent, TimedInput } from '../core/MatchMachine';
import type { Rng } from '../core/Rng';

export interface CpuProfile {
  reactionMeanMs: number;
  reactionSdMs: number;
  /** Probabilità di abboccare a una finta del coperchio. */
  fooledByLid: number;
  /** Probabilità di abboccare alla finta di scatto di un avversario. */
  fooledByFakeDash: number;
  /** Probabilità di riconoscere la cacchetta e non scattare. */
  recognizesPoop: number;
  /** Probabilità di fare una finta di scatto in un round. */
  fakeDashChance: number;
}

/** Nessun gatto (né umano) reagisce davvero sotto questa soglia. */
const MIN_REACTION_MS = 140;
/** Dopo lo stordimento la CPU riprova appena può, con un piccolo ritardo. */
const AFTER_STUN_MS = 120;
/** Finestra (dall'inizio del giro) in cui la CPU può fingere: entro il giro minimo. */
const FAKE_WINDOW_MS: [number, number] = [500, 2300];

/**
 * Giocatore controllato dal computer. Vede solo ciò che vedrebbe un umano
 * (eventi della partita e coperchio a schermo) e programma pressioni con un
 * tempo di reazione casuale. Le pressioni passano dalla stessa MatchMachine
 * degli umani: nessun vantaggio sulle regole.
 */
export class CpuPlayer {
  private pending: TimedInput[] = [];
  private revealHandledRound = -1;

  constructor(
    readonly player: number,
    readonly profile: CpuProfile,
    private readonly rng: Rng,
  ) {}

  onEvent(e: RoundEvent, m: MatchMachine): void {
    if (!m.players[this.player]?.active) return;
    switch (e.type) {
      case 'phase':
        if (e.phase === 'intro') this.pending = [];
        if (e.phase === 'circling' && this.rng.next() < this.profile.fakeDashChance) {
          this.schedule('fake', e.t + this.rng.range(...FAKE_WINDOW_MS));
        }
        break;
      case 'fakeLid':
        if (this.rng.next() < this.profile.fooledByLid) {
          this.schedule('dash', e.t + this.reactionMs());
        }
        break;
      case 'fakeDash':
        if (e.player !== this.player && this.rng.next() < this.profile.fooledByFakeDash) {
          this.schedule('dash', e.t + this.reactionMs());
        }
        break;
      default:
        break;
    }
  }

  /** Da chiamare dopo che il frame è stato mostrato: reagisce al coperchio aperto. */
  update(m: MatchMachine): void {
    const me = m.players[this.player];
    if (!me?.active || m.phase !== 'dash' || m.revealShownAt === null) return;
    if (this.revealHandledRound === m.round) return;
    this.revealHandledRound = m.round;

    // Annulla gli scatti "abboccati" non ancora partiti: ora vede il coperchio.
    this.pending = this.pending.filter((p) => p.action !== 'dash' || p.t < m.revealShownAt!);
    if (m.isPoopRound && this.rng.next() < this.profile.recognizesPoop) return;

    const at = Math.max(m.revealShownAt + this.reactionMs(), me.stunnedUntil + AFTER_STUN_MS);
    this.schedule('dash', at);
  }

  /** Restituisce (e rimuove) le pressioni programmate fino a `now`. */
  drainDue(now: number): TimedInput[] {
    const due = this.pending.filter((p) => p.t <= now);
    if (due.length > 0) this.pending = this.pending.filter((p) => p.t > now);
    return due;
  }

  private schedule(action: TimedInput['action'], t: number): void {
    this.pending.push({ player: this.player, action, t });
  }

  /** Tempo di reazione con distribuzione normale (Box-Muller), minimo realistico. */
  private reactionMs(): number {
    const u1 = Math.max(this.rng.next(), 1e-9);
    const u2 = this.rng.next();
    const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(
      MIN_REACTION_MS,
      this.profile.reactionMeanMs + gauss * this.profile.reactionSdMs,
    );
  }
}
