import {
  EMPTY, BABY, ELEPHANT, GIRAFFE, CHICKEN, LION,
  type GameState, type Move, type BoardMove, type DropMove, type MoveRecord,
  isBoardMove,
} from './types';

// 方向ベクトル (dx, dy) — Rust board.rs と同一
const DIRS: [number, number][] = [
  [1, -1], [0, -1], [-1, -1],
  [1,  0],          [-1,  0],
  [1,  1], [0,  1], [-1,  1],
];

const CAN_MOVE = [0x02, 0xa5, 0x5a, 0x5f, 0xff];

function colChar(x: number): string { return 'CBA'[x]; }
function rowChar(y: number): string { return String(y + 1); }
function pieceChar(p: number): string {
  return ['', 'P', 'E', 'G', 'C', 'L'][p] ?? '?';
}

// ──────────────────────────────────────────────────────────
// 将棋風表記変換
// raw notation:
//   盤上: "B3B2P" or "B3B1P+" (src2 + dst2 + pieceChar + 成り?)
//   打ち: "P*B3"               (pieceChar + * + dst2)
// ──────────────────────────────────────────────────────────
const COL_NUM: Record<string, string> = { 'A': '3', 'B': '2', 'C': '1' };
const ROW_KAN: Record<string, string> = { '1': '一', '2': '二', '3': '三', '4': '四' };
const PIECE_JP: Record<string, string> = { 'P': 'ひ', 'E': 'ぞ', 'G': 'き', 'C': 'に', 'L': 'ら' };

// 棋譜用: 座標はそのまま(B3B2)、▲△・打・成だけ付ける
// 例: ▲B2 / △C2ひ打 / ▲B1成
export function toKifuNotation(raw: string, turn: 'black' | 'white'): string {
  const mark = turn === 'black' ? '▲' : '△';
  if (raw.includes('*')) {
    const [pc, dest] = raw.split('*');
    return `${mark}${dest}${PIECE_JP[pc] ?? pc}打`;
  }
  const promoted = raw[5] === '+';
  const pc = PIECE_JP[raw[4]] ?? '';
  return `${mark}${raw.slice(2, 4)}${pc}${promoted ? '成' : ''}`;
}

export function toShogiNotation(raw: string, turn: 'black' | 'white'): string {
  const mark = turn === 'black' ? '▲' : '△';
  if (raw.includes('*')) {
    const [pc, dest] = raw.split('*');
    return `${mark}${COL_NUM[dest[0]] ?? dest[0]}${ROW_KAN[dest[1]] ?? dest[1]}${PIECE_JP[pc] ?? pc}打`;
  }
  const promoted = raw[5] === '+';
  const pc = PIECE_JP[raw[4]] ?? '?';
  const col = COL_NUM[raw[2]] ?? raw[2];
  const row = ROW_KAN[raw[3]] ?? raw[3];
  return `${mark}${col}${row}${pc}${promoted ? '成' : ''}`;
}

// API レスポンスの mv をオリジナルフレームに逆変換してキフ表記を返す
export function apiMoveToKifu(apiMv: string, state: GameState): string {
  const mv = denormalizeApiMove(apiMv, state);
  const mark = state.turn === 'black' ? '▲' : '△';
  if (mv.includes('*')) {
    const [pc, dest] = mv.split('*');
    return `${mark}${dest}${PIECE_JP[pc] ?? pc}打`;
  }
  const COL_X: Record<string, number> = { 'A': 2, 'B': 1, 'C': 0 };
  const sx = COL_X[mv[0]], sy = parseInt(mv[1]) - 1;
  const piece = Math.abs(state.board[sx]?.[sy] ?? 0);
  const pc = PIECE_JP[pieceChar(piece)] ?? '';
  return `${mark}${mv.slice(2, 4)}${pc}`;
}

