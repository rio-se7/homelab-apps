import { type GameState, type Move, isBoardMove, LION, CHICKEN } from '../engine/types';

const PIECE_LABEL: Record<number, string> = {
  1: '🐤', 2: '🐘', 3: '🦒', 4: '🐓', 5: '🦁',
};

// カラーパレット — どうぶつしょうぎ オマージュ（ナチュラルグリーン系）
const C = {
  frame:      '#7aaa58',   // 外枠（グリッドと同系統の明るい緑）
  grid:       '#7aaa58',   // グリッド線
  cell:       '#f0f5e8',   // 通常マス
  cellGote:   '#e4f0f8',   // 後手陣 (y=0, 空色)
  cellSente:  '#f8f0e0',   // 先手陣 (y=3, 暖色)
  cellSetup:  '#fffff0',   // セットアップ時
  selected:   '#ffdd44',   // 選択マス
  label:      '#2a4018',   // ラベル文字
  dotEmpty:   'rgba(30,60,10,0.22)',   // 移動先（空）
  ringCapt:   'rgba(180,60,0,0.35)',   // 移動先（取り）
  pieceB:     '#fdf4d0',   // 先手駒タイル
  pieceBBdr:  '#8a6820',
  pieceW:     '#e8eefa',   // 後手駒タイル
  pieceWBdr:  '#6070a0',
  lion:       '#c82000',
  promoted:   '#9a6600',
  normal:     '#1a1a1a',
};


interface Props {
  state: GameState;
  selected: [number, number] | null;
  validMoves: Move[];
  onCellClick: (x: number, y: number) => void;
  flipped?: boolean;
  setupPiece?: number | null;
  cellSize?: number;
}

export default function Board({
  state, selected, validMoves, onCellClick,
  flipped = false, setupPiece, cellSize = 80,
}: Props) {
  const validDests = new Set(
    validMoves
      .filter(isBoardMove)
      .filter(m => !selected || (m.from[0] === selected[0] && m.from[1] === selected[1]))
      .map(m => `${m.to[0]},${m.to[1]}`)
  );

  const CELL = cellSize;
  const dotR = Math.round(CELL * 0.13);
  const rows = flipped ? [3, 2, 1, 0] : [0, 1, 2, 3];
  const cols = flipped ? [0, 1, 2] : [2, 1, 0];
  const colLabels = flipped ? ['C', 'B', 'A'] : ['A', 'B', 'C'];
  const labelSz = Math.max(10, Math.round(CELL * 0.16));
  const labelW = Math.round(labelSz * 1.6); // ABCとほぼ同幅に
  const pieceSz = Math.round(CELL * 0.78);
  const fontSize = Math.round(CELL * 0.34);
  const markSz  = Math.round(CELL * 0.14);

  return (
    <div style={{
      display: 'inline-block',
      background: C.frame,
      padding: 4,
      borderRadius: 6,
      boxShadow: '0 3px 12px rgba(0,0,0,0.30)',
    }}>
      {/* 列ラベル */}
      <div style={{ display: 'flex', marginLeft: labelW }}>
        {colLabels.map((label, i) => (
          <div key={i} style={{ width: CELL, textAlign: 'center', fontSize: labelSz, color: C.label, paddingBottom: 2, fontWeight: 600 }}>
            {label}
          </div>
        ))}
      </div>

      {rows.map(y => {
        // 先手陣(y=3)・後手陣(y=0)で背景色を変える
        const rankBg = y === 0 ? C.cellGote : y === 3 ? C.cellSente : C.cell;

        return (
          <div key={y} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: labelW, textAlign: 'center', fontSize: labelSz, color: C.label, fontWeight: 600 }}>
              {y + 1}
            </div>

            {cols.map(x => {
              const piece    = state.board[x][y];
              const isBlack  = piece > 0;
              const isWhite  = piece < 0;
              const isSel    = selected?.[0] === x && selected?.[1] === y;
              const isValid  = validDests.has(`${x},${y}`);
              const isProm   = Math.abs(piece) === CHICKEN;
              const isLion   = Math.abs(piece) === LION;
              const rotated  = flipped ? isBlack : isWhite;

              const bg = isSel
                ? C.selected
                : setupPiece !== undefined && setupPiece !== null
                ? C.cellSetup
                : rankBg;

              // 駒タイルの色
              const tileBg  = isBlack ? C.pieceB : C.pieceW;
              const tileBdr = isBlack ? C.pieceBBdr : C.pieceWBdr;
              const textColor = isLion ? C.lion : isProm ? C.promoted : C.normal;

              return (
                <div
                  key={x}
                  onClick={() => onCellClick(x, y)}
                  style={{
                    width: CELL, height: CELL,
                    background: bg,
                    border: `1px solid ${C.grid}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', position: 'relative', userSelect: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* 移動先インジケーター */}
                  {isValid && piece === 0 && (
                    <div style={{
                      position: 'absolute',
                      width: dotR * 2, height: dotR * 2,
                      borderRadius: '50%',
                      background: C.dotEmpty,
                      pointerEvents: 'none',
                    }} />
                  )}
                  {isValid && piece !== 0 && (
                    <div style={{
                      position: 'absolute', inset: 4,
                      border: `2px solid ${C.ringCapt}`,
                      borderRadius: 3,
                      pointerEvents: 'none',
                      zIndex: 2,
                    }} />
                  )}

                  {/* 駒タイル */}
                  {piece !== 0 && (
                    <div style={{
                      width: pieceSz, height: pieceSz,
                      background: tileBg,
                      border: `1.5px solid ${tileBdr}`,
                      borderRadius: 4,
                      transform: rotated ? 'rotate(180deg)' : undefined,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      zIndex: 1,
                      boxSizing: 'border-box',
                    }}>
                      <span style={{
                        fontSize: Math.round(fontSize * 1.1),
                        lineHeight: 1,
                      }}>
                        {PIECE_LABEL[Math.abs(piece)]}
                      </span>
                      <span style={{ fontSize: markSz, opacity: 0.5, lineHeight: 1, color: textColor }}>
                        {isBlack ? '▲' : '▽'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* 下部: 先手陣・後手陣の説明 */}
      <div style={{ display: 'flex', marginLeft: labelW, marginTop: 2 }}>
        {colLabels.map((_, i) => (
          <div key={i} style={{ width: CELL }} />
        ))}
      </div>
    </div>
  );
}
