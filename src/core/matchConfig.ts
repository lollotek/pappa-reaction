import { tuning } from '../config/tuning';
import type { MatchConfig } from './MatchMachine';

/** Converte i parametri di `tuning` (secondi) nella config della MatchMachine (ms). */
export function createMatchConfig(playerCount: number, roundCount?: number): MatchConfig {
  const r = tuning.round;
  const f = tuning.fakeLid;
  const s = 1000;
  return {
    playerCount,
    roundCount: roundCount ?? r.count,
    introMs: r.introDuration * s,
    circlingMinMs: r.circlingMin * s,
    circlingMaxMs: r.circlingMax * s,
    revealWindowMs: r.revealWindow * s,
    resolveMs: r.resolveDuration * s,
    endMs: r.endDuration * s,
    tieThresholdMs: tuning.rules.tieThreshold * s,
    stunMs: tuning.rules.stunDuration * s,
    fakeDashCooldownMs: tuning.rules.fakeDashCooldown * s,
    fakeLid: {
      maxPerRound: f.maxPerRound,
      baseChance: f.baseChance,
      chancePerRound: f.chancePerRound,
      durationMs: f.duration * s,
      minGapMs: f.minGap * s,
      marginStartMs: f.marginStart * s,
      marginEndMs: f.marginEnd * s,
    },
    contents: tuning.bowl,
    poopId: 'cacchetta',
    lastRoundPoopPenalty: tuning.rules.lastRoundPoopPenalty,
  };
}
