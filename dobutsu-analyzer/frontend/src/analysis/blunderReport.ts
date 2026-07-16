import { apiMoveToKifu } from '../engine/board';
import type { GameState } from '../engine/types';
import { rank, label, matchPlayed } from './core';
import { buildTimeline, type Ply } from './timeline';

export interface BlunderEntry {
  ply: number;            // 1-indexed move number
  playedKifu: string;
  bestKifu: string;
  detail: string;         // e.g. "勝ち→負け"
  severity: 'blunder' | 'mistake';
}

// Re-exported for callers that imported these from blunderReport before the
// analysis/core.ts split (e.g. quiz/QuizPanel.tsx).
export { matchPlayed, recCoords } from './core';

/**
 * positions: full sequence from start to end (App's `allPositions`, length = plies + 1).
 * timeline:  learner-perspective evaluation for every position, built once via buildTimeline
 *            and shared with missed-chance detection (analysis/missedChance.ts).
 * learner:   which side's moves to grade ('black' = 先手, 'white' = 後手).
 * Only result-changing errors are reported.
 */
export function findBlunders(
  positions: GameState[],
  timeline: Ply[],
  learner: 'black' | 'white',
): BlunderEntry[] {
  const report: BlunderEntry[] = [];
  for (let i = 0; i < positions.length - 1; i++) {
    if (timeline[i].turn !== learner) continue;               // grade only your own moves
    const moves = timeline[i].moves;
    if (moves.length === 0) continue;
    const before = positions[i];
    const best = moves[0];                                    // engine returns best-first
    const rec = positions[i + 1].history.at(-1);
    if (!rec) continue;
    const played = matchPlayed(moves, before, rec) ?? best;
    const drop = rank(best.result) - rank(played.result);     // WDL deterioration
    if (drop <= 0) continue;                                   // result kept → not a blunder
    report.push({
      ply: i + 1,
      playedKifu: apiMoveToKifu(played.mv, before),
      bestKifu: apiMoveToKifu(best.mv, before),
      detail: `${label(best.result)}→${label(played.result)}`,
      severity: drop >= 2 ? 'blunder' : 'mistake',
    });
  }
  // TODO(optional): also flag result-preserving tempo losses by comparing dtm
  // when best.result === played.result (e.g. threw away a faster mate).
  return report;
}

/** Convenience wrapper for callers that only need blunder detection (builds its own timeline). */
export async function analyzeGame(
  positions: GameState[],
  learner: 'black' | 'white',
): Promise<BlunderEntry[]> {
  const timeline = await buildTimeline(positions, learner);
  return findBlunders(positions, timeline, learner);
}