// API レスポンスの手表記 ("B4B3" or "P*B3") を将棋風に変換
// board: 現在の盤面状態（駒名取得用）、isBlackMove: 先手の手かどうか
export function apiMoveToShogi(mv: string, board: number[][], isBlackMove: boolean): string {
  const mark = isBlackMove ? '▲' : '△';
  const COL_X: Record<string, number> = { 'A': 2, 'B': 1, 'C': 0 };
  const ROW_Y: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3 };
  if (mv.includes('*')) {
    const [pc, dest] = mv.split('*');
    return `${mark}${COL_NUM[dest[0]] ?? dest[0]}${ROW_KAN[dest[1]] ?? dest[1]}${PIECE_JP[pc] ?? pc}打`;
  }
  // 盤上の手: APIのnotationは正規化後(current player視点)
  // 先手の手なら盤面からそのまま取得、後手の手は回転座標
  const sx = COL_X[mv[0]], sy = ROW_Y[mv[1]];
  let piece = 0;
  if (isBlackMove) {
    piece = Math.abs(board[sx]?.[sy] ?? 0);
  } else {
    // 後手の手: API座標は後手視点(回転後)なので元座標に戻す
    piece = Math.abs(board[2 - sx]?.[3 - sy] ?? 0);
  }
  const pc = PIECE_JP[pieceChar(piece)] ?? '?';
  return `${mark}${COL_NUM[mv[2]] ?? mv[2]}${ROW_KAN[mv[3]] ?? mv[3]}${pc}`;
}

export function initialState(): GameState {
  const board: number[][] = Array.from({ length: 3 }, () => new Array(4).fill(EMPTY));
  board[0][0] = -ELEPHANT; // C1
  board[1][0] = -LION;     // B1
  board[2][0] = -GIRAFFE;  // A1
  board[1][1] = -BABY;     // B2
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

function legalMovesForBlack(state: GameState): Move[] {
  const { board, hand } = state;
  const moves: Move[] = [];

  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 4; y++) {
      const p = board[x][y];
      if (p <= 0) continue;
      const ptype = p - 1;
      for (let d = 0; d < 8; d++) {
        if ((CAN_MOVE[ptype] & (1 << d)) === 0) continue;
        const [dx, dy] = DIRS[d];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= 3 || ny < 0 || ny >= 4) continue;
        if (board[nx][ny] > 0) continue;
        const promote = p === BABY && ny === 0;
        // raw notation: src + dst + pieceChar + '+'(成り)
        const notation = `${colChar(x)}${rowChar(y)}${colChar(nx)}${rowChar(ny)}${pieceChar(p)}${promote ? '+' : ''}`;
        moves.push({ from: [x, y], to: [nx, ny], notation } as BoardMove);
      }
    }
  }

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
  const moves = legalMovesForBlack(rotateState(state));
  return moves.map(m => {
    if ('from' in m) {
      const from: [number, number] = [2 - m.from[0], 3 - m.from[1]];
      const to: [number, number] = [2 - m.to[0], 3 - m.to[1]];
      // notationのsrc/dstを変換、駒情報(char4以降)はそのまま
      const suffix = m.notation.slice(4);
      const notation = `${'CBA'[from[0]]}${from[1] + 1}${'CBA'[to[0]]}${to[1] + 1}${suffix}`;
      return { from, to, notation } as BoardMove;
    }
    const to: [number, number] = [2 - m.to[0], 3 - m.to[1]];
    const notation = `${m.notation[0]}*${'CBA'[to[0]]}${to[1] + 1}`;
    return { ...m, to, notation } as DropMove;
  });
}

export function applyMove(state: GameState, move: Move): GameState {
  const board = state.board.map(col => [...col]);
  const hand = { black: [...state.hand.black], white: [...state.hand.white] };
  const isBlack = state.turn === 'black';

  if ('from' in move) {
    const [fx, fy] = move.from;
    const [tx, ty] = move.to;
    const piece = board[fx][fy];
    const captured = board[tx][ty];
    if (captured !== EMPTY) {
      const capType = Math.abs(captured) === CHICKEN ? BABY : Math.abs(captured); // 鶏→雛に戻す
      if (isBlack) hand.black[capType - 1]++;
      else hand.white[capType - 1]++;
    }
    board[fx][fy] = EMPTY;
    const promote = Math.abs(piece) === BABY && (isBlack ? ty === 0 : ty === 3);
    board[tx][ty] = promote ? (isBlack ? CHICKEN : -CHICKEN) : piece;
  } else {
    const [tx, ty] = move.to;
    const pt = (move as DropMove).piece;
    if (isBlack) { hand.black[pt - 1]--; board[tx][ty] = pt; }
    else { hand.white[pt - 1]--; board[tx][ty] = -pt; }
  }

  const record: MoveRecord = { notation: move.notation, to: move.to, turn: state.turn };
  if ('from' in move) record.from = move.from;

  return {
    board, hand,
    turn: state.turn === 'black' ? 'white' : 'black',
    history: [...state.history, record],
  };
}

