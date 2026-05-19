import { type GameState, type Move, isBoardMove, LION, CHICKEN } from '../engine/types';

const PIECE_LABEL: Record<number, string> = {
  1: 'ひ', 2: 'ぞ', 3: 'き', 4: 'に', 5: 'ら',
};

interface Props {
  state: GameState;
  selected: [number, number] | null;
  validMoves: Move[];
  onCellClick: (x: number, y: number) => void;
  flipped?: boolean;
  setupPiece?: number | null; // セットアップモード中の選択駒
}

export default function Board({ state, selected, validMoves, onCellClick, flipped = false, setupPiece }: Props) {
  const validDests = new Set(
    validMoves
      .filter(isBoardMove)
      .filter(m => !selected || (m.from[0] === selected[0] && m.from[1] === selected[1]))
      .map(m => `${m.to[0]},${m.to[1]}`)
  );

  // 反転時は行・列の表示順を逆にする
  const rows = flipped ? [3, 2, 1, 0] : [0, 1, 2, 3];
  const cols = flipped ? [0, 1, 2] : [2, 1, 0]; // A(x=2),B(x=1),C(x=0) or C,B,A

  const colLabels = flipped ? ['C', 'B', 'A'] : ['A', 'B', 'C'];

  return (
    <div style={{ display: 'inline-block' }}>
      <div style={{ display: 'flex', marginLeft: 28 }}>
        {colLabels.map((label, i) => (
          <div key={i} style={{ width: 64, textAlign: 'center', fontSize: 12, color: '#888' }}>
            {label}
          </div>
        ))}
      </div>

      {rows.map(y => (
        <div key={y} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 24, textAlign: 'center', fontSize: 12, color: '#888' }}>{y + 1}</div>

          {cols.map(x => {
            const piece = state.board[x][y];
            const isBlackPiece = piece > 0;
            const isWhitePiece = piece < 0;
            const isSelected = selected?.[0] === x && selected?.[1] === y;
            const isValidDest = validDests.has(`${x},${y}`);
            const isPromoted = Math.abs(piece) === CHICKEN;
            const isLion = Math.abs(piece) === LION;

            // 反転時は駒の向きも逆転
            const rotated = flipped ? isBlackPiece : isWhitePiece;

            const bg = isSelected
              ? '#ffd700'
              : setupPiece !== undefined && setupPiece !== null
              ? '#e8f4f8'
              : isValidDest
              ? '#90ee90'
              : (x + y) % 2 === 0 ? '#f0d9b5' : '#b58863';

            return (
              <div
                key={x}
                onClick={() => onCellClick(x, y)}
                style={{
                  width: 64, height: 64,
                  background: bg,
                  border: '1px solid #666',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', position: 'relative', userSelect: 'none',
                }}
              >
                {piece !== 0 && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    transform: rotated ? 'rotate(180deg)' : undefined,
                    color: isLion ? '#c00' : isPromoted ? '#960' : isWhitePiece ? '#fff' : '#222',
                    fontWeight: isLion ? 'bold' : 'normal',
                    fontSize: 22, lineHeight: 1,
                  }}>
                    {PIECE_LABEL[Math.abs(piece)]}
                    <div style={{ fontSize: 9, opacity: 0.6 }}>
                      {isBlackPiece ? '▲' : '▽'}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
