import { useMemo, useState } from 'react'
import {
  deleteMatch,
  updateMatch,
  type Match,
  type MatchResult,
  type Member,
} from '../api/client'

interface Props {
  members: Member[]
  matches: Match[]
  onChanged: () => void | Promise<void>
}

function fmtDate(iso: string): string {
  // SQLite datetime('now') is "YYYY-MM-DD HH:MM:SS" in UTC.
  const d = new Date(iso.replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Swapping 先手/後手 must also swap the result so the actual winner is preserved.
function swapResult(r: MatchResult): MatchResult {
  if (r === 'black_win') return 'white_win'
  if (r === 'white_win') return 'black_win'
  return 'draw'
}

export default function HistoryList({ members, matches, onChanged }: Props) {
  const [filter, setFilter] = useState<number | 'all'>('all')
  const [editingId, setEditingId] = useState<number | null>(null)
  const nameOf = useMemo(() => {
    const m = new Map<number, string>()
    for (const x of members) m.set(x.id, x.name)
    return (id: number) => m.get(id) ?? `#${id}`
  }, [members])

  const filtered = useMemo(() => {
    if (filter === 'all') return matches
    return matches.filter((m) => m.black_id === filter || m.white_id === filter)
  }, [matches, filter])

  const remove = async (id: number) => {
    if (!confirm('この対局を削除しますか？')) return
    await deleteMatch(id)
    await onChanged()
  }

  const toggleSides = async (m: Match) => {
    await updateMatch(m.id, { sides_known: !m.sides_known })
    await onChanged()
  }

  const swapSides = async (m: Match) => {
    await updateMatch(m.id, {
      black_id: m.white_id,
      white_id: m.black_id,
      result: swapResult(m.result),
    })
    await onChanged()
  }

  return (
    <div className="card">
      <div className="history-head">
        <h2 className="section-title">対局履歴（{filtered.length}局）</h2>
        <select
          value={filter}
          onChange={(e) =>
            setFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
          }
        >
          <option value="all">全員</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="hint">該当する対局がありません。</p>
      ) : (
        <ul className="history-list">
          {filtered.map((m) => {
            const blackWon = m.result === 'black_win'
            const whiteWon = m.result === 'white_win'
            const mark1 = m.sides_known ? '▲' : ''
            const mark2 = m.sides_known ? '△' : ''
            const editing = editingId === m.id
            return (
              <li key={m.id} className="history-item-wrap">
                <div className="history-item">
                  <span className="when">{fmtDate(m.played_at)}</span>
                  <span className={blackWon ? 'p winner' : 'p'}>
                    {mark1}{nameOf(m.black_id)}
                  </span>
                  <span className="vs">
                    {m.result === 'draw' ? '引分' : 'vs'}
                  </span>
                  <span className={whiteWon ? 'p winner' : 'p'}>
                    {mark2}{nameOf(m.white_id)}
                  </span>
                  {m.note && <span className="note">📝 {m.note}</span>}
                  <button
                    className={editing ? 'edit-btn open' : 'edit-btn'}
                    onClick={() => setEditingId(editing ? null : m.id)}
                    title="先手・後手を編集"
                  >
                    先後
                  </button>
                  <button className="del-btn" onClick={() => remove(m.id)}>
                    ✕
                  </button>
                </div>

                {editing && (
                  <div className="edit-panel">
                    <label className="sides-toggle">
                      <input
                        type="checkbox"
                        checked={m.sides_known}
                        onChange={() => toggleSides(m)}
                      />
                      先手・後手を記録する
                    </label>
                    <button
                      className="ghost-btn"
                      disabled={!m.sides_known}
                      onClick={() => swapSides(m)}
                      title={
                        m.sides_known
                          ? '▲と△を入れ替え（勝者は保持）'
                          : '先後記録がオフのため入替不可'
                      }
                    >
                      ⇄ 先手・後手を入れ替え
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
