import { tuning } from '../config/tuning';
import type { RoundConfig } from './RoundMachine';

/** Converte i parametri di `tuning` (secondi) nella config della RoundMachine (ms). */
export function createRoundConfig(playerCount: number): RoundConfig {
  const r = tuning.round;
  const s = 1000;
  return {
    playerCount,
    introMs: r.introDuration * s,
    circlingMinMs: r.circlingMin * s,
    circlingMaxMs: r.circlingMax * s,
    revealWindowMs: r.revealWindow * s,
    resolveMs: r.resolveDuration * s,
    endMs: r.endDuration * s,
    tieThresholdMs: tuning.rules.tieThreshold * s,
    stunMs: tuning.rules.stunDuration * s,
    // M1: niente cacchetta (arriva in M2).
    contents: tuning.bowl.filter((b) => b.id !== 'cacchetta'),
  };
}