export function checkWinner(state: GameState, _lastMove: Move | null): 'black' | 'white' | null {
  let blackLion = false, whiteLion = false;
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 4; y++) {
      if (state.board[x][y] === LION) blackLion = true;
      if (state.board[x][y] === -LION) whiteLion = true;
    }
  }
  if (!whiteLion) return 'black';
  if (!blackLion) return 'white';

  const opMoves = legalMoves(state);
  for (let x = 0; x < 3; x++) {
    if (state.board[x][0] === LION) {
      if (!opMoves.some(m => m.to[0] === x && m.to[1] === 0)) return 'black';
    }
    if (state.board[x][3] === -LION) {
      if (!opMoves.some(m => m.to[0] === x && m.to[1] === 3)) return 'white';
    }
  }
  return null;
}

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

export function encodeForApi(state: GameState): string {
  const s = state.turn === 'black' ? state : rotateState(state);
  const packed = pack(s);
  const flipped = pack({ ...s, board: flipBoard(s.board) });
  const normalized = packed < flipped ? packed : flipped;
  return normalized.toString(16).padStart(16, '0');
}

// API の mv は encodeForApi が適用した変換（後手→回転、正規化→A↔C flip）済みのフレームで返ってくる。
// 表示・着手探索に使う前にオリジナルフレームへ逆変換する。
export function denormalizeApiMove(apiMv: string, state: GameState): string {
  const s = state.turn === 'white' ? rotateState(state) : state;
  const wasFlipped = pack({ ...s, board: flipBoard(s.board) }) < pack(s);

  const fc = (c: string) => c === 'A' ? 'C' : c === 'C' ? 'A' : c;
  const COL = 'CBA';
  const COL_X: Record<string, number> = { 'A': 2, 'B': 1, 'C': 0 };

  // 1. A↔C flip を逆算
  let mv = wasFlipped
    ? (apiMv.includes('*')
        ? `${apiMv[0]}*${fc(apiMv[2])}${apiMv.slice(3)}`
        : `${fc(apiMv[0])}${apiMv[1]}${fc(apiMv[2])}${apiMv.slice(3)}`)
    : apiMv;

  // 2. 後手の場合は 180° 回転を逆算
  if (state.turn === 'white') {
    if (mv.includes('*')) {
      const tx = COL_X[mv[2]], ty = parseInt(mv[3]) - 1;
      mv = `${mv[0]}*${COL[2 - tx]}${4 - ty}`;
    } else {
      const sx = COL_X[mv[0]], sy = parseInt(mv[1]) - 1;
      const dx = COL_X[mv[2]], dy = parseInt(mv[3]) - 1;
      mv = `${COL[2 - sx]}${4 - sy}${COL[2 - dx]}${4 - dy}`;
    }
  }

  return mv;
}

// API の mv をオリジナルフレームの Move オブジェクトに変換する
export function moveFromApiNotation(apiMv: string, state: GameState): Move | undefined {
  const mv = denormalizeApiMove(apiMv, state);
  const COL_X: Record<string, number> = { 'A': 2, 'B': 1, 'C': 0 };
  const moves = legalMoves(state);

  if (mv.includes('*')) {
    const PIECE: Record<string, number> = { 'P': BABY, 'E': ELEPHANT, 'G': GIRAFFE };
    const tx = COL_X[mv[2]], ty = parseInt(mv[3]) - 1;
    const pt = PIECE[mv[0]];
    return moves.find(m => !isBoardMove(m) && (m as DropMove).piece === pt && m.to[0] === tx && m.to[1] === ty);
  }
  const fx = COL_X[mv[0]], fy = parseInt(mv[1]) - 1;
  const tx = COL_X[mv[2]], ty = parseInt(mv[3]) - 1;
  return moves.find(m => isBoardMove(m) && m.from[0] === fx && m.from[1] === fy && m.to[0] === tx && m.to[1] === ty);
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
  return [board[2], board[1], board[0]];
}

