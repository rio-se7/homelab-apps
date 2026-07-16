import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import Board from './components/Board';
import HandArea from './components/HandArea';
import EvalChart, { type EvalPoint } from './components/EvalChart';
import SetupPanel from './components/SetupPanel';
import { type GameState, type Move, isBoardMove, EMPTY } from './engine/types';
import {
  initialState, legalMoves, applyMove, checkWinner,
  encodeForApi, toKifuNotation, apiMoveToKifu, moveFromApiNotation,
  encodeKifu, decodeKifu, unpackPosition,
} from './engine/board';

function parseStartFromUrl() {
  const hash = window.location.hash;
  if (hash.startsWith('#k=')) {
    const result = decodeKifu(hash.slice(3));
    if (result) {
      return {
        gameState: result.states[result.states.length - 1],
        stateHistory: result.states.slice(0, -1) as GameState[],
        isFromUrl: true,
      };
    }
  }
  if (hash.startsWith('#s=')) {
    const decoded = unpackPosition(hash.slice(3));
    if (decoded) return { gameState: decoded, stateHistory: [] as GameState[], isFromUrl: true };
  }
  return { gameState: initialState(), stateHistory: [] as GameState[], isFromUrl: false };
}
import { fetchEval, fetchMoves, type MoveEval } from './api/client';
import { toScore } from './engine/score';
import { analyzeCritical } from './analysis/critical';
import { findBlunders, type BlunderEntry } from './analysis/blunderReport';
import { findMissedChances, type ChanceSummary } from './analysis/missedChance';
import { buildTimeline } from './analysis/timeline';
import { loadStore, saveStore } from './quiz/srs';
import { seedTagged } from './quiz/positions';
import QuizPanel from './quiz/QuizPanel';

type AiLevel = 'strongest' | 'strong' | 'normal' | 'weak';
const AI_LEVELS: { value: AiLevel; label: string; prob: number }[] = [
  { value: 'strongest', label: '最強', prob: 1.0 },
  { value: 'strong',    label: '強い', prob: 0.9 },
  { value: 'normal',    label: '普通', prob: 0.7 },
  { value: 'weak',      label: '弱い', prob: 0.5 },
];

