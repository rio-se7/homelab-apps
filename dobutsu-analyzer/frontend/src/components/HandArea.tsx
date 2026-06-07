import { BABY, ELEPHANT, GIRAFFE } from '../engine/types';

const PIECE_LABEL: Record<number, string> = { 1: '🐤', 2: '🐘', 3: '🦒' };
const HAND_PIECES = [BABY, ELEPHANT, GIRAFFE];

interface Props {
  hand: number[];
  player: 'black' | 'white';
  onDrop?: (piece: number) => void;  // 自分の手番のときだけ渡される
  selectedDrop?: number | null;
}

export default function HandArea({ hand, player, onDrop, selectedDrop }: Props) {
  const label = player === 'black' ? '先手持ち駒' : '後手持ち駒';
  const active = !!onDrop; // 手番中かどうか

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ fontSize: 11, color: active ? '#7a5a1a' : '#aaa', marginBottom: 3 }}>{label}</div>
      {/* 高さを固定して持ち駒増減時のずれを防ぐ */}
      <div style={{ height: 34, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap', overflow: 'hidden' }}>
        {HAND_PIECES.map(pt => {
          const count = hand[pt - 1];
          if (count === 0) return null;
          const isSelected = selectedDrop === pt;
          return (
            <div
              key={pt}
              onClick={() => onDrop?.(pt)}
              style={{
                display: 'flex', alignItems: 'center', gap: 2,
                padding: '5px 10px',
                background: isSelected ? '#ffe044' : active ? '#f5e4a0' : '#e8e0d0',
                border: `1px solid ${isSelected ? '#c8a84a' : active ? '#c8a84a' : '#ccc'}`,
                borderRadius: 4,
                cursor: active ? 'pointer' : 'default',
                fontSize: 20,
                opacity: active ? 1 : 0.5,
                transform: player === 'white' ? 'rotate(180deg)' : undefined,
                transition: 'background 0.15s',
              }}
            >
              {PIECE_LABEL[pt]}
              <span style={{
                fontSize: 12,
                transform: player === 'white' ? 'rotate(180deg)' : undefined,
                color: active ? '#7a5a1a' : '#999',
              }}>
                ×{count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
