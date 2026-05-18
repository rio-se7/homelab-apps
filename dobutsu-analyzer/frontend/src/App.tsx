import { useState, useEffect, useCallback } from 'react';
import Board from './components/Board';
import HandArea from './components/HandArea';
import { GameState, Move, isBoardMove } from './engine/types';
import { initialState, legalMoves, applyMove, checkWinner, encodeForApi } from './engine/board';
import { fetchMoves, MoveEval } from './api/client';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(initialState());
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [selectedDrop, setSelectedDrop] = useState<number | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [moveEvals, setMoveEvals] = useState<MoveEval[]>([]);
  const [winner, setWinner] = useState<'black' | 'white' | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  // 局面変化ごとに合法手 + 評価を取得
  useEffect(() => {
    if (winner) return;
    setValidMoves(legalMoves(gameState));

    const pos = encodeForApi(gameState);
    setEvalError(null);
    fetchMoves(pos)
      .then(r => setMoveEvals(r.moves))
      .catch(e => setEvalError(String(e)));
  }, [gameState, winner]);

  const resetGame = useCallback(() => {
    setGameState(initialState());
    setSelected(null);
    setSelectedDrop(null);
    setValidMoves([]);
    setMoveEvals([]);
    setWinner(null);
    setEvalError(null);
  }, []);

  const executeMove = useCallback((move: Move) => {
    const newState = applyMove(gameState, move);
    setGameState(newState);
    setSelected(null);
    setSelectedDrop(null);
    const w = checkWinner(newState, move);
    if (w) setWinner(w);
  }, [gameState]);

  const handleCellClick = useCallback((x: number, y: number) => {
    if (winner) return;

    // 打ち駒モード
    if (selectedDrop !== null) {
      const drop = validMoves.find(m => !isBoardMove(m) && m.to[0] === x && m.to[1] === y);
      if (drop) executeMove(drop);
      else setSelectedDrop(null);
      return;
    }

    const piece = gameState.board[x][y];
    const isOwnPiece =
      (gameState.turn === 'black' && piece > 0) ||
      (gameState.turn === 'white' && piece < 0);

    if (isOwnPiece) {
      setSelected([x, y]);
      return;
    }

    if (selected) {
      const mv = validMoves.find(
        m => isBoardMove(m) &&
          m.from[0] === selected[0] && m.from[1] === selected[1] &&
          m.to[0] === x && m.to[1] === y
      );
      if (mv) executeMove(mv);
      else setSelected(null);
    }
  }, [winner, selected, selectedDrop, validMoves, gameState, executeMove]);

  const handleHandClick = useCallback((piece: number) => {
    if (winner) return;
    setSelected(null);
    setSelectedDrop(prev => prev === piece ? null : piece);
  }, [winner]);

  const bestEval = moveEvals[0];
  const evalLabel = bestEval
    ? `${bestEval.result === 'win' ? '勝ち' : bestEval.result === 'lose' ? '負け' : '引き分け'} (${bestEval.dtm + 1}手)`
    : evalError ? '(評価取得エラー)' : '評価中…';

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24, display: 'flex', gap: 32 }}>
      <div>
        <h2 style={{ margin: '0 0 8px' }}>どうぶつしょうぎ解析</h2>

        <HandArea
          hand={gameState.hand.white}
          player="white"
          onDrop={gameState.turn === 'white' ? handleHandClick : undefined}
          selectedDrop={gameState.turn === 'white' ? selectedDrop : null}
        />

        <Board
          state={gameState}
          selected={selected}
          validMoves={validMoves}
          onCellClick={handleCellClick}
        />

        <HandArea
          hand={gameState.hand.black}
          player="black"
          onDrop={gameState.turn === 'black' ? handleHandClick : undefined}
          selectedDrop={gameState.turn === 'black' ? selectedDrop : null}
        />

        <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 14 }}>
            {winner
              ? `${winner === 'black' ? '先手' : '後手'}の勝ち！`
              : `${gameState.turn === 'black' ? '先手' : '後手'}の番`}
          </span>
          <button onClick={resetGame} style={{ padding: '4px 12px' }}>リセット</button>
        </div>
      </div>

      {/* 評価パネル */}
      <div style={{ minWidth: 220 }}>
        <h3 style={{ margin: '0 0 12px' }}>完全解析評価</h3>
        <div style={{ fontSize: 14, marginBottom: 16 }}>
          現局面: <strong>{evalLabel}</strong>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>合法手の評価</div>
          {moveEvals.map((me, i) => (
            <div key={i} style={{
              padding: '4px 8px', marginBottom: 2,
              background: me.result === 'win' ? '#d4edda' : me.result === 'lose' ? '#f8d7da' : '#fff3cd',
              borderRadius: 4, fontSize: 13,
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span style={{ fontFamily: 'monospace' }}>{me.mv}</span>
              <span>
                {me.result === 'win' ? '勝' : me.result === 'lose' ? '負' : '分'}
                {me.dtm > 0 ? ` ${me.dtm + 1}手` : ''}
              </span>
            </div>
          ))}
        </div>

        {gameState.history.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>棋譜</div>
            {gameState.history.map((rec, i) => (
              <div key={i} style={{ fontSize: 12, fontFamily: 'monospace' }}>
                {i + 1}. {rec.notation}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