function linearPos(x: number, y: number): number { return y * 3 + x; }

const NOTATION_TO_PT: Record<string, number> = { 'P': BABY, 'E': ELEPHANT, 'G': GIRAFFE };

// 棋譜を位置エンコード(17文字) + Base64url(1手=1バイト) でエンコード
// バイト値: 盤上移動 = from_linear*12 + to_linear (0-143)
//          打ち駒   = 144 + (pt-1)*12 + to_linear (144-179)
export function encodeKifu(startState: GameState, moves: MoveRecord[]): string {
  const pos = packPosition(startState);
  if (moves.length === 0) return pos;
  const bytes = moves.map(rec => {
    if (rec.from !== undefined) {
      return linearPos(rec.from[0], rec.from[1]) * 12 + linearPos(rec.to[0], rec.to[1]);
    }
    const pt = NOTATION_TO_PT[rec.notation[0]] ?? BABY;
    return 144 + (pt - 1) * 12 + linearPos(rec.to[0], rec.to[1]);
  });
  return pos + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// encodeKifu の逆変換。不正な文字列なら null を返す
export function decodeKifu(encoded: string): { startState: GameState; states: GameState[] } | null {
  if (encoded.length < 17) return null;
  const startState = unpackPosition(encoded.slice(0, 17));
  if (!startState) return null;

  const states: GameState[] = [startState];
  if (encoded.length === 17) return { startState, states };

  const b64 = encoded.slice(17);
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  let bytes: number[];
  try {
    bytes = Array.from(atob(padded.replace(/-/g, '+').replace(/_/g, '/'))).map(c => c.charCodeAt(0));
  } catch {
    return null;
  }

  let state = startState;
  for (const byte of bytes) {
    if (byte > 179) return null;
    const moves = legalMoves(state);
    let move: Move | undefined;
    if (byte < 144) {
      const from: [number, number] = [Math.floor(byte / 12) % 3, Math.floor(Math.floor(byte / 12) / 3)];
      const to: [number, number] = [(byte % 12) % 3, Math.floor((byte % 12) / 3)];
      move = moves.find(m => isBoardMove(m) && m.from[0] === from[0] && m.from[1] === from[1] && m.to[0] === to[0] && m.to[1] === to[1]);
    } else {
      const d = byte - 144;
      const to: [number, number] = [(d % 12) % 3, Math.floor((d % 12) / 3)];
      const pt = Math.floor(d / 12) + 1;
      move = moves.find(m => !isBoardMove(m) && (m as DropMove).piece === pt && m.to[0] === to[0] && m.to[1] === to[1]);
    }
    if (!move) return null;
    state = applyMove(state, move);
    states.push(state);
  }

  return { startState, states };
}

// 局面を17文字の文字列にエンコード (16hex + 'b'|'w' for turn)
export function packPosition(state: GameState): string {
  return pack(state).toString(16).padStart(16, '0') + (state.turn === 'white' ? 'w' : 'b');
}

// packPosition の逆変換。不正な文字列なら null を返す
export function unpackPosition(encoded: string): GameState | null {
  if (encoded.length !== 17) return null;
  const turnChar = encoded[16];
  if (turnChar !== 'b' && turnChar !== 'w') return null;
  const turn: 'black' | 'white' = turnChar === 'w' ? 'white' : 'black';
  let val: bigint;
  try { val = BigInt('0x' + encoded.slice(0, 16)); } catch { return null; }
  const board: number[][] = Array.from({ length: 3 }, () => new Array(4).fill(0));
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 4; y++) {
      const nibble = Number((val >> BigInt((x * 4 + y) * 4)) & 0xFn);
      board[x][y] = nibble >= 8 ? nibble - 16 : nibble;
    }
  }
  const hand = { black: [0, 0, 0], white: [0, 0, 0] };
  for (let j = 0; j < 3; j++) {
    hand.black[j] = Number((val >> BigInt(48 + j * 2)) & 3n);
    hand.white[j] = Number((val >> BigInt(54 + j * 2)) & 3n);
  }
  return { board, hand, turn, history: [] };
}
