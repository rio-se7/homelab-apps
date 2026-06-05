import { BABY, ELEPHANT, GIRAFFE, CHICKEN, LION, EMPTY, type GameState } from '../engine/types';

const PIECES = [
  { piece: LION,     label: '🦁' },
  { piece: GIRAFFE,  label: '🦒' },
  { piece: ELEPHANT, label: '🐘' },
  { piece: CHICKEN,  label: '🐓' },
  { piece: BABY,     label: '🐤' },
];

const HAND_PIECES = [
  { piece: GIRAFFE,  label: '🦒' },
  { piece: ELEPHANT, label: '🐘' },
  { piece: BABY,     label: '🐤' },
];

interface Props {
  state: GameState;
  selectedPiece: number | null;
  onSelectPiece: (piece: number | null) => void;
  onChangeTurn: (turn: 'black' | 'white') => void;
  onChangeHand: (player: 'black' | 'white', pieceType: number, delta: number) => void;
  onDone: () => void;
  onReset: () => void;
}

export default function SetupPanel({
  state, selectedPiece, onSelectPiece, onChangeTurn,
  onChangeHand, onDone, onReset,
}: Props) {
  return (
    <div style={{ background: '#f5f0e8', border: '1px solid #ccc', borderRadius: 6, padding: 12, fontSize: 13 }}>
      <div style={{ fontWeight: 'bold', marginBottom: 10 }}>局面セットアップ</div>

      {/* 駒パレット */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>配置する駒を選択（クリックで盤面に配置）</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
          {/* 先手駒 */}
          {PIECES.map(({ piece, label }) => (
            <PieceButton
              key={`b${piece}`}
              label={label}
              value={piece}
              selected={selectedPiece === piece}
              color="#222"
              onClick={() => onSelectPiece(selectedPiece === piece ? null : piece)}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
          {/* 後手駒 */}
          {PIECES.map(({ piece, label }) => (
            <PieceButton
              key={`w${piece}`}
              label={label}
              value={-piece}
              selected={selectedPiece === -piece}
              color="#888"
              rotated
              onClick={() => onSelectPiece(selectedPiece === -piece ? null : -piece)}
            />
          ))}
        </div>
        {/* 消しゴム */}
        <button
          onClick={() => onSelectPiece(selectedPiece === EMPTY ? null : EMPTY)}
          style={{
            padding: '4px 10px', fontSize: 12,
            background: selectedPiece === EMPTY ? '#ffd700' : '#fff',
            border: '1px solid #aaa', borderRadius: 4, cursor: 'pointer',
          }}
        >
          消去
        </button>
      </div>

      {/* 手番 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>手番</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['black', 'white'] as const).map(p => (
            <label key={p} style={{ cursor: 'pointer' }}>
              <input
                type="radio"
                name="turn"
                checked={state.turn === p}
                onChange={() => onChangeTurn(p)}
                style={{ marginRight: 4 }}
              />
              {p === 'black' ? '先手' : '後手'}
            </label>
          ))}
        </div>
      </div>

      {/* 持ち駒 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>持ち駒</div>
        {(['black', 'white'] as const).map(player => (
          <div key={player} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 36, fontSize: 12 }}>{player === 'black' ? '先手' : '後手'}:</span>
            {HAND_PIECES.map(({ piece, label }) => (
              <div key={piece} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 14, transform: player === 'white' ? 'rotate(180deg)' : undefined, display: 'inline-block' }}>{label}</span>
                <button onClick={() => onChangeHand(player, piece, -1)} style={btnStyle}>−</button>
                <span style={{ width: 16, textAlign: 'center', fontSize: 12 }}>
                  {state.hand[player][piece - 1]}
                </span>
                <button onClick={() => onChangeHand(player, piece, 1)} style={btnStyle}>＋</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onDone} style={{ padding: '5px 14px', background: '#4a90e2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          完了
        </button>
        <button onClick={onReset} style={{ padding: '5px 14px', background: '#fff', border: '1px solid #aaa', borderRadius: 4, cursor: 'pointer' }}>
          初期局面に戻す
        </button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  width: 20, height: 20, padding: 0,
  fontSize: 14, lineHeight: 1,
  border: '1px solid #aaa', borderRadius: 3,
  background: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function PieceButton({ label, value: _value, selected, color, rotated = false, onClick }: {
  label: string; value: number; selected: boolean;
  color: string; rotated?: boolean; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 36, height: 36,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: selected ? '#ffd700' : '#fff',
        border: `1px solid ${selected ? '#aaa' : '#ccc'}`,
        borderRadius: 4, cursor: 'pointer',
        color,
        transform: rotated ? 'rotate(180deg)' : undefined,
        fontSize: 18,
      }}
    >
      {label}
    </div>
  );
}
