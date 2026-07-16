import { describe, it, expect } from 'vitest';
import { findBlunders } from './blunderReport';
import type { Ply } from './timeline';
import { toApiMv } from './testkit';
import { initialState, applyMove, legalMoves } from '../engine/board';
import type { MoveEval, WdlResult } from '../api/client';

const p0 = initialState();                    // black to move (learner)
const p1 = applyMove(p0, legalMoves(p0)[0]);  // white to move
const p2 = applyMove(p1, legalMoves(p1)[0]);
const positions = [p0, p1, p2];

// moves[0] = a *different* legal move flagged `best`; the actually-played move
// (legalMoves(p0)[0], which produced p1) is included with `playedResult`.
function movesWithPlayed(best: WdlResult, playedResult: WdlResult): MoveEval[] {
  const legals = legalMoves(p0);
  return [
    { mv: toApiMv(legals[1], p0), result: best, dtm: 3 },
    { mv: toApiMv(legals[0], p0), result: playedResult, dtm: 1 },
  ];
}
const tl = (moves: MoveEval[]): Ply[] => [
  { turn: 'black', vLearner: 0, moves },
  { turn: 'white', vLearner: 0, moves: [] },
];

describe('findBlunders', () => {
  it('flags a win thrown to a loss as a blunder (2-step WDL drop)', () => {
    const r = findBlunders(positions, tl(movesWithPlayed('win', 'lose')), 'black');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ ply: 1, severity: 'blunder', detail: '勝ち→負け' });
    expect(r[0].bestKifu).not.toBe(r[0].playedKifu);
  });

  it('flags a win softened to a draw as a mistake (1-step drop)', () => {
    const r = findBlunders(positions, tl(movesWithPlayed('win', 'draw')), 'black');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ ply: 1, severity: 'mistake', detail: '勝ち→分け' });
  });

  it('does not flag a move that preserved the result', () => {
    const r = findBlunders(positions, tl(movesWithPlayed('draw', 'draw')), 'black');
    expect(r).toEqual([]);
  });

  it('only grades the learner side', () => {
    // learner = white, but the graded ply here is black's — nothing reported.
    const r = findBlunders(positions, tl(movesWithPlayed('win', 'lose')), 'white');
    expect(r).toEqual([]);
  });
});
