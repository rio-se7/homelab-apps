import { EMPTY, BABY, ELEPHANT, GIRAFFE, CHICKEN, LION, type GameState, type Player } from './types';

// Every dobutsu shogi position carries a fixed inventory: exactly one lion per
// side, plus two each of chick / elephant / giraffe (a captured piece moves to
// the other player's hand, it never leaves the game). The perfect-play table
// only contains positions with that exact inventory — a setup position that
// breaks it is answered with 404 by /api/eval and /api/moves, which is why the
// setup palette has to preserve the inventory instead of minting pieces.
export const PIECE_CAP = 2;
export const LION_CAP = 1;

// Piece types that can be held in hand (hand index = pieceType - 1).
export type HandPieceType = typeof BABY | typeof ELEPHANT | typeof GIRAFFE;

const HAND_PIECE_TYPES: HandPieceType[] = [BABY, ELEPHANT, GIRAFFE];

// Labels match the setup palette so messages name the piece the user clicked.
const EMOJI: Record<number, string> = {
  [BABY]: '🐤',
  [ELEPHANT]: '🐘',
  [GIRAFFE]: '🦒',
  [LION]: '🦁',
};

// A hen counts as the chick it reverts to when captured.
function normalizeType(piece: number): number {
  const t = Math.abs(piece);
  return t === CHICKEN ? BABY : t;
}

// Board + both hands, counting both colours (captures flip ownership).
export function usedCount(state: GameState, pieceType: HandPieceType): number {
  let n = 0;
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 4; y++) {
      const p = state.board[x][y];
      if (p !== EMPTY && normalizeType(p) === pieceType) n++;
    }
  }
  return n + state.hand.black[pieceType - 1] + state.hand.white[pieceType - 1];
}

export function remaining(state: GameState, pieceType: HandPieceType): number {
  return PIECE_CAP - usedCount(state, pieceType);
}

export function lionCount(state: GameState, side: Player): number {
  const want = side === 'black' ? LION : -LION;
  let n = 0;
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 4; y++) if (state.board[x][y] === want) n++;
  }
  return n;
}

// Remaining count for a signed palette entry (e.g. -LION = white lion).
// Lions are tracked per side, the other types share a two-piece pool.
export function remainingForPalette(state: GameState, palettePiece: number): number {
  if (Math.abs(palettePiece) === LION) {
    return LION_CAP - lionCount(state, palettePiece > 0 ? 'black' : 'white');
  }
  return remaining(state, normalizeType(palettePiece) as HandPieceType);
}

// True when no piece type exceeds its cap. Used to reject a setup click that
// would mint a piece; shortages are allowed while the user is still editing.
export function capsRespected(state: GameState): boolean {
  if (lionCount(state, 'black') > LION_CAP || lionCount(state, 'white') > LION_CAP) return false;
  return HAND_PIECE_TYPES.every(pt => usedCount(state, pt) <= PIECE_CAP);
}

export interface InventoryCheck {
  ok: boolean;
  errors: string[];
}

export function checkInventory(state: GameState): InventoryCheck {
  const errors: string[] = [];

  for (const side of ['black', 'white'] as Player[]) {
    const n = lionCount(state, side);
    if (n !== LION_CAP) {
      errors.push(`${EMOJI[LION]}(${side === 'black' ? '先手' : '後手'}) が${n}枚です — 1枚必要です`);
    }
  }

  for (const pt of HAND_PIECE_TYPES) {
    const n = usedCount(state, pt);
    if (n !== PIECE_CAP) {
      const note = pt === BABY ? '(🐓 も🐤として数えます)' : '';
      errors.push(`${EMOJI[pt]} が${n}枚です — 2枚必要です${note}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
