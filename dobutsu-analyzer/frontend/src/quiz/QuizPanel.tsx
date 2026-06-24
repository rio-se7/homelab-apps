import { useState, useEffect, useCallback, useMemo } from 'react';
import Board from '../components/Board';
import HandArea from '../components/HandArea';
import { type Move, type MoveRecord, isBoardMove, type DropMove } from '../engine/types';
import { legalMoves, encodeForApi, apiMoveToKifu } from '../engine/board';
import { fetchMoves, type MoveEval } from '../api/client';
import { matchPlayed } from '../analysis/blunderReport';
import { loadStore, saveStore, review, stats, type SrsStore } from './srs';
import { dueQuizItems, type QuizItem } from './positions';

interface Props {
  onExit: () => void;
}

interface Verdict {
  correct: boolean;
  playedKifu: string;
  bestKifu: string;
  bestResult: 'win' | 'lose' | 'draw';
}

const resultJp = (r: string) => (r === 'win' ? '勝ち' : r === 'lose' ? '負け' : '引き分け');

export default function QuizPanel({ onExit }: Props) {
  const [store, setStore] = useState<SrsStore>(() => loadStore());
  // Snapshot the due queue once at session start so reviewing a card mid-session
  // doesn't reshuffle the remaining questions.
  const [queue, setQueue] = useState<QuizItem[]>(() => dueQuizItems(loadStore()));
  const [qIndex, setQIndex] = useState(0);

  const [candidates, setCandidates] = useState<MoveEval[] | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  // board interaction (positions are always black-to-move / normalized)
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [selectedDrop, setSelectedDrop] = useState<number | null>(null);

  // session stats
  const [session, setSession] = useState({ answered: 0, correct: 0, streak: 0 });

  const current = queue[qIndex] ?? null;
  const validMoves = useMemo(() => (current && !verdict ? legalMoves(current.state) : []), [current, verdict]);
  const storeStats = useMemo(() => stats(store), [store]);

  // Fetch the engine's best-first move list for the current position (eval hidden from
  // user). Per-question UI state is reset by next()/restart(), so the effect only performs
  // the async fetch and writes candidates from the (cancellable) callback.
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    fetchMoves(encodeForApi(current.state))
      .then(r => { if (!cancelled) setCandidates(r.moves); })
      .catch(() => { if (!cancelled) setCandidates([]); });
    return () => { cancelled = true; };
  }, [current]);

  const grade = useCallback((mv: Move) => {
    if (!current || !candidates || candidates.length === 0 || verdict) return;
    const best = candidates[0];
    // Reuse the coordinate-based matcher: a Move carries the same board-frame `notation`.
    const rec = { notation: mv.notation, to: mv.to, turn: 'black' } as MoveRecord;
    const played = matchPlayed(candidates, current.state, rec) ?? best;
    const correct = played.result === best.result;

    const nextStore = review(store, current.key, correct);
    saveStore(nextStore);
    setStore(nextStore);

    setVerdict({
      correct,
      playedKifu: apiMoveToKifu(played.mv, current.state),
      bestKifu: apiMoveToKifu(best.mv, current.state),
      bestResult: best.result,
    });
    setSession(s => ({
      answered: s.answered + 1,
      correct: s.correct + (correct ? 1 : 0),
      streak: correct ? s.streak + 1 : 0,
    }));
    setSelected(null);
    setSelectedDrop(null);
  }, [current, candidates, verdict, store]);

  const handleCellClick = useCallback((x: number, y: number) => {
    if (!current || verdict) return;
    if (selectedDrop !== null) {
      const drop = validMoves.find(
        m => !isBoardMove(m) && (m as DropMove).piece === selectedDrop && m.to[0] === x && m.to[1] === y,
      );
      if (drop) grade(drop);
      else setSelectedDrop(null);
      return;
    }
    const piece = current.state.board[x][y];
    if (piece > 0) { setSelected([x, y]); return; } // black piece (black to move)
    if (selected) {
      const mv = validMoves.find(
        m => isBoardMove(m) && m.from[0] === selected[0] && m.from[1] === selected[1] && m.to[0] === x && m.to[1] === y,
      );
      if (mv) grade(mv);
      else setSelected(null);
    }
  }, [current, verdict, selected, selectedDrop, validMoves, grade]);

  const handleHandClick = useCallback((piece: number) => {
    if (verdict) return;
    setSelected(null);
    setSelectedDrop(prev => (prev === piece ? null : piece));
  }, [verdict]);

  const resetQuestionState = () => {
    setCandidates(null);
    setVerdict(null);
    setSelected(null);
    setSelectedDrop(null);
  };

  const next = useCallback(() => {
    resetQuestionState();
    setQIndex(i => i + 1);
  }, []);

  const restart = useCallback(() => {
    const fresh = loadStore();
    resetQuestionState();
    setStore(fresh);
    setQueue(dueQuizItems(fresh));
    setQIndex(0);
    setSession({ answered: 0, correct: 0, streak: 0 });
  }, []);

  const sessionRate = session.answered > 0 ? Math.round((session.correct / session.answered) * 100) : 0;
  const done = qIndex >= queue.length;

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h3 style={{ margin: 0, color: '#3a2800' }}>クイズモード（予想当て）</h3>
        <button onClick={onExit} style={{ padding: '4px 12px', fontSize: 12, marginLeft: 'auto' }}>終了</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#5a4a20',
        background: '#fff8e8', borderRadius: 6, padding: '8px 12px' }}>
        <span>今回 <strong>{session.correct}/{session.answered}</strong>（{sessionRate}%）</span>
        <span>連続正解 <strong>{session.streak}</strong></span>
        <span>残り <strong>{Math.max(0, queue.length - qIndex)}</strong></span>
        <span style={{ marginLeft: 'auto', color: '#888' }}>
          登録 {storeStats.total} / 出題待ち {storeStats.due}
        </span>
      </div>

      {queue.length === 0 ? (
        <div style={{ fontSize: 14, color: '#7a5a1a', lineHeight: 1.7, background: '#fff', borderRadius: 6, padding: 16 }}>
          出題できる局面がありません。<br />
          対局後に <strong>感想戦 →「反省点を解析」</strong> を実行すると、ブランダー局面がクイズに追加されます。
        </div>
      ) : done ? (
        <div style={{ fontSize: 15, color: '#3a2800', background: '#fff', borderRadius: 6, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>セッション終了</div>
          <div>正解 {session.correct} / {session.answered}（{sessionRate}%）</div>
          <button onClick={restart} style={{ marginTop: 16, padding: '8px 20px', fontSize: 14,
            background: '#5a8040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            もう一度（再出題分を取得）
          </button>
        </div>
      ) : current ? (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* Board */}
          <div>
            <HandArea hand={current.state.hand.white} player="white" />
            <Board
              state={current.state}
              selected={selected}
              validMoves={validMoves}
              onCellClick={handleCellClick}
              cellSize={64}
              selectedDrop={selectedDrop}
            />
            <HandArea
              hand={current.state.hand.black}
              player="black"
              onDrop={verdict ? undefined : handleHandClick}
              selectedDrop={selectedDrop}
            />
          </div>

          {/* Prompt / verdict */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!verdict ? (
              <div style={{ fontSize: 14, color: '#3a2800', lineHeight: 1.7 }}>
                <p style={{ marginTop: 0 }}><strong>▲先手番</strong>です。結果（勝ち/分け/負け）を悪化させない手を指してください。</p>
                <p style={{ color: '#888', fontSize: 13 }}>
                  {candidates === null ? '局面を読み込み中…' : '盤上の駒を選んで着手 / 持ち駒はクリックで打つ'}
                </p>
              </div>
            ) : (
              <div style={{ fontSize: 14, lineHeight: 1.8 }}>
                <div style={{
                  fontSize: 18, fontWeight: 'bold', marginBottom: 8,
                  color: verdict.correct ? '#2a7a2a' : '#c0392b',
                }}>
                  {verdict.correct ? '◯ 正解' : '✕ 不正解'}
                </div>
                <div>あなたの手: <span style={{ fontFamily: 'monospace' }}>{verdict.playedKifu}</span></div>
                <div>最善手: <span style={{ fontFamily: 'monospace' }}>{verdict.bestKifu}</span>
                  <span style={{ color: '#888' }}>（{resultJp(verdict.bestResult)}）</span></div>
                {!verdict.correct && (
                  <div style={{ marginTop: 8, color: '#c0392b', fontSize: 13 }}>
                    結果を悪化させました。この局面は後日また出題されます。
                  </div>
                )}
                <button onClick={next} style={{ marginTop: 16, padding: '8px 20px', fontSize: 14,
                  background: '#5a8040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                  次へ →
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