export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => parseStartFromUrl().gameState);
  const [stateHistory, setStateHistory] = useState<GameState[]>(() => parseStartFromUrl().stateHistory);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [selectedDrop, setSelectedDrop] = useState<number | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [blackMoveEvals, setBlackMoveEvals] = useState<MoveEval[]>([]);
  const [whiteMoveEvals, setWhiteMoveEvals] = useState<MoveEval[]>([]);
  const [evalHistory, setEvalHistory] = useState<EvalPoint[]>([]);
  const [winner, setWinner] = useState<'black' | 'white' | null>(() => checkWinner(parseStartFromUrl().gameState, null));
  const [evalError, setEvalError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [setupPiece, setSetupPiece] = useState<number | null>(null);
  const [cellSize, setCellSize] = useState(80);
  const [copied, setCopied] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [aiPlayer, setAiPlayer] = useState<'black' | 'white'>('white');
  const [aiLevel, setAiLevel] = useState<AiLevel>('normal');
  const [showAiSetup, setShowAiSetup] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const boardAreaRef = useRef<HTMLDivElement>(null);

  // 感想戦モード
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewEvals, setReviewEvals] = useState<{ black: MoveEval[]; white: MoveEval[] }>({ black: [], white: [] });

  // ブランダー解析（反省点）
  const [blunders, setBlunders] = useState<BlunderEntry[] | null>(null);
  const [chances, setChances] = useState<ChanceSummary | null>(null);
  const [analyzingBlunders, setAnalyzingBlunders] = useState(false);
  const [learnerSide, setLearnerSide] = useState<'black' | 'white'>('white');

  // クイズモード
  const [quizMode, setQuizMode] = useState(false);

  // シミュレーション（感想戦中に合法手を選択 → 最善手で終局まで展開）
  const [simLine, setSimLine] = useState<GameState[]>([]);
  const [simStep, setSimStep] = useState(0);
  const [isLoadingSim, setIsLoadingSim] = useState(false);
  const [simEvals, setSimEvals] = useState<{ black: MoveEval[]; white: MoveEval[] }>({ black: [], white: [] });
  const inSim = simLine.length > 0;

  // スマホなど狭い画面では縦積みレイアウトに切り替える
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // 盤面コンテナのサイズに合わせてセルサイズを計算
  useEffect(() => {
    const el = boardAreaRef.current;
    if (!el) return;
    const calc = () => {
      // 幅: ボード幅 = frame(8px) + labelCol(CELL*0.26) + 3*CELL ≈ CELL*3.26 + 8
      //   → CELL = (containerWidth - 8) / 3.3 (少し余裕を持つ)
      const fromW = Math.floor((el.clientWidth - 8) / 3.3);
      if (isNarrow) {
        // 縦積み時はコンテナ高が内容依存になるため幅基準で算出（端末幅に収める）
        setCellSize(Math.max(56, Math.min(fromW, 96)));
        return;
      }
      // 高さ: コンテナ高 - タイトル(30px) - HandArea×2(68px) - コントローラー(44px) - ラベル行(20px)
      const fromH = Math.floor((el.clientHeight - 162) / 4);
      setCellSize(Math.max(60, Math.min(fromH, fromW, 260)));
    };
    const obs = new ResizeObserver(calc);
    obs.observe(el);
    calc();
    return () => obs.disconnect();
  }, [isNarrow]);

  // 初期評価 (URLからロードした棋譜は全局面を並行フェッチしてグラフを再構築)
  useEffect(() => {
    const { stateHistory: initSh, gameState: initGs, isFromUrl } = parseStartFromUrl();
    const allPos = [...initSh, initGs];

    if (isFromUrl && allPos.length > 1) {
      Promise.all(allPos.map(s => fetchEval(encodeForApi(s)).catch(() => null)))
        .then(results => {
          const points: EvalPoint[] = [];
          results.forEach((r, i) => {
            if (!r) return;
            const notation = i === 0
              ? '共有局面'
              : (() => { const rec = initGs.history[i - 1]; return rec ? toKifuNotation(rec.notation, rec.turn) : `${i}手目`; })();
            points.push({ move: i, score: toScore(r.result, r.dtm, allPos[i].turn), notation });
          });
          setEvalHistory(points);
        });
    } else {
      const startState = allPos[0];
      fetchEval(encodeForApi(startState)).then(r => {
        const notation = isFromUrl ? '共有局面' : '初期局面';
        setEvalHistory([{ move: 0, score: toScore(r.result, r.dtm, startState.turn), notation }]);
      }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 全局面配列 (感想戦ナビゲーション用)
  const allPositions = [...stateHistory, gameState];

  // ブランダー severity ("blunder"/"mistake") を SRS タグ語彙 ("critical"/"major") に正規化。
  // WDL 2段落ち = critical、1段落ち = major。見逃したチャンス側の severity はそのまま使う。
  const blunderSeverityTag = (s: BlunderEntry['severity']): string => (s === 'blunder' ? 'critical' : 'major');

  // 反省点解析: timeline を1回構築し、ブランダー検出と見逃したチャンス検出を両方走らせる。
  // 両方の局面を種別+severity タグ付きで SRS に登録（クイズ送り）。見逃したチャンスは
  // ブランダーの部分集合なので、同一局面が両方に該当すればタグは union される（seedTagged/upsert 側）。
  const runBlunderAnalysis = useCallback(() => {
    setAnalyzingBlunders(true);
    const positions = [...stateHistory, gameState];
    buildTimeline(positions, learnerSide)
      .then(timeline => {
        const report = findBlunders(positions, timeline, learnerSide);
        const chanceSummary = findMissedChances(positions, timeline, learnerSide);
        setBlunders(report);
        setChances(chanceSummary);
        const tagged = [
          ...report.map(e => ({ state: positions[e.ply - 1], tags: ['blunder', blunderSeverityTag(e.severity)] })),
          ...chanceSummary.chances.map(c => ({ state: positions[c.ply - 1], tags: ['missed-chance', c.severity] })),
        ];
        if (tagged.length > 0) saveStore(seedTagged(loadStore(), tagged));
      })
      .catch(() => { setBlunders([]); setChances(null); })
      .finally(() => setAnalyzingBlunders(false));
  }, [stateHistory, gameState, learnerSide]);

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

  // AI対局: 自分の番になったら自動着手
  useEffect(() => {
    if (!aiMode || gameState.turn !== aiPlayer || winner || setupMode) return;
    let cancelled = false;
    setIsAiThinking(true);
    const timer = setTimeout(() => {
      fetchMoves(encodeForApi(gameState)).then(r => {
        if (cancelled) return;
        // 即座にライオンを取られる手（自ら王手になる手）を除外
        const safeMoves = r.moves.filter(m => !(m.result === 'lose' && m.dtm === 0));
        if (safeMoves.length === 0) {
          // 詰み: 逃げ手がない → 相手の勝ち
          setWinner(aiPlayer === 'black' ? 'white' : 'black');
          if (!cancelled) setIsAiThinking(false);
          return;
        }
        const prob = AI_LEVELS.find(l => l.value === aiLevel)?.prob ?? 0.7;
        const picked = Math.random() < prob
          ? safeMoves[0]
          : safeMoves[Math.floor(Math.random() * safeMoves.length)];
        const move = moveFromApiNotation(picked.mv, gameState);
        if (move) executeMove(move);
        if (!cancelled) setIsAiThinking(false);
      }).catch(() => { if (!cancelled) setIsAiThinking(false); });
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); setIsAiThinking(false); };
  }, [aiMode, gameState, aiPlayer, winner, setupMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const prev = stateHistory.at(-1);
    if (!prev) return;
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
        m => !isBoardMove(m) && m.piece === selectedDrop && m.to[0] === x && m.to[1] === y
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
  function MoveEvalRow({ me, evalState, onClick, isOnlyMove, onlyMoveLabel }: {
    me: MoveEval; evalState: GameState; onClick?: () => void;
    isOnlyMove?: boolean; onlyMoveLabel?: string;
  }) {
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
          border: isOnlyMove ? '2px solid #e0a020' : '2px solid transparent',
          transition: 'filter 0.1s',
        }}
        onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.filter = 'brightness(0.93)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = ''; }}
      >
        <span style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {isOnlyMove && (
            <span style={{
              fontFamily: 'sans-serif', fontSize: 11, color: '#fff', background: '#e0a020',
              borderRadius: 3, padding: '0 4px', marginRight: 4,
            }}>★{onlyMoveLabel}</span>
          )}
          {label}
        </span>
        <span style={{ color: '#555', whiteSpace: 'nowrap' }}>
          {wdl}{me.dtm > 0 ? ` ${me.dtm + 1}手` : ''}
        </span>
      </div>
    );
  }

  const simLast = inSim ? simLine.at(-1) : undefined;
  const simWinner = simLast ? checkWinner(simLast, null) : null;
  const simCurrentNotation = inSim && simStep > 0
    ? (() => {
        const rec = simLine[simStep].history.at(-1);
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
    : isAiThinking ? 'AI思考中...'
    : `${gameState.turn === 'black' ? '先手' : '後手'}の番`;

  // レスポンシブ: 狭い画面は縦積み＋ページスクロール、広い画面は横2カラム＋ビューポート固定
  const rootStyle: CSSProperties = isNarrow
    ? { fontFamily: 'sans-serif', padding: 12, display: 'flex', flexDirection: 'column', gap: 16, background: '#faf6ee', minHeight: '100vh', boxSizing: 'border-box' }
    : { fontFamily: 'sans-serif', padding: 24, display: 'flex', gap: 32, background: '#faf6ee', height: '100vh', boxSizing: 'border-box', overflow: 'hidden' };
  const boardColStyle: CSSProperties = isNarrow
    ? { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }
    : { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', minWidth: 0 };
  const panelStyle: CSSProperties = isNarrow
    ? { width: '100%', minWidth: 0 }
    : { flex: 2, minWidth: 0 };

  if (quizMode) {
    return (
      <div style={{ fontFamily: 'sans-serif', padding: isNarrow ? 12 : 24, background: '#faf6ee', minHeight: '100vh', boxSizing: 'border-box', overflow: 'auto', display: 'flex' }}>
        <QuizPanel onExit={() => setQuizMode(false)} isNarrow={isNarrow} />
      </div>
    );
  }

  return (
    <div style={rootStyle}>
      {/* 盤面エリア — デスクトップは 1:2 比率 */}
      <div ref={boardAreaRef} style={boardColStyle}>
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
          selectedDrop={!setupMode && !reviewMode && !inSim ? selectedDrop : null}
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
                onClick={() => {
                  setReviewMode(true);
                  setReviewIndex(allPositions.length - 1);
                  setReviewEvals({ black: [], white: [] });
                  setBlunders(null);
                  if (aiMode) setLearnerSide(aiPlayer === 'black' ? 'white' : 'black');
                }}
                disabled={stateHistory.length === 0}
                style={{ padding: '4px 10px', fontSize: 12, opacity: stateHistory.length === 0 ? 0.5 : 1 }}>
                感想戦
              </button>
              {!aiMode && (
                <>
                  <button onClick={() => { setSetupMode(true); setSelected(null); setSelectedDrop(null); }}
                    style={{ padding: '4px 10px', fontSize: 12 }}>
                    局面設定
                  </button>
                  <button onClick={() => setShowAiSetup(s => !s)}
                    style={{ padding: '4px 10px', fontSize: 12, background: showAiSetup ? '#c8a84a' : undefined }}>
                    AI対局
                  </button>
                </>
              )}
              <button onClick={() => setQuizMode(true)}
                style={{ padding: '4px 10px', fontSize: 12, background: '#e8dcc0' }}>
                クイズ
              </button>
              {aiMode && (
                <span style={{ fontSize: 12, color: '#7a5a1a' }}>
                  AI {aiPlayer === 'black' ? '▲先手' : '△後手'} / {AI_LEVELS.find(l => l.value === aiLevel)?.label}
                </span>
              )}
              <button onClick={() => { resetGame(); setAiMode(false); setShowAiSetup(false); setIsAiThinking(false); }}
                style={{ padding: '4px 10px', fontSize: 12 }}>
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

          {/* 棋譜共有 */}
          <button
            onClick={() => {
              const startState = stateHistory.length > 0 ? stateHistory[0] : gameState;
              const encoded = encodeKifu(startState, gameState.history);
              const url = `${window.location.origin}${window.location.pathname}#k=${encoded}`;
              window.location.hash = `k=${encoded}`;
              navigator.clipboard.writeText(url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }).catch(() => {});
            }}
            style={{ padding: '4px 10px', fontSize: 12 }}
          >
            {copied ? 'URLをコピー済み' : '棋譜を共有'}
          </button>

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

      {/* 右カラム: 評価パネル or セットアップパネル or AI設定パネル */}
      {showAiSetup ? (
        <div style={{ ...panelStyle, padding: '0 8px' }}>
          <h3 style={{ margin: '0 0 16px', color: '#3a2800' }}>AI対局設定</h3>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', color: '#7a5a1a', marginBottom: 8 }}>あなたは</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['black', 'white'] as const).map(p => {
                const isHuman = (p === 'black' ? 'white' : 'black') === aiPlayer;
                return (
                  <button key={p}
                    onClick={() => setAiPlayer(p === 'black' ? 'white' : 'black')}
                    style={{ padding: '6px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 4,
                      background: isHuman ? '#c8a84a' : '#f0e8d0', border: '1px solid #c8a84a' }}>
                    {p === 'black' ? '▲先手' : '△後手'}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', color: '#7a5a1a', marginBottom: 8 }}>難易度</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {AI_LEVELS.map(lv => (
                <button key={lv.value}
                  onClick={() => setAiLevel(lv.value)}
                  style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 4,
                    background: aiLevel === lv.value ? '#c8a84a' : '#f0e8d0', border: '1px solid #c8a84a' }}>
                  {lv.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { resetGame(); setAiMode(true); setShowAiSetup(false); }}
              style={{ padding: '8px 20px', fontSize: 13, background: '#5a8040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              対局開始
            </button>
            <button onClick={() => setShowAiSetup(false)}
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 4, cursor: 'pointer' }}>
              キャンセル
            </button>
          </div>
        </div>
      ) : setupMode ? (
        <div style={{ ...panelStyle, overflowY: 'auto' }}>
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
        <div style={panelStyle}>
          <h3 style={{ margin: '0 0 12px', color: '#3a2800' }}>完全解析評価</h3>
          <EvalChart history={evalHistory} highlightMove={reviewMode ? reviewIndex : undefined} />

          {/* 反省点（ブランダー解析）— 感想戦中のみ */}
          {reviewMode && !inSim && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#fff', borderRadius: 6, border: '1px solid #e8dcc0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: '#3a2800' }}>反省点（ブランダー解析）</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['black', 'white'] as const).map(s => (
                    <button key={s} onClick={() => setLearnerSide(s)}
                      style={{ padding: '2px 8px', fontSize: 11, borderRadius: 3, cursor: 'pointer',
                        border: '1px solid #c8a84a', background: learnerSide === s ? '#c8a84a' : '#f0e8d0' }}>
                      {s === 'black' ? '▲先手を解析' : '△後手を解析'}
                    </button>
                  ))}
                </div>
                <button onClick={runBlunderAnalysis} disabled={analyzingBlunders || allPositions.length < 2}
                  style={{ padding: '3px 10px', fontSize: 12, marginLeft: 'auto',
                    opacity: analyzingBlunders || allPositions.length < 2 ? 0.5 : 1 }}>
                  {analyzingBlunders ? '解析中…' : '反省点を解析'}
                </button>
              </div>
              {blunders !== null && (
                blunders.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#2a7a2a' }}>反省点なし — 最善を外していません 👏</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {blunders.map(b => (
                      <button key={b.ply} type="button" onClick={() => setReviewIndex(b.ply)}
                        title="クリックで該当手へジャンプ"
                        style={{ cursor: 'pointer', fontSize: 13, padding: '4px 8px', borderRadius: 4,
                          background: b.severity === 'blunder' ? '#f8d7da' : '#fff3cd',
                          border: '1px solid', borderColor: b.severity === 'blunder' ? '#e0a0a0' : '#e0c060',
                          display: 'block', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
                        <strong>{b.ply}手目</strong> {b.detail}：あなた <span style={{ fontFamily: 'monospace' }}>{b.playedKifu}</span>
                        {' / '}最善 <span style={{ fontFamily: 'monospace' }}>{b.bestKifu}</span>
                      </button>
                    ))}
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>※ ブランダー局面はクイズに登録されました</div>
                  </div>
                )
              )}
            </div>
          )}

          {/* 見逃したチャンス検出 — 相手のミスで最善結果が改善した直後に取りこぼした局面 */}
          {/* Note: EvalChart 側のマーク集合化（gift/drop の可視化）は別 issue で対応予定 */}
          {reviewMode && !inSim && chances !== null && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#fff', borderRadius: 6, border: '1px solid #e8dcc0' }}>
              <div style={{ fontSize: 13, fontWeight: 'bold', color: '#3a2800', marginBottom: 8 }}>見逃したチャンス</div>
              {chances.offered === 0 ? (
                <div style={{ fontSize: 13, color: '#666' }}>相手がチャンスをくれた局面はありませんでした</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 13, color: '#3a2800', marginBottom: 2 }}>
                    チャンス {chances.offered} 回中 {chances.missed} 回を逃した（変換率 {Math.round(chances.conversionRate * 100)}%）
                  </div>
                  {chances.chances.map(c => (
                    <button key={`${c.offeredByPly}-${c.ply}`} type="button" onClick={() => setReviewIndex(c.ply)}
                      title="クリックで該当手へジャンプ"
                      style={{ cursor: 'pointer', fontSize: 13, padding: '4px 8px', borderRadius: 4,
                        background: c.severity === 'critical' ? '#f8d7da' : '#ffe6cc',
                        border: '1px solid', borderColor: c.severity === 'critical' ? '#e0a0a0' : '#e0b060',
                        display: 'block', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
                      <strong>{c.ply}手目</strong>: 相手が{c.offeredByPly}手目で緩め、{c.fromValue}→{c.offeredValue}のチャンスを{c.keptValue}に。
                      最善は <span style={{ fontFamily: 'monospace' }}>{c.bestKifu}</span>
                      {'（あなたの手: '}<span style={{ fontFamily: 'monospace' }}>{c.playedKifu}</span>{'）'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {evalError && <div style={{ fontSize: 12, color: '#c00', margin: '8px 0' }}>{evalError}</div>}

          {/* 先手・後手の合法手（横並び） */}
          {isLoadingSim && (
            <div style={{ fontSize: 13, color: '#7a5a1a', marginTop: 12, padding: '6px 8px', background: '#fff8e8', borderRadius: 4 }}>
              シミュレーション計算中…
            </div>
          )}
          {!isLoadingSim && (
          <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', gap: 12, marginTop: 12 }}>
            {(() => {
              const evalBase = inSim ? simLine[simStep] : reviewMode ? allPositions[reviewIndex] : gameState;
              const blackEvals = inSim ? simEvals.black : reviewMode ? reviewEvals.black : blackMoveEvals;
              const whiteEvals = inSim ? simEvals.white : reviewMode ? reviewEvals.white : whiteMoveEvals;
              const canClick = reviewMode && !inSim;
              const blackCrit = analyzeCritical(blackEvals);
              const whiteCrit = analyzeCritical(whiteEvals);
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
                          isOnlyMove={i === 0 && blackCrit.isOnlyMove}
                          onlyMoveLabel={blackCrit.label}
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
                          isOnlyMove={i === 0 && whiteCrit.isOnlyMove}
                          onlyMoveLabel={whiteCrit.label}
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
