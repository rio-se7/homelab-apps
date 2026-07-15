import { useState, useEffect, useCallback, useMemo } from 'react';
import Board from '../components/Board';
import HandArea from '../components/HandArea';
import { type Move, type MoveRecord, isBoardMove, type DropMove } from '../engine/types';
import { legalMoves, encodeForApi, apiMoveToKifu } from '../engine/board';
import { fetchMoves, type MoveEval } from '../api/client';
import { matchPlayed } from '../analysis/blunderReport';
import { loadStore, saveStore, review, stats, type SrsStore } from './srs';
import { dueQuizItems, allQuizItems, type QuizItem } from './positions';

type QuizMode = 'due' | 'all';
// 'all' = 全カード, 'missed' = 見逃したチャンスのみ, 'critical' = critical タグのみ
// (フラット union のため両方持つカードはどちらのフィルタにも出る)
type TagFilter = 'all' | 'missed' | 'critical';

const matchesFilter = (item: QuizItem, filter: TagFilter): boolean => {
  if (filter === 'all') return true;
  if (filter === 'missed') return !!item.tags?.includes('missed-chance');
  return !!item.tags?.includes('critical');
};

const buildQueue = (store: SrsStore, mode: QuizMode, filter: TagFilter): QuizItem[] =>
  (mode === 'all' ? allQuizItems(store) : dueQuizItems(store)).filter(item => matchesFilter(item, filter));

interface Props {
  onExit: () => void;
  isNarrow?: boolean;
}

interface Verdict {
  correct: boolean;
  playedKifu: string;
  bestKifu: string;
  bestResult: 'win' | 'lose' | 'draw';
}

const resultJp = (r: string) => (r === 'win' ? '勝ち' : r === 'lose' ? '負け' : '引き分け');

export default function QuizPanel({ onExit, isNarrow = false }: Props) {
  const [store, setStore] = useState<SrsStore>(() => loadStore());
  // 'due' = 出題待ちのみ（SRS本来の間隔反復）, 'all' = 登録局面を全部回す（総復習）
  const [mode, setMode] = useState<QuizMode>('due');
  // タグによる絞り込み（due/all どちらのキューにも適用）
  const [filter, setFilter] = useState<TagFilter>('all');
  // Snapshot the queue once at session start so reviewing a card mid-session
  // doesn't reshuffle the remaining questions.
  const [queue, setQueue] = useState<QuizItem[]>(() => buildQueue(loadStore(), 'due', 'all'));
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

  const restart = useCallback((nextMode: QuizMode = mode, nextFilter: TagFilter = filter) => {
    const fresh = loadStore();
    resetQuestionState();
    setStore(fresh);
    setMode(nextMode);
    setFilter(nextFilter);
    setQueue(buildQueue(fresh, nextMode, nextFilter));
    setQIndex(0);
    setSession({ answered: 0, correct: 0, streak: 0 });
  }, [mode, filter]);

  const switchMode = useCallback((next: QuizMode) => {
    if (next !== mode) restart(next, filter);
  }, [mode, filter, restart]);

  const switchFilter = useCallback((next: TagFilter) => {
    if (next !== filter) restart(mode, next);
  }, [mode, filter, restart]);

  // Filter option counts against the current mode's full (unfiltered) queue, for the segment badges.
  const filterCounts = useMemo(() => {
    const base = mode === 'all' ? allQuizItems(store) : dueQuizItems(store);
    return {
      all: base.length,
      missed: base.filter(i => i.tags?.includes('missed-chance')).length,
      critical: base.filter(i => i.tags?.includes('critical')).length,
    };
  }, [store, mode]);

  const sessionRate = session.answered > 0 ? Math.round((session.correct / session.answered) * 100) : 0;
  const done = qIndex >= queue.length;

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, color: '#3a2800' }}>クイズモード（予想当て）</h3>
        <div style={{ display: 'flex', gap: 0, marginLeft: 'auto', border: '1px solid #d8c8a0', borderRadius: 6, overflow: 'hidden' }}>
          {([['due', '出題待ち'], ['all', '全表示']] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              style={{
                padding: '4px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                background: mode === m ? '#5a8040' : '#fff',
                color: mode === m ? '#fff' : '#5a4a20',
              }}
            >{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 0, border: '1px solid #d8c8a0', borderRadius: 6, overflow: 'hidden' }}>
          {([['all', 'すべて'], ['missed', '見逃しのみ'], ['critical', 'criticalのみ']] as const).map(([f, label]) => (
            <button
              key={f}
              onClick={() => switchFilter(f)}
              style={{
                padding: '4px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                background: filter === f ? '#c8a84a' : '#fff',
                color: filter === f ? '#fff' : '#5a4a20',
              }}
            >{label}（{filterCounts[f]}）</button>
          ))}
        </div>
        <button onClick={onExit} style={{ padding: '4px 12px', fontSize: 12 }}>終了</button>
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
          {filter !== 'all' && filterCounts.all > 0 ? (
            <>このフィルタに該当する局面はありません。<br />
            上の <strong>「すべて」</strong> に切り替えると{filterCounts.all}問を出題できます。</>
          ) : mode === 'due' && storeStats.total > 0 ? (
            <>出題待ちの局面はありません（全 {storeStats.total} 問は復習間隔の待機中）。<br />
            今すぐ全部解き直すなら上の <strong>「全表示」</strong> に切り替えてください。</>
          ) : (
            <>出題できる局面がありません。<br />
            対局後に <strong>感想戦 →「反省点を解析」</strong> を実行すると、ブランダー局面がクイズに追加されます。</>
          )}
        </div>
      ) : done ? (
        <div style={{ fontSize: 15, color: '#3a2800', background: '#fff', borderRadius: 6, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>セッション終了</div>
          <div>正解 {session.correct} / {session.answered}（{sessionRate}%）</div>
          <button onClick={() => restart()} style={{ marginTop: 16, padding: '8px 20px', fontSize: 14,
            background: '#5a8040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            {mode === 'all' ? 'もう一度（全局面）' : 'もう一度（再出題分を取得）'}
          </button>
        </div>
      ) : current ? (
        <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', gap: isNarrow ? 16 : 24, alignItems: isNarrow ? 'stretch' : 'flex-start' }}>
          {/* Board */}
          <div>
            <HandArea hand={current.state.hand.white} player="white" />
            <Board
              state={current.state}
              selected={selected}
              validMoves={validMoves}
              onCellClick={handleCellClick}
              cellSize={isNarrow ? 76 : 64}
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
