import { describe, it, expect } from 'vitest';
import { rank, label, recCoords, matchPlayed } from './core';
import { coordsEqual, toApiMv } from './testkit';
import { initialState, applyMove, legalMoves } from '../engine/board';
import type { Move } from '../engine/types';
import type { MoveEval } from '../api/client';

describe('rank / label', () => {
  it('maps WDL results to 0/1/2', () => {
    expect(rank('lose')).toBe(0);
    expect(rank('draw')).toBe(1);
    expect(rank('win')).toBe(2);
  });

  it('maps WDL results to Japanese labels', () => {
    expect(label('lose')).toBe('負け');
    expect(label('draw')).toBe('分け');
    expect(label('win')).toBe('勝ち');
  });
});

describe('recCoords', () => {
  it('parses a board-move notation', () => {
    expect(recCoords({ notation: 'B3B2P', to: [1, 1], turn: 'black' })).toEqual({
      drop: false, fx: 1, fy: 2, tx: 1, ty: 1,
    });
  });

  it('parses a drop notation', () => {
    expect(recCoords({ notation: 'P*B3', to: [1, 2], turn: 'black' })).toEqual({
      drop: true, pt: 1, tx: 1, ty: 2,
    });
  });
});

// A distinct legal move that isn't `played` (throws if none, keeping the type non-null).
function otherMoveThan(before: ReturnType<typeof initialState>, played: Move) {
  const other = legalMoves(before).find(m => !coordsEqual(m, played));
  if (!other) throw new Error('expected a second distinct legal move');
  return other;
}
const lastRecord = (s: ReturnType<typeof initialState>) => s.history.at(-1);

describe('matchPlayed', () => {
  it('finds the candidate matching the actually-played move by coordinates', () => {
    const before = initialState();
    const played = legalMoves(before)[0];
    const other = otherMoveThan(before, played);

    const candidates: MoveEval[] = [
      { mv: toApiMv(other, before), result: 'win', dtm: 3 },
      { mv: toApiMv(played, before), result: 'draw', dtm: 0 },
    ];
    const rec = lastRecord(applyMove(before, played));
    const match = matchPlayed(candidates, before, rec);
    expect(match?.mv).toBe(toApiMv(played, before));
    expect(match?.result).toBe('draw');
  });

  it('returns undefined when no candidate matches', () => {
    const before = initialState();
    const played = legalMoves(before)[0];
    const other = otherMoveThan(before, played);
    const rec = lastRecord(applyMove(before, played));
    const candidates: MoveEval[] = [{ mv: toApiMv(other, before), result: 'win', dtm: 1 }];
    expect(matchPlayed(candidates, before, rec)).toBeUndefined();
  });
});
