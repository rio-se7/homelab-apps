import {
  EMPTY, BABY, ELEPHANT, GIRAFFE, CHICKEN, LION,
  GameState, Move, BoardMove, DropMove, MoveRecord,
} from './types';

// 方向ベクトル (dx, dy) — Rust board.rs と同一
// dy<0: 後手側(y=0), dy>0: 先手側(y=3)
const DIRS: [number, number][] = [
  [1, -1], [0, -1], [-1, -1],
  [1,  0],          [-1,  0],
  [1,  1], [0,  1], [-1,  1],
];

// 駒種ごとの移動方向ビットマスク (index = pieceType - 1)
const CAN_MOVE = [0x02, 0xa5, 0x5a, 0x5f, 0xff];

function colChar(x: number): string { return 'CBA'[x]; }
function rowChar(y: number): string { return String(y + 1); }
function pieceChar(p: number): string {
  return ['', 'P', 'E', 'G', 'C', 'L'][p] ?? '?';
}

export function initialState(): GameState {
  const board: number[][] = Array.from({ length: 3 }, () => new Array(4).fill(EMPTY));
  // 後手 (WHITE = 負値)
  board[0][0] = -ELEPHANT; // C1
  board[1][0] = -LION;     // B1
  board[2][0] = -GIRAFFE;  // A1
  board[1][1] = -BABY;     // B2
  // 先手 (BLACK = 正値)
  board[1][2] = BABY;      // B3
  board[0][3] = GIRAFFE;   // C4
  board[1][3] = LION;      // B4
  board[2][3] = ELEPHANT;  // A4
  return {
    board,
    hand: { black: [0, 0, 0], white: [0, 0, 0] },
    turn: 'black',
    history: [],
  };
}

// 先手の合法手を生成 (board は常に先手視点)
function legalMovesForBlack(state: GameState): Move[] {
  const { board, hand } = state;
  const moves: Move[] = [];

  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 4; y++) {
      const p = board[x][y];
      if (p <= 0) continue; // 空 or 後手駒
      const ptype = p - 1;
      for (let d = 0; d < 8; d++) {
        if ((CAN_MOVE[ptype] & (1 << d)) === 0) continue;
        const [dx, dy] = DIRS[d];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= 3 || ny < 0 || ny >= 4) continue;
        if (board[nx][ny] > 0) continue; // 自駒
        const notation = `${colChar(x)}${rowChar(y)}${colChar(nx)}${rowChar(ny)}`;
        moves.push({ from: [x, y], to: [nx, ny], notation } as BoardMove);
      }
    }
  }

  // 打ち駒
  for (let pt = BABY; pt <= GIRAFFE; pt++) {
    if (hand.black[pt - 1] === 0) continue;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 3; x++) {
        if (board[x][y] !== EMPTY) continue;
        const notation = `${pieceChar(pt)}*${colChar(x)}${rowChar(y)}`;
        moves.push({ piece: pt, to: [x, y], notation } as DropMove);
      }
    }
  }

  return moves;
}

export function legalMoves(state: GameState): Move[] {
  if (state.turn === 'black') return legalMovesForBlack(state);
  // 後手の手: rotate→先手手生成→結果をそのまま返す
  return legalMovesForBlack(rotateState(state));
}

// 着手を適用して新しい GameState を返す
export function applyMove(state: GameState, move: Move): GameState {
  const board = state.board.map(col => [...col]);
  const hand = {
    black: [...state.hand.black],
    white: [...state.hand.white],
  };

  const isBlack = state.turn === 'black';

  if ('from' in move) {
    const [fx, fy] = move.from;
    const [tx, ty] = move.to;
    const piece = board[fx][fy];
    const captured = board[tx][ty];

    // 取り: 持ち駒に加える (にわとり→ひよこに戻す)
    if (captured !== EMPTY) {
      const capType = Math.min(Math.abs(captured), GIRAFFE); // CHICKEN→BABY
      if (isBlack) hand.black[capType - 1]++;
      else hand.white[capType - 1]++;
    }

    board[fx][fy] = EMPTY;
    // 成り: ひよこが相手陣1段目へ
    const promote = Math.abs(piece) === BABY && (isBlack ? ty === 0 : ty === 3);
    const newPiece = promote
      ? (isBlack ? CHICKEN : -CHICKEN)
      : piece;
    board[tx][ty] = newPiece;
  } else {
    const [tx, ty] = move.to;
    const pt = (move as DropMove).piece;
    if (isBlack) {
      hand.black[pt - 1]--;
      board[tx][ty] = pt;
    } else {
      hand.white[pt - 1]--;
      board[tx][ty] = -pt;
    }
  }

  const record: MoveRecord = { notation: move.notation, to: move.to };
  if ('from' in move) record.from = move.from;

  return {
    board,
    hand,
    turn: state.turn === 'black' ? 'white' : 'black',
    history: [...state.history, record],
  };
}

// 勝利判定: ライオンを取ったか、トライ成功か
export function checkWinner(state: GameState, lastMove: Move | null): 'black' | 'white' | null {
  // ライオンが盤上にいるか確認
  let blackLion = false, whiteLion = false;
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 4; y++) {
      if (state.board[x][y] === LION) blackLion = true;
      if (state.board[x][y] === -LION) whiteLion = true;
    }
  }
  if (!whiteLion) return 'black';
  if (!blackLion) return 'white';

  // トライ: 先手ライオンが1段目(y=0)に到達
  for (let x = 0; x < 3; x++) {
    if (state.board[x][0] === LION) return 'black';
    if (state.board[x][3] === -LION) return 'white';
  }

  return null;
}

// 後手視点に回転 (rotate_change_turn)
function rotateState(state: GameState): GameState {
  const board: number[][] = Array.from({ length: 3 }, () => new Array(4).fill(EMPTY));
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 4; y++) {
      const p = state.board[2 - x][3 - y];
      board[x][y] = p !== EMPTY ? -p : EMPTY;
    }
  }
  return {
    board,
    hand: { black: [...state.hand.white], white: [...state.hand.black] },
    turn: state.turn === 'black' ? 'white' : 'black',
    history: state.history,
  };
}

// API 用 pos パラメータ生成 (田中先生エンコーディング + normalize)
export function encodeForApi(state: GameState): string {
  const s = state.turn === 'black' ? state : rotateState(state);
  const packed = pack(s);
  const flipped = pack({ ...s, board: flipBoard(s.board) });
  const normalized = packed < flipped ? packed : flipped;
  return normalized.toString(16).padStart(16, '0');
}

function pack(state: GameState): bigint {
  let ret = 0n;
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 4; y++) {
      const nibble = BigInt(state.board[x][y] & 0xF);
      ret |= nibble << BigInt((x * 4 + y) * 4);
    }
  }
  for (let j = 0; j < 3; j++) {
    ret |= BigInt(state.hand.black[j]) << BigInt(48 + j * 2);
    ret |= BigInt(state.hand.white[j]) << BigInt(54 + j * 2);
  }
  return ret;
}

function flipBoard(board: number[][]): number[][] {
  return [board[2], board[1], board[0]]; // x=0↔x=2
}
