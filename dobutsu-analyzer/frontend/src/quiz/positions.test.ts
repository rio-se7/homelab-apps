import { describe, it, expect } from 'vitest';
import { seedTagged, dueQuizItems, allQuizItems } from './positions';
import { initialState, applyMove, legalMoves, encodeForApi } from '../engine/board';
import type { GameState } from '../engine/types';

// Three distinct, valid positions (so their normalized keys round-trip through
// unpackPosition inside itemFromCard).
const p0: GameState = initialState();
const p1: GameState = applyMove(p0, legalMoves(p0)[0]);
const p2: GameState = applyMove(p1, legalMoves(p1)[0]);

describe('seedTagged', () => {
  it('registers positions with their tags, keyed by normalized position', () => {
    const store = seedTagged({}, [{ state: p0, tags: ['blunder', 'major'] }], 1000);
    const key = encodeForApi(p0);
    expect(store[key]).toMatchObject({ key, box: 0, due: 1000, tags: ['blunder', 'major'] });
  });

  it('union-merges tags when the same position is seeded again', () => {
    let store = seedTagged({}, [{ state: p0, tags: ['blunder'] }], 1000);
    store = seedTagged(store, [{ state: p0, tags: ['missed-chance', 'critical'] }], 2000);
    const key = encodeForApi(p0);
    expect(new Set(store[key].tags)).toEqual(new Set(['blunder', 'missed-chance', 'critical']));
    expect(store[key].due).toBe(1000); // scheduling preserved
  });
});

describe('queue ordering by weight (missed-chance:2 + critical:1, desc), then due asc', () => {
  it('surfaces heavier weaknesses first in allQuizItems', () => {
    const store = seedTagged({}, [
      { state: p1, tags: ['blunder'] },                 // weight 0
      { state: p0, tags: ['missed-chance', 'critical'] }, // weight 3
      { state: p2, tags: ['critical'] },                // weight 1
    ], 1000);
    const order = allQuizItems(store).map(i => i.key);
    expect(order).toEqual([encodeForApi(p0), encodeForApi(p2), encodeForApi(p1)]);
  });

  it('carries the card tags onto each QuizItem', () => {
    const store = seedTagged({}, [{ state: p0, tags: ['missed-chance', 'critical'] }], 1000);
    const items = dueQuizItems(store, 2000);
    expect(items).toHaveLength(1);
    expect(new Set(items[0].tags)).toEqual(new Set(['missed-chance', 'critical']));
  });

  it('dueQuizItems excludes cards not yet due', () => {
    const store = seedTagged({}, [{ state: p0, tags: ['blunder'] }], 5000);
    expect(dueQuizItems(store, 1000)).toHaveLength(0);
    expect(dueQuizItems(store, 5000)).toHaveLength(1);
  });
});
