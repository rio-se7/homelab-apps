import type { WdlResult } from '../api/client';

// Eval score for the graph.
//   sign      = who is winning (+ = 先手 / black, − = 後手 / white)
//   magnitude = closeness to mate (nearer mate → larger), draw = 0
// dobutsu's longest forced mate is 78 plies, so MATE_BASE = 100 keeps every
// win clear of 0 (min |score| = 100 - 78 = 22) and never collides with a draw.
export const MATE_BASE = 100;

export function toScore(result: WdlResult, dtm: number, turn: 'black' | 'white'): number {
  if (result === 'draw') return 0;
  const movesToMate = dtm + 1;                  // 1..78 (same count shown as "N手")
  const magnitude = MATE_BASE - movesToMate;    // larger when mate is nearer
  const blackWinning = turn === 'black' ? result === 'win' : result === 'lose';
  return blackWinning ? magnitude : -magnitude;
}

// Recover the displayed mate distance from a plotted score (for tooltips).
export function scoreToMoves(score: number): number {
  return MATE_BASE - Math.abs(score);
}
