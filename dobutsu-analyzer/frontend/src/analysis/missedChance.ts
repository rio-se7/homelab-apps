import { apiMoveToKifu, checkWinner } from '../engine/board';
import type { GameState } from '../engine/types';
import { matchPlayed } from './core';
import type { Ply } from './timeline';

export type WdlLabel = '勝ち' | '分け' | '負け';
const LABEL: WdlLabel[] = ['負け', '分け', '勝ち']; // index by v

export interface MissedChance {
  ply: number;             // 1-indexed: the learner move where conversion failed
  offeredByPly: number;    // 1-indexed: the opponent move that handed the chance
  fromValue: WdlLabel;     // learner value before the opponent's gift
  offeredValue: WdlLabel;  // value the opponent handed you (= achievable best)
  keptValue: WdlLabel;     // value you actually secured
  playedKifu: string;
  bestKifu: string;
  severity: 'critical' | 'major';  // critical = a win was thrown away
}

export interface ChanceSummary {
  offered: number;
  missed: number;
  conversionRate: number;  // (offered - missed) / offered, 1 if offered === 0
  chances: MissedChance[];
}

/**
 * positions: full sequence from start to end (App's `allPositions`).
 * timeline:  learner-perspective evaluation for every position (shared with findBlunders,
 *            built once via buildTimeline — see analysis/timeline.ts).
 * learner:   which side's chances to grade ('black' = 先手, 'white' = 後手).
 *
 * A "missed chance" is a blunder that is specifically the result of the opponent
 * having just handed the learner a better outcome (v[i] > v[i-1], learner's turn)
 * which the learner then failed to keep (v[i+1] < v[i]).
 */
export function findMissedChances(
  positions: GameState[],
  timeline: Ply[],
  learner: 'black' | 'white',
): ChanceSummary {
  const chances: MissedChance[] = [];
  let offered = 0, missed = 0;
  for (let i = 1; i < timeline.length - 1; i++) {
    if (timeline[i].turn !== learner) continue;
    const vBefore = timeline[i - 1].vLearner;
    const vOffered = timeline[i].vLearner;
    if (vOffered <= vBefore) continue;   // opponent didn't loosen up — no gift
    offered++;
    // NOTE(grounding): if the learner's move ended the game, checkWinner already
    // resolves it — the learner necessarily won (see analysis/timeline.ts evalPly),
    // so vKept is taken as 2 without consulting timeline[i + 1].
    const gameOver = checkWinner(positions[i + 1], null) !== null;
    const vKept = gameOver ? 2 : timeline[i + 1].vLearner;
    if (vKept >= vOffered) continue;     // converted successfully
    missed++;
    const before = positions[i];
    const best = timeline[i].moves[0];
    const rec = positions[i + 1].history.at(-1);
    if (!best || !rec) continue;         // defensive: no candidates or missing record
    const played = matchPlayed(timeline[i].moves, before, rec) ?? best;
    chances.push({
      ply: i + 1,
      offeredByPly: i,
      fromValue: LABEL[vBefore],
      offeredValue: LABEL[vOffered],
      keptValue: LABEL[vKept],
      playedKifu: apiMoveToKifu(played.mv, before),
      bestKifu: apiMoveToKifu(best.mv, before),
      severity: vOffered === 2 ? 'critical' : 'major',
    });
  }
  const conversionRate = offered === 0 ? 1 : (offered - missed) / offered;
  return { offered, missed, conversionRate, chances };
}
