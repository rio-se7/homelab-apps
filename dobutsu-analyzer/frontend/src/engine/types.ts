// 田中先生エンコーディングに合わせた駒定数
// BLACK (先手): 正値, WHITE (後手): 負値
export const EMPTY = 0;
export const BABY = 1;      // ひよこ
export const ELEPHANT = 2;  // ぞう
export const GIRAFFE = 3;   // きりん
export const CHICKEN = 4;   // にわとり
export const LION = 5;      // ライオン

export type Piece = -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5;
export type Player = 'black' | 'white';

// board[x][y]: x=0(C列)..2(A列), y=0(1段後手陣)..3(4段先手陣)
export interface GameState {
  board: number[][];
  hand: { black: number[]; white: number[] }; // index = pieceType-1 (BABY=0,ELEPHANT=1,GIRAFFE=2)
  turn: Player;
  history: MoveRecord[];
}

export interface MoveRecord {
  notation: string;  // "B4B3" or "P*B3"
  from?: [number, number];
  to: [number, number];
}

export interface BoardMove {
  from: [number, number];
  to: [number, number];
  notation: string;
}

export interface DropMove {
  piece: number;
  to: [number, number];
  notation: string;
}

export type Move = BoardMove | DropMove;

export function isBoardMove(m: Move): m is BoardMove {
  return 'from' in m;
}
