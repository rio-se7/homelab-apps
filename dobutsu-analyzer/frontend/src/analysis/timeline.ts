import { encodeForApi, checkWinner } from '../engine/board';
import { fetchMoves } from '../api/client';
import type { MoveEval } from '../api/client';
import type { GameState } from '../engine/types';
import { rank } from './core';

// Learner-perspective evaluation of a single position under perfect play.
export interface Ply {
  turn: 'black' | 'white'; // side to move at this position
  vLearner: 0 | 1 | 2;     // learner-perspective value (0=lose, 1=draw, 2=win)
  moves: MoveEval[];       // best-first legal moves (empty if terminal)
}

// Evaluate one position from the learner's perspective.
//
// NOTE(grounding): terminal positions (a lion has already been captured, or the
// try-rule condition is satisfied — see engine/board.ts checkWinner) are never
// sent to the API. checkWinner(pos, null) already resolves the winner in that
// case, so vLearner is derived directly from it (win=2, lose=0) instead of
// querying /api/moves on a position that is not part of the perfect-play table.
export async function evalPly(pos: GameState, learner: 'black' | 'white'): Promise<Ply> {
  const winner = checkWinner(pos, null);
  if (winner !== null) {
    return { turn: pos.turn, vLearner: winner === learner ? 2 : 0, moves: [] };
  }
  const hex = encodeForApi(pos);
  const { moves } = await fetchMoves(hex);
  const moverRank = moves.length > 0 ? rank(moves[0].result) : 0;
  const vLearner = (pos.turn === learner ? moverRank : 2 - moverRank) as 0 | 1 | 2;
  return { turn: pos.turn, vLearner, moves };
}

// Build the full learner-perspective evaluation timeline for a game.
//
// NOTE(grounding): fetches are sequential (not Promise.all) to stay gentle on
// the BFF — at most ~40 requests per game either way.
export async function buildTimeline(
  positions: GameState[],
  learner: 'black' | 'white',
): Promise<Ply[]> {
  const out: Ply[] = [];
  for (const p of positions) out.push(await evalPly(p, learner));
  return out;
}
