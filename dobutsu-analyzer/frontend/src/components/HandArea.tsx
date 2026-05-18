import { BABY, ELEPHANT, GIRAFFE } from '../engine/types';

const PIECE_LABEL: Record<number, string> = { 1: 'ひ', 2: 'ぞ', 3: 'き' };
const HAND_PIECES = [BABY, ELEPHANT, GIRAFFE];

interface Props {
  hand: number[];
  player: 'black' | 'white';
  onDrop?: (piece: number) => void;
  selectedDrop?: number | null;
}

export default function HandArea({ hand, player, onDrop, selectedDrop }: Props) {
  const label = player === 'black' ? '先手持ち駒' : '後手持ち駒';

  return (
    <div style={{ padding: '8px 0', minHeight: 48 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {HAND_PIECES.map(pt => {
          const count = hand[pt - 1];
          if (count === 0) return null;
          const isSelected = selectedDrop === pt;
          return (
            <div
              key={pt}
              onClick={() => onDrop?.(pt)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                padding: '4px 8px',
                background: isSelected ? '#ffd700' : '#e8d5b0',
                border: `1px solid ${isSelected ? '#aaa' : '#bbb'}`,
                borderRadius: 4,
                cursor: onDrop ? 'pointer' : 'default',
                fontSize: 18,
                transform: player === 'white' ? 'rotate(180deg)' : undefined,
              }}
            >
              {PIECE_LABEL[pt]}
              <span style={{ fontSize: 12, transform: player === 'white' ? 'rotate(180deg)' : undefined }}>
                ×{count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
