import { describe, it, expect } from 'vitest';
import { upsert, review, getDue, stats, INTERVALS_DAYS, type SrsStore } from './srs';

const KEY = '0000200d51fb300e'; // normalized initial position hex (arbitrary valid key)

describe('upsert', () => {
  it('creates a new card at box 0, due now, with deduped tags', () => {
    const store = upsert({}, KEY, 1000, ['blunder', 'major', 'blunder']);
    expect(store[KEY]).toEqual({
      key: KEY, box: 0, due: 1000, correct: 0, wrong: 0, tags: ['blunder', 'major'],
    });
  });

  it('is a no-op (same reference) when key exists and no tags given', () => {
    const store = upsert({}, KEY, 1000);
    expect(upsert(store, KEY, 2000)).toBe(store);
  });

  it('union-merges tags on an existing card while preserving scheduling state', () => {
    let store = upsert({}, KEY, 1000, ['blunder', 'major']);
    store = review(store, KEY, true, 1000); // box→1, correct→1, due advances
    const scheduled = store[KEY];
    store = upsert(store, KEY, 9999, ['missed-chance', 'critical']);
    const card = store[KEY];
    expect(new Set(card.tags)).toEqual(new Set(['blunder', 'major', 'missed-chance', 'critical']));
    // scheduling untouched (re-registration never resets learning progress)
    expect(card.box).toBe(scheduled.box);
    expect(card.due).toBe(scheduled.due);
    expect(card.correct).toBe(scheduled.correct);
    expect(card.wrong).toBe(scheduled.wrong);
  });
});

describe('review', () => {
  it('advances the box (capped at 4) and schedules by Leitner interval on correct', () => {
    let store: SrsStore = upsert({}, KEY, 0);
    store = review(store, KEY, true, 0);
    expect(store[KEY].box).toBe(1);
    expect(store[KEY].correct).toBe(1);
    expect(store[KEY].due).toBe(INTERVALS_DAYS[1] * 86_400_000);
  });

  it('resets the box to 0 and increments wrong on an incorrect answer', () => {
    let store: SrsStore = upsert({}, KEY, 0);
    store = review(store, KEY, true, 0);  // box 1
    store = review(store, KEY, true, 0);  // box 2
    store = review(store, KEY, false, 0); // reset
    expect(store[KEY].box).toBe(0);
    expect(store[KEY].wrong).toBe(1);
    expect(store[KEY].correct).toBe(2);
  });

  it('caps the box at 4 no matter how many correct answers', () => {
    let store: SrsStore = upsert({}, KEY, 0);
    for (let i = 0; i < 10; i++) store = review(store, KEY, true, 0);
    expect(store[KEY].box).toBe(4);
  });
});

describe('getDue / stats', () => {
  it('returns only cards due at or before now, sorted by due ascending', () => {
    const store: SrsStore = {
      a: { key: 'a', box: 0, due: 100, correct: 0, wrong: 0 },
      b: { key: 'b', box: 0, due: 50, correct: 0, wrong: 0 },
      c: { key: 'c', box: 0, due: 999, correct: 0, wrong: 0 },
    };
    expect(getDue(store, 100).map(c => c.key)).toEqual(['b', 'a']);
  });

  it('counts totals, due, and per-box distribution', () => {
    const store: SrsStore = {
      a: { key: 'a', box: 0, due: 0, correct: 0, wrong: 0 },
      b: { key: 'b', box: 4, due: Number.MAX_SAFE_INTEGER, correct: 0, wrong: 0 },
    };
    const s = stats(store);
    expect(s.total).toBe(2);
    expect(s.due).toBe(1);
    expect(s.boxes[0]).toBe(1);
    expect(s.boxes[4]).toBe(1);
  });
});
