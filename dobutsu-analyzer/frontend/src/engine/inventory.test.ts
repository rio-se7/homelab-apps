import { describe, it, expect } from 'vitest';
import { initialState } from './board';
import {
  usedCount, remaining, remainingForPalette, lionCount, capsRespected, checkInventory,
} from './inventory';
import { BABY, CHICKEN, ELEPHANT, GIRAFFE, LION, EMPTY, type GameState } from './types';

// Apply setup-mode style board edits: [x, y, piece].
function edit(state: GameState, ...edits: [number, number, number][]): GameState {
  const board = state.board.map(col => [...col]);
  for (const [x, y, p] of edits) board[x][y] = p;
  return { ...state, board };
}

const init = initialState();

describe('inventory counting', () => {
  it('counts the initial position as complete', () => {
    expect(usedCount(init, BABY)).toBe(2);
    expect(usedCount(init, ELEPHANT)).toBe(2);
    expect(usedCount(init, GIRAFFE)).toBe(2);
    expect(lionCount(init, 'black')).toBe(1);
    expect(lionCount(init, 'white')).toBe(1);
    expect(checkInventory(init)).toEqual({ ok: true, errors: [] });
  });

  it('counts a hen as the chick it reverts to', () => {
    // 先手のひな (B3) を にわとり に置き換えても在庫は変わらない
    const withHen = edit(init, [1, 2, CHICKEN]);
    expect(usedCount(withHen, BABY)).toBe(2);
    expect(checkInventory(withHen).ok).toBe(true);
  });

  it('counts pieces held in hand', () => {
    const boardOnly = edit(init, [1, 2, EMPTY]);
    expect(usedCount(boardOnly, BABY)).toBe(1);
    const inHand: GameState = { ...boardOnly, hand: { black: [1, 0, 0], white: [0, 0, 0] } };
    expect(usedCount(inHand, BABY)).toBe(2);
    expect(checkInventory(inHand).ok).toBe(true);
  });

  it('reports remaining pieces per type and per palette entry', () => {
    expect(remaining(init, BABY)).toBe(0);
    expect(remainingForPalette(init, BABY)).toBe(0);
    expect(remainingForPalette(init, LION)).toBe(0);
    expect(remainingForPalette(init, -LION)).toBe(0);

    const erased = edit(init, [1, 1, EMPTY]); // 後手のひなを消去
    expect(remaining(erased, BABY)).toBe(1);
    expect(remainingForPalette(erased, -BABY)).toBe(1);
    expect(remainingForPalette(erased, CHICKEN)).toBe(1); // にわとりもひな在庫を消費する

    const noWhiteLion = edit(init, [1, 0, EMPTY]);
    expect(remainingForPalette(noWhiteLion, -LION)).toBe(1);
    expect(remainingForPalette(noWhiteLion, LION)).toBe(0);
  });
});

describe('checkInventory', () => {
  it('rejects an extra piece', () => {
    const extra = edit(init, [0, 1, BABY]); // 先手のひなを1枚追加
    const result = checkInventory(extra);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('3枚');
  });

  it('rejects a missing piece', () => {
    const missing = edit(init, [1, 1, EMPTY]);
    const result = checkInventory(missing);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('1枚です');
  });

  it('rejects a missing or duplicated lion', () => {
    const noLion = edit(init, [1, 0, EMPTY]);
    expect(checkInventory(noLion).ok).toBe(false);
    expect(checkInventory(noLion).errors[0]).toContain('後手');

    const twoBlackLions = edit(init, [0, 2, LION]);
    expect(checkInventory(twoBlackLions).ok).toBe(false);
    expect(checkInventory(twoBlackLions).errors[0]).toContain('先手');
  });

  it('lists every broken type at once', () => {
    const broken = edit(init, [1, 0, EMPTY], [0, 1, GIRAFFE]);
    const result = checkInventory(broken);
    expect(result.errors).toHaveLength(2);
  });
});

describe('capsRespected', () => {
  it('allows shortages but not surpluses', () => {
    expect(capsRespected(init)).toBe(true);
    expect(capsRespected(edit(init, [1, 1, EMPTY]))).toBe(true);       // 不足は編集途中なので許容
    expect(capsRespected(edit(init, [0, 1, BABY]))).toBe(false);       // 3枚目のひな
    expect(capsRespected(edit(init, [0, 2, LION]))).toBe(false);       // 先手ライオン2枚
  });

  it('counts hands against the cap', () => {
    const handSurplus: GameState = { ...init, hand: { black: [1, 0, 0], white: [0, 0, 0] } };
    expect(capsRespected(handSurplus)).toBe(false);
  });
});
