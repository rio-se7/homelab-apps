import { describe, it, expect } from 'vitest';
import { findMissedChances } from './missedChance';
import type { Ply } from './timeline';
import { movesOf, terminalBlackWin } from './testkit';
import { initialState, applyMove, legalMoves } from '../engine/board';
import type { MoveEval } from '../api/client';

// A real 3-ply game so positions/history/moves are all valid.
const p0 = initialState();               // black to move
const p1 = applyMove(p0, legalMoves(p0)[0]); // white to move
const p2 = applyMove(p1, legalMoves(p1)[0]); // black to move
const p3 = applyMove(p2, legalMoves(p2)[0]); // white to move
const positions = [p0, p1, p2, p3];

const ply = (turn: 'black' | 'white', v: 0 | 1 | 2, moves: MoveEval[] = []): Ply =>
  ({ turn, vLearner: v, moves });

describe('findMissedChances (learner = black)', () => {
  it('flags a win handed then dropped to a draw as a critical missed chance', () => {
    // v: 負け,負け,勝ち,分け — opponent (ply 2) improved black to a win, black (ply 3) kept only a draw.
    const timeline = [ply('black', 0), ply('white', 0), ply('black', 2, movesOf(p2)), ply('white', 1)];
    const r = findMissedChances(positions, timeline, 'black');
    expect(r.offered).toBe(1);
    expect(r.missed).toBe(1);
    expect(r.conversionRate).toBe(0);
    expect(r.chances).toHaveLength(1);
    expect(r.chances[0]).toMatchObject({
      ply: 3, offeredByPly: 2, fromValue: '負け', offeredValue: '勝ち', keptValue: '分け', severity: 'critical',
    });
  });

  it('marks a draw-offered-then-lost chance as major (not critical)', () => {
    // v: 負け,負け,分け,負け — opponent offered a draw, black lost it.
    const timeline = [ply('black', 0), ply('white', 0), ply('black', 1, movesOf(p2)), ply('white', 0)];
    const r = findMissedChances(positions, timeline, 'black');
    expect(r.chances).toHaveLength(1);
    expect(r.chances[0]).toMatchObject({ offeredValue: '分け', keptValue: '負け', severity: 'major' });
  });

  it('does not count a position where the opponent did not loosen up (vOffered <= vBefore)', () => {
    const timeline = [ply('black', 2), ply('white', 2), ply('black', 2, movesOf(p2)), ply('white', 0)];
    const r = findMissedChances(positions, timeline, 'black');
    expect(r.offered).toBe(0);
    expect(r.conversionRate).toBe(1);
    expect(r.chances).toEqual([]);
  });

  it('counts an offered chance that was fully converted, with no miss', () => {
    const timeline = [ply('black', 0), ply('white', 0), ply('black', 2, movesOf(p2)), ply('white', 2)];
    const r = findMissedChances(positions, timeline, 'black');
    expect(r.offered).toBe(1);
    expect(r.missed).toBe(0);
    expect(r.conversionRate).toBe(1);
    expect(r.chances).toEqual([]);
  });

  it('never flags a miss when the learner move ended the game (vKept forced to a win)', () => {
    const positionsWin = [p0, p1, p2, terminalBlackWin];
    // Even though the raw timeline value at the last ply is 0, the game-over branch sets vKept = 2.
    const timeline = [ply('black', 0), ply('white', 0), ply('black', 2, movesOf(p2)), ply('white', 0)];
    const r = findMissedChances(positionsWin, timeline, 'black');
    expect(r.offered).toBe(1);
    expect(r.missed).toBe(0);
  });
});

describe('findMissedChances (learner = white)', () => {
  it('grades the second-player side correctly', () => {
    // learner = white; the white move at ply 2 (positions[1] -> positions[2]) is graded.
    const timeline = [ply('black', 0), ply('white', 2, movesOf(p1)), ply('black', 1), ply('white', 0)];
    const r = findMissedChances(positions, timeline, 'white');
    expect(r.offered).toBe(1);
    expect(r.missed).toBe(1);
    expect(r.chances[0]).toMatchObject({ ply: 2, offeredByPly: 1, severity: 'critical' });
  });
});
