import type { GameState } from '../engine/types';
import { encodeForApi, unpackPosition } from '../engine/board';
import { getDue, upsert, type SrsCard, type SrsStore } from './srs';

// A single quiz position to solve. `state` is normalized to black-to-move so the
// learner always solves from the same orientation regardless of the original turn.
export interface QuizItem {
  state: GameState;
  key: string;      // encodeForApi(state) — also the SRS card key
  tags?: string[];  // carried over from the SrsCard (kind + severity, see srs.ts)
}

export interface TaggedPosition {
  state: GameState;
  tags?: string[];
}

// Register positions into the SRS store (box 0, due now) if absent, tagging each with
// its `tags`. Already-registered positions get their tags union-merged instead
// (scheduling state preserved — see upsert() for the full rationale). The key is the
// normalized engine position, so duplicate positions across games/analyses collapse
// to one card whose tags accumulate (e.g. flagged as both a blunder and a missed
// chance across two different games ends up carrying both kind tags).
export function seedTagged(store: SrsStore, entries: TaggedPosition[], now = Date.now()): SrsStore {
  let next = store;
  for (const { state, tags } of entries) next = upsert(next, encodeForApi(state), now, tags);
  return next;
}

// Reconstruct a QuizItem from an SRS card. Each key is a normalized (black-to-move)
// engine position, so we rebuild it with the 'b' turn marker.
function itemFromCard(card: SrsCard): QuizItem | null {
  const state = unpackPosition(card.key + 'b');
  return state ? { state, key: card.key, tags: card.tags } : null;
}

// Priority weight for queue ordering: missed-chance and critical cards surface first.
// Untagged cards (pre-tagging history, or ordinary registrations) weigh 0.
function weight(tags?: string[]): number {
  let w = 0;
  if (tags?.includes('missed-chance')) w += 2;
  if (tags?.includes('critical')) w += 1;
  return w;
}

// weight descending (heavier weaknesses first), due ascending as tiebreak (more
// overdue first among equal-weight cards).
function byWeightThenDue(a: SrsCard, b: SrsCard): number {
  return weight(b.tags) - weight(a.tags) || a.due - b.due;
}

// Build the queue of currently-due quiz positions. The due<=now filter is unchanged
// (getDue); only the resulting order is re-prioritized by weight.
export function dueQuizItems(store: SrsStore, now = Date.now()): QuizItem[] {
  const items: QuizItem[] = [];
  for (const card of getDue(store, now).sort(byWeightThenDue)) {
    const item = itemFromCard(card);
    if (item) items.push(item);
  }
  return items;
}

// Build a queue of ALL registered positions regardless of due date, ordered by
// weight then due ascending (heavier weaknesses first, most overdue among equals).
// Used by "全表示モード".
export function allQuizItems(store: SrsStore): QuizItem[] {
  const items: QuizItem[] = [];
  for (const card of Object.values(store).sort(byWeightThenDue)) {
    const item = itemFromCard(card);
    if (item) items.push(item);
  }
  return items;
}
