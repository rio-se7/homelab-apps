import { moveFromApiNotation } from '../engine/board';
import type { MoveEval, WdlResult } from '../api/client';
import { isBoardMove, type GameState, type MoveRecord } from '../engine/types';

// Shared WDL helpers used by both blunder detection and missed-chance detection.
const RANK: Record<WdlResult, 0 | 1 | 2> = { lose: 0, draw: 1, win: 2 };
const LABEL: Record<WdlResult, string> = { lose: '負け', draw: '分け', win: '勝ち' };
export const rank = (r: WdlResult): 0 | 1 | 2 => RANK[r];
export const label = (r: WdlResult): string => LABEL[r];

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
