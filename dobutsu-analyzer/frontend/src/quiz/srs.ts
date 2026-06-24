export interface SrsCard {
  key: string;     // position key = encodeForApi(state) hex (normalized; dup positions merge)
  box: number;     // 0..4
  due: number;     // epoch ms when next due
  correct: number; // lifetime correct count
  wrong: number;   // lifetime wrong count
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

// Add a card at box 0 (due now) if absent; returns a NEW store object (immutable update). No-op if key exists.
export function upsert(store: SrsStore, key: string, now?: number): SrsStore {
  if (key in store) return store;
  const ts = now ?? Date.now();
  const card: SrsCard = { key, box: 0, due: ts, correct: 0, wrong: 0 };
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
