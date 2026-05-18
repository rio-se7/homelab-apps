import { GameState, Move, isBoardMove } from '../engine/types';
import { LION, CHICKEN } from '../engine/types';

const PIECE_LABEL: Record<number, string> = {
  1: 'ひ', 2: 'ぞ', 3: 'き', 4: 'に', 5: 'ら',
};

interface Props {
  state: GameState;
  selected: [number, number] | null;
  validMoves: Move[];
  onCellClick: (x: number, y: number) => void;
}

export default function Board({ state, selected, validMoves, onCellClick }: Props) {
  const validDests = new Set(
    validMoves
      .filter(isBoardMove)
      .filter(m => !selected || (m.from[0] === selected[0] && m.from[1] === selected[1]))
      .map(m => `${m.to[0]},${m.to[1]}`)
  );

  // 表示: 上(y=0 後手陣) → 下(y=3 先手陣), 左(x=2 A列) → 右(x=0 C列)
  const rows = [0, 1, 2, 3];
  const cols = [2, 1, 0]; // A, B, C 表示順

  return (
    <div style={{ display: 'inline-block' }}>
      {/* 列ラベル */}
      <div style={{ display: 'flex', marginLeft: 28 }}>
        {cols.map(x => (
          <div key={x} style={{ width: 64, textAlign: 'center', fontSize: 12, color: '#888' }}>
            {'CBA'[x] === 'A' ? 'A' : 'CBA'[x] === 'B' ? 'B' : 'C'}
          </div>
        ))}
      </div>

      {rows.map(y => (
        <div key={y} style={{ display: 'flex', alignItems: 'center' }}>
          {/* 行ラベル */}
          <div style={{ width: 24, textAlign: 'center', fontSize: 12, color: '#888' }}>{y + 1}</div>

          {cols.map(x => {
            const piece = state.board[x][y];
            const isBlackPiece = piece > 0;
            const isWhitePiece = piece < 0;
            const isSelected = selected?.[0] === x && selected?.[1] === y;
            const isValidDest = validDests.has(`${x},${y}`);
            const isPromoted = Math.abs(piece) === CHICKEN;
            const isLion = Math.abs(piece) === LION;

            const bg = isSelected
              ? '#ffd700'
              : isValidDest
              ? '#90ee90'
              : (x + y) % 2 === 0 ? '#f0d9b5' : '#b58863';

            return (
              <div
                key={x}
                onClick={() => onCellClick(x, y)}
                style={{
                  width: 64,
                  height: 64,
                  background: bg,
                  border: '1px solid #666',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  userSelect: 'none',
                }}
              >
                {piece !== 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      transform: isWhitePiece ? 'rotate(180deg)' : undefined,
                      color: isLion ? '#c00' : isPromoted ? '#960' : '#222',
                      fontWeight: isLion ? 'bold' : 'normal',
                      fontSize: 22,
                      lineHeight: 1,
                    }}
                  >
                    {PIECE_LABEL[Math.abs(piece)]}
                    <div style={{ fontSize: 9, opacity: 0.6 }}>
                      {isBlackPiece ? '▲' : '▽'}
                    </div>
                  </div>
                )}
                {isValidDest && piece === 0 && (
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#2a2' }} />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
