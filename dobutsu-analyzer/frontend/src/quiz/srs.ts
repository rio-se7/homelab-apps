// Flat union of "kind" and "severity" tags. Kept deliberately flat (not
// e.g. { kind, severity } pairs) — see upsert()'s doc comment for the tradeoff.
export type SrsTag = 'missed-chance' | 'blunder' | 'critical' | 'major';

export interface SrsCard {
  key: string;     // position key = encodeForApi(state) hex (normalized; dup positions merge)
  box: number;     // 0..4
  due: number;     // epoch ms when next due
  correct: number; // lifetime correct count
  wrong: number;   // lifetime wrong count
  tags?: string[]; // optional — absent on cards from before tagging existed (back-compat, STORAGE_KEY unchanged)
}

export type SrsStore = Record<string, SrsCard>;

export interface SrsStats {
  total: number;        // number of cards
  due: number;          // number currently due
  boxes: number[];      // length-5 array: count of cards in each box 0..4
}

export const STORAGE_KEY = 'dobutsu-srs-v1';
// Leitner intervals in days, indexed by box (0=same day .. 4=14 days).
export const INTERVALS_DAYS: number[] = [0, 1, 3, 7, 14];

export function loadStore(): SrsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as SrsStore;
  } catch {
    return {};
  }
}

export function saveStore(store: SrsStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota errors
  }
}

// Add a card at box 0 (due now) if absent, tagged with `tags` if given.
// If the key already exists: with no `tags`, this is a no-op (same as before tagging
// existed — returns the same store reference). With `tags`, the existing card's tags
// are union-merged (scheduling state — box/due/correct/wrong — is left untouched, so
// re-registering a position never resets learning progress). Cards are deduped by
// normalized position, so the same position can surface as a blunder in one game and
// a missed chance in another; union-merging is what lets both tags accumulate on one card.
//
// NOTE(flat-union tradeoff): tags is a flat string[] mixing "kind" (missed-chance/
// blunder) and "severity" (critical/major) — there is no structural link recording
// *which* kind a given severity came from once merged (e.g. a card tagged
// {blunder, major, missed-chance, critical} doesn't tell you the blunder was major and
// the missed-chance was critical, only that both occurred at some point). This is an
// accepted simplification: the only consumers are independent membership filters
// ("has missed-chance" / "has critical"), which don't need that pairing.
export function upsert(store: SrsStore, key: string, now?: number, tags?: string[]): SrsStore {
  const ts = now ?? Date.now();
  if (key in store) {
    if (!tags || tags.length === 0) return store; // no-op, preserves pre-tagging behavior
    const existing = store[key];
    const merged = Array.from(new Set([...(existing.tags ?? []), ...tags]));
    return { ...store, [key]: { ...existing, tags: merged } };
  }
  const card: SrsCard = {
    key, box: 0, due: ts, correct: 0, wrong: 0,
    ...(tags && tags.length > 0 ? { tags: Array.from(new Set(tags)) } : {}),
  };
  return { ...store, [key]: card };
}

// Cards with due <= now, sorted by due ascending. now defaults to Date.now().
export function getDue(store: SrsStore, now?: number): SrsCard[] {
  const ts = now ?? Date.now();
  return Object.values(store)
    .filter(c => c.due <= ts)
    .sort((a, b) => a.due - b.due);
}

// Record a review result. Correct → box = min(box+1, 4); wrong → box = 0.
// New due = now + INTERVALS_DAYS[newBox] * 86400_000. Increments correct/wrong.
// If key absent, create it first (box 0) then apply. Returns a NEW store object.
export function review(store: SrsStore, key: string, correct: boolean, now?: number): SrsStore {
  const ts = now ?? Date.now();
  // Ensure card exists
  const base = key in store ? store : upsert(store, key, ts);
  const card = base[key];
  const newBox = correct ? Math.min(card.box + 1, 4) : 0;
  const newDue = ts + INTERVALS_DAYS[newBox] * 86_400_000;
  const updated: SrsCard = {
    ...card,
    box: newBox,
    due: newDue,
    correct: correct ? card.correct + 1 : card.correct,
    wrong: correct ? card.wrong : card.wrong + 1,
  };
  return { ...base, [key]: updated };
}

export function stats(store: SrsStore): SrsStats {
  const now = Date.now();
  const cards = Object.values(store);
  const boxes = [0, 0, 0, 0, 0];
  let due = 0;
  for (const c of cards) {
    const box = typeof c.box === 'number' && c.box >= 0 && c.box <= 4 ? c.box : 0;
    boxes[box]++;
    if (c.due <= now) due++;
  }
  return { total: cards.length, due, boxes };
}
