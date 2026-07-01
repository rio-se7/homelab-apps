import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  fetchMatches,
  fetchMembers,
  type Match,
  type Member,
} from './api/client'
import { computeStandings } from './lib/stats'
import RecordForm from './components/RecordForm'
import MatrixTable from './components/MatrixTable'
import RatingChart from './components/RatingChart'
import HistoryList from './components/HistoryList'
import MemberManager from './components/MemberManager'

type Tab = 'record' | 'matrix' | 'rating' | 'history' | 'members'

const TABS: { key: Tab; label: string }[] = [
  { key: 'record', label: '記録' },
  { key: 'matrix', label: '戦績表' },
  { key: 'rating', label: 'レーティング' },
  { key: 'history', label: '履歴' },
  { key: 'members', label: 'メンバー' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('record')
  const [members, setMembers] = useState<Member[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const [m, g] = await Promise.all([fetchMembers(), fetchMatches()])
      setMembers(m)
      setMatches(g)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial data load; setState happens after the async fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  const standings = useMemo(
    () => computeStandings(members, matches),
    [members, matches],
  )

  return (
    <div className="app">
      <header className="app-header">
        <h1>🦁 どうぶつしょうぎ 戦績表</h1>
        <span className="subtitle">
          {members.length} 人 / {matches.length} 局
        </span>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'tab active' : 'tab'}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <div className="banner error">⚠️ {error}</div>}
      {loading ? (
        <div className="banner">読み込み中…</div>
      ) : (
        <main className="content">
          {tab === 'record' && (
            <RecordForm members={members} onSaved={reload} />
          )}
          {tab === 'matrix' && (
            <MatrixTable standings={standings} matches={matches} />
          )}
          {tab === 'rating' && (
            <RatingChart members={members} matches={matches} standings={standings} />
          )}
          {tab === 'history' && (
            <HistoryList members={members} matches={matches} onChanged={reload} />
          )}
          {tab === 'members' && (
            <MemberManager members={members} standings={standings} onChanged={reload} />
          )}
        </main>
      )}
    </div>
  )
}
