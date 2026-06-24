import { encodeForApi, moveFromApiNotation, apiMoveToKifu } from '../engine/board';
import { fetchMoves, type MoveEval } from '../api/client';
import { isBoardMove, type GameState, type MoveRecord } from '../engine/types';

export interface BlunderEntry {
  ply: number;            // 1-indexed move number
  playedKifu: string;
  bestKifu: string;
  detail: string;         // e.g. "勝ち→負け"
  severity: 'blunder' | 'mistake';
}

const rank = (r: string) => (r === 'win' ? 2 : r === 'draw' ? 1 : 0);
const label = (r: string) => (r === 'win' ? '勝ち' : r === 'draw' ? '分け' : '負け');
const COL_X: Record<string, number> = { A: 2, B: 1, C: 0 };
const DROP_PT: Record<string, number> = { P: 1, E: 2, G: 3 };

// Resolve a played MoveRecord (board-frame "B4B3P" / "P*B3") to coordinates.
export function recCoords(rec: MoveRecord) {
  const n = rec.notation;
  if (n[1] === '*') return { drop: true, pt: DROP_PT[n[0]], tx: COL_X[n[2]], ty: +n[3] - 1 };
  return { drop: false, fx: COL_X[n[0]], fy: +n[1] - 1, tx: COL_X[n[2]], ty: +n[3] - 1 };
}

// Find which candidate API move equals the one actually played (match by coords).
export function matchPlayed(cands: MoveEval[], before: GameState, rec: MoveRecord): MoveEval | undefined {
  const p = recCoords(rec);
  return cands.find(c => {
    const mv = moveFromApiNotation(c.mv, before);
    if (!mv) return false;
    if (isBoardMove(mv)) {
      return !p.drop && mv.from[0] === p.fx && mv.from[1] === p.fy
        && mv.to[0] === p.tx && mv.to[1] === p.ty;
    }
    return p.drop && mv.piece === p.pt && mv.to[0] === p.tx && mv.to[1] === p.ty;
  });
}

/**
 * positions: full sequence from start to end (App's `allPositions`, length = plies + 1).
 * learner:   which side's moves to grade ('black' = 先手, 'white' = 後手).
 * Only result-changing errors are reported.
 */
export async function analyzeGame(
  positions: GameState[],
  learner: 'black' | 'white',
): Promise<BlunderEntry[]> {
  const report: BlunderEntry[] = [];
  for (let i = 0; i < positions.length - 1; i++) {
    const before = positions[i];
    if (before.turn !== learner) continue;                 // grade only your own moves
    const { moves } = await fetchMoves(encodeForApi(before));
    if (moves.length === 0) continue;
    const best = moves[0];                                 // engine returns best-first
    const rec = positions[i + 1].history.at(-1);
    if (!rec) continue;
    const played = matchPlayed(moves, before, rec) ?? best;
    const drop = rank(best.result) - rank(played.result);  // WDL deterioration
    if (drop <= 0) continue;                                // result kept → not a blunder
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
