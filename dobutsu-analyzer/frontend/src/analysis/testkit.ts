// Shared unit-test helpers for the analysis/quiz suites. Not a *.test.ts file
// (it holds no tests), so it is excluded from coverage — see vite.config.ts
// `coverage.exclude` and sonar-project.properties `sonar.coverage.exclusions`.
// Consolidated here so the API-frame conversion isn't duplicated across test
// files (which would trip SonarQube's duplicated-lines gate).
import { legalMoves, moveFromApiNotation } from '../engine/board';
import { isBoardMove, LION, type GameState, type Move } from '../engine/types';
import type { MoveEval, WdlResult } from '../api/client';

const COL_FLIP: Record<string, string> = { A: 'C', B: 'B', C: 'A' };
const ROW_FLIP: Record<string, string> = { '1': '4', '2': '3', '3': '2', '4': '1' };

// True when two board-moves share from/to coordinates.
export const coordsEqual = (a: Move | undefined, b: Move) =>
  !!a && isBoardMove(a) && isBoardMove(b) &&
  a.from[0] === b.from[0] && a.from[1] === b.from[1] && a.to[0] === b.to[0] && a.to[1] === b.to[1];

// The engine's board-frame notation differs from the API frame by a column flip
// (A/C) for black-to-move and a full 180° rotation (column + row) for
// white-to-move. Rather than track which, brute-force the four transforms and
// keep whichever round-trips through moveFromApiNotation.
export function toApiMv(m: Move, at: GameState): string {
  const raw = m.notation.slice(0, 4);
  const col = (s: string) => `${COL_FLIP[s[0]]}${s[1]}${COL_FLIP[s[2]]}${s[3]}`;
  const row = (s: string) => `${s[0]}${ROW_FLIP[s[1]]}${s[2]}${ROW_FLIP[s[3]]}`;
  for (const cand of [raw, col(raw), row(raw), col(row(raw))]) {
    if (coordsEqual(moveFromApiNotation(cand, at), m)) return cand;
  }
  throw new Error(`no API-frame notation for ${m.notation}`);
}

// All legal moves of `pos` as MoveEval candidates with a fixed result.
export const movesOf = (pos: GameState, result: WdlResult = 'lose'): MoveEval[] =>
  legalMoves(pos).map(m => ({ mv: toApiMv(m, pos), result, dtm: 1 }));

// A synthetic terminal position: white lion captured → checkWinner === 'black'.
const emptyBoard = () => Array.from({ length: 3 }, () => [0, 0, 0, 0]);
export const terminalBlackWin: GameState = {
  board: (() => { const b = emptyBoard(); b[1][3] = LION; return b; })(),
  hand: { black: [0, 0, 0], white: [0, 0, 0] }, turn: 'white', history: [],
};
