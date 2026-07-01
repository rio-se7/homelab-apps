import type { GameState } from '../engine/types';
import { encodeForApi, unpackPosition } from '../engine/board';
import { getDue, upsert, type SrsCard, type SrsStore } from './srs';

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

// Reconstruct a QuizItem from an SRS card. Each key is a normalized (black-to-move)
// engine position, so we rebuild it with the 'b' turn marker.
function itemFromCard(card: SrsCard): QuizItem | null {
  const state = unpackPosition(card.key + 'b');
  return state ? { state, key: card.key } : null;
}

// Build the queue of currently-due quiz positions.
export function dueQuizItems(store: SrsStore, now = Date.now()): QuizItem[] {
  const items: QuizItem[] = [];
  for (const card of getDue(store, now)) {
    const item = itemFromCard(card);
    if (item) items.push(item);
  }
  return items;
}

// Build a queue of ALL registered positions regardless of due date, ordered by
// due ascending (most overdue first) so weaker cards lead. Used by "全表示モード".
export function allQuizItems(store: SrsStore): QuizItem[] {
  const items: QuizItem[] = [];
  for (const card of Object.values(store).sort((a, b) => a.due - b.due)) {
    const item = itemFromCard(card);
    if (item) items.push(item);
  }
  return items;
}
