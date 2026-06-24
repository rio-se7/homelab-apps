import type { GameState } from '../engine/types';
import { encodeForApi, unpackPosition } from '../engine/board';
import { getDue, upsert, type SrsStore } from './srs';

// A single quiz position to solve. `state` is normalized to black-to-move so the
// learner always solves from the same orientation regardless of the original turn.
export interface QuizItem {
  state: GameState;
  key: string; // encodeForApi(state) — also the SRS card key
}

// Register positions into the SRS store (box 0, due now) if absent. The key is the
// normalized engine position, so duplicate positions across games collapse to one card.
export function seedPositions(store: SrsStore, states: GameState[], now = Date.now()): SrsStore {
  let next = store;
  for (const s of states) next = upsert(next, encodeForApi(s), now);
  return next;
}

// Build the queue of currently-due quiz positions. Each SRS key is a normalized
// (black-to-move) engine position, so we reconstruct it with the 'b' turn marker.
export function dueQuizItems(store: SrsStore, now = Date.now()): QuizItem[] {
  const items: QuizItem[] = [];
  for (const card of getDue(store, now)) {
    const state = unpackPosition(card.key + 'b');
    if (state) items.push({ state, key: card.key });
  }
  return items;
}
