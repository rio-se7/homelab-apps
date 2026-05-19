import { useState, useEffect, useCallback } from 'react';
import Board from './components/Board';
import HandArea from './components/HandArea';
import EvalChart, { type EvalPoint } from './components/EvalChart';
import SetupPanel from './components/SetupPanel';
import { type GameState, type Move, isBoardMove, EMPTY } from './engine/types';
import { initialState, legalMoves, applyMove, checkWinner, encodeForApi } from './engine/board';
import { fetchEval, fetchMoves, type MoveEval } from './api/client';

function toScore(result: string, dtm: number, turn: 'black' | 'white'): number {
  const d = dtm + 1;
  if (result === 'draw') return 0;
  const blackWins = turn === 'black' ? result === 'win' : result === 'lose';
  return blackWins ? d : -d;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>(initialState());
  const [stateHistory, setStateHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [selectedDrop, setSelectedDrop] = useState<number | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [moveEvals, setMoveEvals] = useState<MoveEval[]>([]);
  const [evalHistory, setEvalHistory] = useState<EvalPoint[]>([]);
  const [winner, setWinner] = useState<'black' | 'white' | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [setupPiece, setSetupPiece] = useState<number | null>(null);

  // 初期評価
  useEffect(() => {
    const pos = encodeForApi(initialState());
    fetchEval(pos).then(r => {
      setEvalHistory([{ move: 0, score: toScore(r.result, r.dtm, 'black'), notation: '初期局面' }]);
    }).catch(() => {});
  }, []);

  // 局面変化ごとに合法手 + 評価を取得
  useEffect(() => {
    if (winner || setupMode) return;
    setValidMoves(legalMoves(gameState));
    const pos = encodeForApi(gameState);
    setEvalError(null);
    fetchMoves(pos)
      .then(r => setMoveEvals(r.moves))
      .catch(e => setEvalError(String(e)));
  }, [gameState, winner, setupMode]);

  const resetGame = useCallback(() => {
    const init = initialState();
    setGameState(init);
    setStateHistory([]);
    setSelected(null);
    setSelectedDrop(null);
    setValidMoves([]);
    setMoveEvals([]);
    setWinner(null);
    setEvalError(null);
    setSetupMode(false);
    setSetupPiece(null);
    fetchEval(encodeForApi(init)).then(r => {
      setEvalHistory([{ move: 0, score: toScore(r.result, r.dtm, 'black'), notation: '初期局面' }]);
    }).catch(() => setEvalHistory([]));
  }, []);

  const undoMove = useCallback(() => {
    if (stateHistory.length === 0) return;
    const prev = stateHistory[stateHistory.length - 1];
    setGameState(prev);
    setStateHistory(h => h.slice(0, -1));
    setEvalHistory(h => h.slice(0, -1));
    setWinner(null);
    setSelected(null);
    setSelectedDrop(null);
  }, [stateHistory]);

  const executeMove = useCallback((move: Move) => {
    setStateHistory(prev => [...prev, gameState]);
    const newState = applyMove(gameState, move);
    setGameState(newState);
    setSelected(null);
    setSelectedDrop(null);

    fetchEval(encodeForApi(newState)).then(r => {
      setEvalHistory(prev => [...prev, {
        move: newState.history.length,
        score: toScore(r.result, r.dtm, newState.turn),
        notation: move.notation,
      }]);
    }).catch(() => {});

    const w = checkWinner(newState, move);
    if (w) setWinner(w);
  }, [gameState]);

  const handleCellClick = useCallback((x: number, y: number) => {
    // セットアップモード
    if (setupMode) {
      if (setupPiece === null) return;
      const newBoard = gameState.board.map(col => [...col]);
      newBoard[x][y] = newBoard[x][y] === setupPiece ? EMPTY : setupPiece;
      setGameState(s => ({ ...s, board: newBoard }));
      return;
    }

    if (winner) return;

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

    if (isOwnPiece) { setSelected([x, y]); return; }

    if (selected) {
      const mv = validMoves.find(
        m => isBoardMove(m) &&
          m.from[0] === selected[0] && m.from[1] === selected[1] &&
          m.to[0] === x && m.to[1] === y
      );
      if (mv) executeMove(mv);
      else setSelected(null);
    }
  }, [setupMode, setupPiece, winner, selected, selectedDrop, validMoves, gameState, executeMove]);

  const handleHandClick = useCallback((piece: number) => {
    if (winner || setupMode) return;
    setSelected(null);
    setSelectedDrop(prev => prev === piece ? null : piece);
  }, [winner, setupMode]);

  // セットアップ完了: 評価を再取得
  const handleSetupDone = useCallback(() => {
    setSetupMode(false);
    setSetupPiece(null);
    setStateHistory([]);
    setWinner(null);
    setMoveEvals([]);
    const pos = encodeForApi(gameState);
    fetchEval(pos).then(r => {
      setEvalHistory([{ move: 0, score: toScore(r.result, r.dtm, gameState.turn), notation: 'セットアップ局面' }]);
    }).catch(() => setEvalHistory([]));
  }, [gameState]);

  const handleChangeHand = useCallback((player: 'black' | 'white', pieceType: number, delta: number) => {
    setGameState(s => {
      const hand = { black: [...s.hand.black], white: [...s.hand.white] };
      const idx = pieceType - 1;
      hand[player][idx] = Math.max(0, hand[player][idx] + delta);
      return { ...s, hand };
    });
  }, []);

  const bestEval = moveEvals[0];
  const evalLabel = bestEval
    ? `${bestEval.result === 'win' ? '勝ち' : bestEval.result === 'lose' ? '負け' : '引き分け'} (${bestEval.dtm + 1}手)`
    : evalError ? '(評価取得エラー)' : '評価中…';

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      {/* 盤面エリア */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>どうぶつしょうぎ解析</h2>

          {/* 盤面反転トグル */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <span>後手視点</span>
            <div
              onClick={() => setFlipped(f => !f)}
              style={{
                width: 40, height: 22, borderRadius: 11,
                background: flipped ? '#4a90e2' : '#ccc',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 2,
                left: flipped ? 20 : 2, transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </div>
          </label>
        </div>

        <HandArea
          hand={gameState.hand.white}
          player="white"
          onDrop={!setupMode && gameState.turn === 'white' ? handleHandClick : undefined}
          selectedDrop={gameState.turn === 'white' ? selectedDrop : null}
        />
        <Board
          state={gameState}
          selected={selected}
          validMoves={setupMode ? [] : validMoves}
          onCellClick={handleCellClick}
          flipped={flipped}
          setupPiece={setupMode ? setupPiece : undefined}
        />
        <HandArea
          hand={gameState.hand.black}
          player="black"
          onDrop={!setupMode && gameState.turn === 'black' ? handleHandClick : undefined}
          selectedDrop={gameState.turn === 'black' ? selectedDrop : null}
        />

        {/* 操作ボタン */}
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14 }}>
            {winner
              ? `${winner === 'black' ? '先手' : '後手'}の勝ち！`
              : setupMode ? '局面を設定中'
              : `${gameState.turn === 'black' ? '先手' : '後手'}の番`}
          </span>
          {!setupMode && (
            <>
              <button
                onClick={undoMove}
                disabled={stateHistory.length === 0}
                style={{ padding: '4px 12px', opacity: stateHistory.length === 0 ? 0.5 : 1 }}
              >
                ← 1手戻る
              </button>
              <button
                onClick={() => { setSetupMode(true); setSelected(null); setSelectedDrop(null); }}
                style={{ padding: '4px 12px' }}
              >
                局面設定
              </button>
              <button onClick={resetGame} style={{ padding: '4px 12px' }}>リセット</button>
            </>
          )}
        </div>

        {/* セットアップパネル */}
        {setupMode && (
          <div style={{ marginTop: 12 }}>
            <SetupPanel
              state={gameState}
              selectedPiece={setupPiece}
              onSelectPiece={setSetupPiece}
              onChangeTurn={turn => setGameState(s => ({ ...s, turn }))}
              onChangeHand={handleChangeHand}
              onDone={handleSetupDone}
              onReset={resetGame}
            />
          </div>
        )}
      </div>

      {/* 評価パネル */}
      {!setupMode && (
        <div style={{ minWidth: 300, flex: 1 }}>
          <h3 style={{ margin: '0 0 12px' }}>完全解析評価</h3>
          <EvalChart history={evalHistory} />

          <div style={{ fontSize: 14, margin: '12px 0 8px' }}>
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
      )}
    </div>
  );
}
