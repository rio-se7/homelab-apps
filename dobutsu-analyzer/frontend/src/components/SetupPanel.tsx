import { BABY, ELEPHANT, GIRAFFE, CHICKEN, LION, EMPTY, type GameState } from '../engine/types';
import {
  checkInventory, remaining, remainingForPalette, type HandPieceType,
} from '../engine/inventory';

const PIECES = [
  { piece: LION,     label: '🦁' },
  { piece: GIRAFFE,  label: '🦒' },
  { piece: ELEPHANT, label: '🐘' },
  { piece: CHICKEN,  label: '🐓' },
  { piece: BABY,     label: '🐤' },
];

const HAND_PIECES: { piece: HandPieceType; label: string }[] = [
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
  // 駒の在庫は固定（ライオン各1枚 + ひな/ぞう/きりん 各2枚）。在庫が崩れた局面は
  // 完全解析テーブルに存在せず API が 404 を返すため、配置できる駒を在庫で絞る。
  const inventory = checkInventory(state);

  return (
    <div style={{ background: '#f5f0e8', border: '1px solid #ccc', borderRadius: 6, padding: 12, fontSize: 13 }}>
      <div style={{ fontWeight: 'bold', marginBottom: 10 }}>局面セットアップ</div>

      {/* 駒パレット — 残枚数が0の駒は盤上から消去するまで配置できない */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>配置する駒を選択（クリックで盤面に配置）</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
          {/* 先手駒 */}
          {PIECES.map(({ piece, label }) => (
            <PieceButton
              key={`b${piece}`}
              label={label}
              remaining={remainingForPalette(state, piece)}
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
              remaining={remainingForPalette(state, -piece)}
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
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>持ち駒</div>
        {(['black', 'white'] as const).map(player => (
          <div key={player} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 36, fontSize: 12 }}>{player === 'black' ? '先手' : '後手'}:</span>
            {HAND_PIECES.map(({ piece, label }) => {
              const count = state.hand[player][piece - 1];
              const canAdd = remaining(state, piece) > 0;
              return (
                <div key={piece} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 14, transform: player === 'white' ? 'rotate(180deg)' : undefined, display: 'inline-block' }}>{label}</span>
                  <button
                    onClick={() => onChangeHand(player, piece, -1)}
                    disabled={count === 0}
                    style={{ ...btnStyle, opacity: count === 0 ? 0.4 : 1, cursor: count === 0 ? 'default' : 'pointer' }}
                  >−</button>
                  <span style={{ width: 16, textAlign: 'center', fontSize: 12 }}>{count}</span>
                  <button
                    onClick={() => onChangeHand(player, piece, 1)}
                    disabled={!canAdd}
                    title={canAdd ? undefined : '在庫がありません（盤上か相手の持ち駒から減らしてください）'}
                    style={{ ...btnStyle, opacity: canAdd ? 1 : 0.4, cursor: canAdd ? 'pointer' : 'default' }}
                  >＋</button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 在庫チェック — 不正なままでは解析できないので「完了」を止める */}
      <div style={{ marginBottom: 12, fontSize: 12 }}>
        {inventory.ok ? (
          <div style={{ color: '#2a7a2a' }}>駒の枚数OK</div>
        ) : (
          <div style={{ color: '#c00' }}>
            {inventory.errors.map(e => <div key={e}>{e}</div>)}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onDone}
          disabled={!inventory.ok}
          title={inventory.ok ? undefined : inventory.errors.join(' / ')}
          style={{
            padding: '5px 14px', background: '#4a90e2', color: '#fff', border: 'none', borderRadius: 4,
            cursor: inventory.ok ? 'pointer' : 'default', opacity: inventory.ok ? 1 : 0.5,
          }}
        >
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

function PieceButton({ label, remaining, selected, color, rotated = false, onClick }: {
  label: string; remaining: number; selected: boolean;
  color: string; rotated?: boolean; onClick: () => void;
}) {
  const disabled = remaining === 0;
  return (
    <div
      onClick={disabled ? undefined : onClick}
      title={disabled ? '在庫がありません（先に盤上から消去してください）' : undefined}
      style={{
        width: 36, height: 44,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: selected ? '#ffd700' : '#fff',
        border: `1px solid ${selected ? '#aaa' : '#ccc'}`,
        borderRadius: 4, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        color,
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1, transform: rotated ? 'rotate(180deg)' : undefined }}>{label}</span>
      <span style={{ fontSize: 9, lineHeight: 1, marginTop: 3, color: '#888' }}>残{remaining}</span>
    </div>
  );
}
