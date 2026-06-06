import { useState, useEffect, useCallback, useRef } from 'react';
import Board from './components/Board';
import HandArea from './components/HandArea';
import EvalChart, { type EvalPoint } from './components/EvalChart';
import SetupPanel from './components/SetupPanel';
import { type GameState, type Move, type DropMove, isBoardMove, EMPTY } from './engine/types';
import {
  initialState, legalMoves, applyMove, checkWinner,
  encodeForApi, toKifuNotation, apiMoveToKifu, moveFromApiNotation,
} from './engine/board';
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
  const [blackMoveEvals, setBlackMoveEvals] = useState<MoveEval[]>([]);
  const [whiteMoveEvals, setWhiteMoveEvals] = useState<MoveEval[]>([]);
  const [evalHistory, setEvalHistory] = useState<EvalPoint[]>([]);
  const [winner, setWinner] = useState<'black' | 'white' | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [setupPiece, setSetupPiece] = useState<number | null>(null);
  const [cellSize, setCellSize] = useState(80);
  const boardAreaRef = useRef<HTMLDivElement>(null);

  // 感想戦モード
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewEvals, setReviewEvals] = useState<{ black: MoveEval[]; white: MoveEval[] }>({ black: [], white: [] });

  // シミュレーション（感想戦中に合法手を選択 → 最善手で終局まで展開）
  const [simLine, setSimLine] = useState<GameState[]>([]);
  const [simStep, setSimStep] = useState(0);
  const [isLoadingSim, setIsLoadingSim] = useState(false);
  const [simEvals, setSimEvals] = useState<{ black: MoveEval[]; white: MoveEval[] }>({ black: [], white: [] });
  const inSim = simLine.length > 0;

  // 盤面コンテナのサイズに合わせてセルサイズを計算
  useEffect(() => {
    const el = boardAreaRef.current;
    if (!el) return;
    const calc = () => {
      // 高さ: コンテナ高 - タイトル(30px) - HandArea×2(68px) - コントローラー(44px) - ラベル行(20px)
      const fromH = Math.floor((el.clientHeight - 162) / 4);
      // 幅: ボード幅 = frame(8px) + labelCol(CELL*0.26) + 3*CELL ≈ CELL*3.26 + 8
      //   → CELL = (containerWidth - 8) / 3.3 (少し余裕を持つ)
      const fromW = Math.floor((el.clientWidth - 8) / 3.3);
      setCellSize(Math.max(60, Math.min(fromH, fromW, 260)));
    };
    const obs = new ResizeObserver(calc);
    obs.observe(el);
    calc();
    return () => obs.disconnect();
  }, []);

  // 初期評価
  useEffect(() => {
    const pos = encodeForApi(initialState());
    fetchEval(pos).then(r => {
      setEvalHistory([{ move: 0, score: toScore(r.result, r.dtm, 'black'), notation: '初期局面' }]);
    }).catch(() => {});
  }, []);

  // 全局面配列 (感想戦ナビゲーション用)
  const allPositions = [...stateHistory, gameState];

  // 表示する局面: シミュレーション中 > 感想戦 > 通常
  const currentDisplayState = inSim
    ? simLine[simStep]
    : reviewMode
    ? (allPositions[reviewIndex] ?? gameState)
    : gameState;

  // 感想戦: reviewIndex 変化時に評価を取得
  useEffect(() => {
    if (!reviewMode) return;
    const state = allPositions[reviewIndex];
    if (!state) return;
    const bp = encodeForApi({ ...state, turn: 'black' });
    const wp = encodeForApi({ ...state, turn: 'white' });
    Promise.all([fetchMoves(bp), fetchMoves(wp)])
      .then(([b, w]) => setReviewEvals({ black: b.moves, white: w.moves }))
      .catch(() => {});
  }, [reviewMode, reviewIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // シミュレーション: simStep 変化時に現局面の評価を取得
  useEffect(() => {
    if (!inSim) return;
    const state = simLine[simStep];
    if (!state) return;
    setSimEvals({ black: [], white: [] });
    const bp = encodeForApi({ ...state, turn: 'black' });
    const wp = encodeForApi({ ...state, turn: 'white' });
    Promise.all([fetchMoves(bp), fetchMoves(wp)])
      .then(([b, w]) => setSimEvals({ black: b.moves, white: w.moves }))
      .catch(() => {});
  }, [inSim, simStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // 局面変化ごとに両者の合法手と評価を取得
  useEffect(() => {
    if (winner || setupMode) return;
    setValidMoves(legalMoves(gameState));
    setEvalError(null);

    const blackPos = encodeForApi({ ...gameState, turn: 'black' });
    const whitePos = encodeForApi({ ...gameState, turn: 'white' });

    fetchMoves(blackPos)
      .then(r => setBlackMoveEvals(r.moves))
      .catch(e => setEvalError(String(e)));
    fetchMoves(whitePos)
      .then(r => setWhiteMoveEvals(r.moves))
      .catch(() => {});
  }, [gameState, winner, setupMode]);

  const resetGame = useCallback(() => {
    const init = initialState();
    setGameState(init);
    setStateHistory([]);
    setSelected(null);
    setSelectedDrop(null);
    setValidMoves([]);
    setBlackMoveEvals([]);
    setWhiteMoveEvals([]);
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
        notation: toKifuNotation(move.notation, gameState.turn),
      }]);
    }).catch(() => {});

    const w = checkWinner(newState, move);
    if (w) setWinner(w);
  }, [gameState]);

  const handleCellClick = useCallback((x: number, y: number) => {
    if (setupMode) {
      if (setupPiece === null) return;
      const newBoard = gameState.board.map(col => [...col]);
      newBoard[x][y] = newBoard[x][y] === setupPiece ? EMPTY : setupPiece;
      setGameState(s => ({ ...s, board: newBoard }));
      return;
    }
    if (winner) return;
    if (selectedDrop !== null) {
      const drop = validMoves.find(
        m => !isBoardMove(m) && (m as DropMove).piece === selectedDrop && m.to[0] === x && m.to[1] === y
      );
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

  const handleSetupDone = useCallback(() => {
    setSetupMode(false);
    setSetupPiece(null);
    setStateHistory([]);
    setWinner(null);
    setBlackMoveEvals([]);
    setWhiteMoveEvals([]);
    const pos = encodeForApi(gameState);
    fetchEval(pos).then(r => {
      setEvalHistory([{ move: 0, score: toScore(r.result, r.dtm, gameState.turn), notation: 'セットアップ局面' }]);
    }).catch(() => setEvalHistory([]));
  }, [gameState]);

  // シミュレーション: 感想戦中に選択した手を起点に双方最善手で終局まで計算
  const startSimulation = useCallback(async (mv: string, asBlack: boolean) => {
    const reviewState = allPositions[reviewIndex];
    if (!reviewState) return;

    const startState: GameState = { ...reviewState, turn: asBlack ? 'black' : 'white' };
    const firstMove = moveFromApiNotation(mv, startState);
    if (!firstMove) return;

    setIsLoadingSim(true);

    const line: GameState[] = [startState];
    let state = applyMove(startState, firstMove);
    line.push(state);
    let w = checkWinner(state, firstMove);

    for (let i = 0; i < 100 && !w; i++) {
      const pos = encodeForApi(state);
      let resp;
      try { resp = await fetchMoves(pos); } catch { break; }
      if (!resp.moves.length) break;

      const nextMove = moveFromApiNotation(resp.moves[0].mv, state);
      if (!nextMove) break;

      state = applyMove(state, nextMove);
      line.push(state);
      w = checkWinner(state, nextMove);
    }

    setSimLine(line);
    setSimStep(1);
    setIsLoadingSim(false);
  }, [allPositions, reviewIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const exitSim = useCallback(() => {
    setSimLine([]);
    setSimStep(0);
    setSimEvals({ black: [], white: [] });
  }, []);

  const handleChangeHand = useCallback((player: 'black' | 'white', pieceType: number, delta: number) => {
    setGameState(s => {
      const hand = { black: [...s.hand.black], white: [...s.hand.white] };
      hand[player][pieceType - 1] = Math.min(2, Math.max(0, hand[player][pieceType - 1] + delta));
      return { ...s, hand };
    });
  }, []);

  // 合法手の評価行（棋譜と同じ形式）
  function MoveEvalRow({ me, evalState, onClick }: { me: MoveEval; evalState: GameState; onClick?: () => void }) {
    const label = apiMoveToKifu(me.mv, evalState);
    const bg = me.result === 'win' ? '#d4edda' : me.result === 'lose' ? '#f8d7da' : '#fff3cd';
    const wdl = me.result === 'win' ? '勝' : me.result === 'lose' ? '負' : '分';
    return (
      <div
        onClick={onClick}
        title={onClick ? 'クリックでシミュレーション' : undefined}
        style={{
          padding: '3px 6px', marginBottom: 2, background: bg,
          borderRadius: 3, fontSize: 14,
          display: 'flex', justifyContent: 'space-between', gap: 4,
          cursor: onClick ? 'pointer' : 'default',
          outline: onClick ? undefined : undefined,
          transition: 'filter 0.1s',
        }}
        onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.filter = 'brightness(0.93)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = ''; }}
      >
        <span style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ color: '#555', whiteSpace: 'nowrap' }}>
          {wdl}{me.dtm > 0 ? ` ${me.dtm + 1}手` : ''}
        </span>
      </div>
    );
  }

  const simWinner = inSim ? checkWinner(simLine[simLine.length - 1], null) : null;
  const simCurrentNotation = inSim && simStep > 0
    ? (() => {
        const rec = simLine[simStep].history[simLine[simStep].history.length - 1];
        return rec ? toKifuNotation(rec.notation, simLine[simStep - 1].turn) : '';
      })()
    : '';

  const statusText = inSim
    ? (simStep === simLine.length - 1 && simWinner
        ? `${simWinner === 'black' ? '先手' : '後手'}の勝ち（シミュレーション）`
        : `シミュレーション ${simStep}/${simLine.length - 1}手目`)
    : reviewMode
    ? `感想戦 ${reviewIndex === 0 ? '初期局面' : `${reviewIndex}手目`}`
    : winner
    ? `${winner === 'black' ? '先手' : '後手'}の勝ち！`
    : setupMode ? '局面を設定中'
    : `${gameState.turn === 'black' ? '先手' : '後手'}の番`;

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24, display: 'flex', gap: 32, background: '#faf6ee', height: '100vh', boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* 盤面エリア — 1:2 比率 */}
      <div ref={boardAreaRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', minWidth: 0 }}>
        <h2 style={{ margin: '0 0 8px', color: '#3a2800' }}>どうぶつしょうぎ解析</h2>

        <HandArea
          hand={currentDisplayState.hand.white}
          player="white"
          onDrop={!setupMode && !reviewMode && !inSim && gameState.turn === 'white' ? handleHandClick : undefined}
          selectedDrop={gameState.turn === 'white' ? selectedDrop : null}
        />
        <Board
          state={currentDisplayState}
          selected={reviewMode || inSim ? null : selected}
          validMoves={setupMode || reviewMode || inSim ? [] : validMoves}
          onCellClick={reviewMode || inSim ? () => {} : handleCellClick}
          flipped={flipped}
          setupPiece={setupMode ? setupPiece : undefined}
          cellSize={cellSize}
        />
        <HandArea
          hand={currentDisplayState.hand.black}
          player="black"
          onDrop={!setupMode && !reviewMode && !inSim && gameState.turn === 'black' ? handleHandClick : undefined}
          selectedDrop={gameState.turn === 'black' ? selectedDrop : null}
        />

        {/* コントローラー */}
        <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 誰の番 */}
          <span style={{ fontSize: 13, color: '#3a2800', fontWeight: 'bold', minWidth: 60 }}>{statusText}</span>

          {!setupMode && !reviewMode && (
            <>
              <button onClick={undoMove} disabled={stateHistory.length === 0}
                style={{ padding: '4px 10px', fontSize: 12, opacity: stateHistory.length === 0 ? 0.5 : 1 }}>
                ← 1手戻る
              </button>
              <button
                onClick={() => { setReviewMode(true); setReviewIndex(allPositions.length - 1); setReviewEvals({ black: [], white: [] }); }}
                disabled={stateHistory.length === 0}
                style={{ padding: '4px 10px', fontSize: 12, opacity: stateHistory.length === 0 ? 0.5 : 1 }}>
                感想戦
              </button>
              <button onClick={() => { setSetupMode(true); setSelected(null); setSelectedDrop(null); }}
                style={{ padding: '4px 10px', fontSize: 12 }}>
                局面設定
              </button>
              <button onClick={resetGame} style={{ padding: '4px 10px', fontSize: 12 }}>
                リセット
              </button>
            </>
          )}

          {/* シミュレーションナビゲーション */}
          {inSim && (
            <>
              <button onClick={() => setSimStep(s => Math.max(0, s - 1))} disabled={simStep === 0}
                style={{ padding: '4px 8px', fontSize: 12, opacity: simStep === 0 ? 0.4 : 1 }}>◀</button>
              <span style={{ fontSize: 12, color: '#555', minWidth: 80, textAlign: 'center' }}>
                {simStep === 0 ? '開始局面' : `${simStep}/${simLine.length - 1}手 ${simCurrentNotation}`}
              </span>
              <button onClick={() => setSimStep(s => Math.min(simLine.length - 1, s + 1))} disabled={simStep === simLine.length - 1}
                style={{ padding: '4px 8px', fontSize: 12, opacity: simStep === simLine.length - 1 ? 0.4 : 1 }}>▶</button>
              <button onClick={exitSim}
                style={{ padding: '4px 10px', fontSize: 12, marginLeft: 4 }}>シミュレーション終了</button>
            </>
          )}

          {/* 感想戦ナビゲーション */}
          {reviewMode && !inSim && (
            <>
              <button onClick={() => setReviewIndex(0)} disabled={reviewIndex === 0}
                style={{ padding: '4px 8px', fontSize: 12, opacity: reviewIndex === 0 ? 0.4 : 1 }}>|◀</button>
              <button onClick={() => setReviewIndex(i => Math.max(0, i - 1))} disabled={reviewIndex === 0}
                style={{ padding: '4px 8px', fontSize: 12, opacity: reviewIndex === 0 ? 0.4 : 1 }}>◀</button>
              <span style={{ fontSize: 12, color: '#555', minWidth: 64, textAlign: 'center' }}>
                {reviewIndex === 0 ? '初期局面' : `${reviewIndex}手目`} / {allPositions.length - 1}手
              </span>
              <button onClick={() => setReviewIndex(i => Math.min(allPositions.length - 1, i + 1))} disabled={reviewIndex === allPositions.length - 1}
                style={{ padding: '4px 8px', fontSize: 12, opacity: reviewIndex === allPositions.length - 1 ? 0.4 : 1 }}>▶</button>
              <button onClick={() => setReviewIndex(allPositions.length - 1)} disabled={reviewIndex === allPositions.length - 1}
                style={{ padding: '4px 8px', fontSize: 12, opacity: reviewIndex === allPositions.length - 1 ? 0.4 : 1 }}>▶|</button>
              <button onClick={() => setReviewMode(false)}
                style={{ padding: '4px 10px', fontSize: 12, marginLeft: 4 }}>終了</button>
            </>
          )}

          {/* 後手視点トグル */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: '#7a5a1a', marginLeft: 'auto' }}>
            <span>後手視点</span>
            <div onClick={() => setFlipped(f => !f)} style={{
              width: 36, height: 20, borderRadius: 10,
              background: flipped ? '#c8a84a' : '#ccc',
              position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 2, left: flipped ? 18 : 2,
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </div>
          </label>
        </div>

      </div>

      {/* 右カラム: 評価パネル or セットアップパネル */}
      {setupMode ? (
        <div style={{ flex: 2, minWidth: 0, overflowY: 'auto' }}>
          <SetupPanel
            state={gameState} selectedPiece={setupPiece}
            onSelectPiece={setSetupPiece}
            onChangeTurn={turn => setGameState(s => ({ ...s, turn }))}
            onChangeHand={handleChangeHand}
            onDone={handleSetupDone}
            onReset={resetGame}
          />
        </div>
      ) : (
        <div style={{ flex: 2, minWidth: 0 }}>
          <h3 style={{ margin: '0 0 12px', color: '#3a2800' }}>完全解析評価</h3>
          <EvalChart history={evalHistory} highlightMove={reviewMode ? reviewIndex : undefined} />

          {evalError && <div style={{ fontSize: 12, color: '#c00', margin: '8px 0' }}>{evalError}</div>}

          {/* 先手・後手の合法手（横並び） */}
          {isLoadingSim && (
            <div style={{ fontSize: 13, color: '#7a5a1a', marginTop: 12, padding: '6px 8px', background: '#fff8e8', borderRadius: 4 }}>
              シミュレーション計算中…
            </div>
          )}
          {!isLoadingSim && (
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            {(() => {
              const evalBase = inSim ? simLine[simStep] : reviewMode ? allPositions[reviewIndex] : gameState;
              const blackEvals = inSim ? simEvals.black : reviewMode ? reviewEvals.black : blackMoveEvals;
              const whiteEvals = inSim ? simEvals.white : reviewMode ? reviewEvals.white : whiteMoveEvals;
              const canClick = reviewMode && !inSim;
              return (
                <>
                  {/* 先手 */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#7a5a1a', fontWeight: 'bold', marginBottom: 4 }}>
                      ▲先手の合法手{canClick && <span style={{ fontWeight: 'normal', color: '#aaa' }}> (クリックで展開)</span>}
                    </div>
                    <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                      {blackEvals.map((me, i) => (
                        <MoveEvalRow
                          key={i} me={me}
                          evalState={{ ...evalBase, turn: 'black' as const }}
                          onClick={canClick ? () => startSimulation(me.mv, true) : undefined}
                        />
                      ))}
                    </div>
                  </div>
                  {/* 後手 */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#7a5a1a', fontWeight: 'bold', marginBottom: 4 }}>
                      △後手の合法手{canClick && <span style={{ fontWeight: 'normal', color: '#aaa' }}> (クリックで展開)</span>}
                    </div>
                    <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                      {whiteEvals.map((me, i) => (
                        <MoveEvalRow
                          key={i} me={me}
                          evalState={{ ...evalBase, turn: 'white' as const }}
                          onClick={canClick ? () => startSimulation(me.mv, false) : undefined}
                        />
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
          )}

          {/* 棋譜: コンパクトなフロー表示 */}
          {gameState.history.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: '#7a5a1a', fontWeight: 'bold', marginBottom: 4 }}>棋譜</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', fontSize: 13, fontFamily: 'monospace', color: '#444', maxHeight: 160, overflowY: 'auto' }}>
                {gameState.history.map((rec, i) => {
                  const isReviewing = reviewMode && reviewIndex === i + 1;
                  return (
                    <span
                      key={i}
                      onClick={() => { setReviewMode(true); setReviewIndex(i + 1); }}
                      style={{
                        whiteSpace: 'nowrap',
                        color: rec.turn === 'black' ? '#333' : '#666',
                        background: isReviewing ? '#ffe060' : undefined,
                        borderRadius: 3, padding: isReviewing ? '0 2px' : undefined,
                        cursor: 'pointer',
                      }}
                    >
                      {i + 1}.{toKifuNotation(rec.notation, rec.turn)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
