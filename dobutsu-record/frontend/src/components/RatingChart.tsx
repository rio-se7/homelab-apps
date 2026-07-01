import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Match, Member } from '../api/client'
import { computeRatingHistory, type Standing } from '../lib/stats'

interface Props {
  members: Member[]
  matches: Match[]
  standings: Standing[]
}

const PALETTE = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990',
  '#dcbeff', '#9a6324', '#800000', '#aaffc3', '#808000',
]

function streakLabel(s: number): string {
  if (s >= 2) return `🔥${s}連勝`
  if (s <= -2) return `❄️${-s}連敗`
  return '—'
}

export default function RatingChart({ members, matches, standings }: Props) {
  const data = useMemo(
    () => computeRatingHistory(members, matches),
    [members, matches],
  )
  // Members who have actually played, in rating order, for line colors + leaderboard.
  const ranked = useMemo(() => standings.filter((s) => s.played > 0), [standings])
  const colorOf = useMemo(() => {
    const map = new Map<string, string>()
    ranked.forEach((s, i) => map.set(s.name, PALETTE[i % PALETTE.length]))
    return map
  }, [ranked])

  return (
    <div className="card">
      <h2 className="section-title">ランキング</h2>
      <div className="leaderboard-scroll">
        <table className="leaderboard">
          <thead>
            <tr>
              <th>#</th>
              <th>名前</th>
              <th>レート</th>
              <th>勝率</th>
              <th>戦績</th>
              <th>先手勝率</th>
              <th>後手勝率</th>
              <th>調子</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((s, i) => (
              <tr key={s.id}>
                <td className="rank">{i + 1}</td>
                <td>
                  <span
                    className="dot"
                    style={{ background: colorOf.get(s.name) }}
                  />
                  {s.name}
                  {!s.active && <span className="muted"> (引退)</span>}
                </td>
                <td className="num strong">{s.rating}</td>
                <td className="num">{(s.winRate * 100).toFixed(0)}%</td>
                <td className="num">
                  {s.wins}-{s.losses}
                  {s.draws > 0 && `-${s.draws}`}
                </td>
                <td className="num">
                  {s.blackPlayed === 0
                    ? '—'
                    : `${((s.blackWins / s.blackPlayed) * 100).toFixed(0)}%`}
                </td>
                <td className="num">
                  {s.whitePlayed === 0
                    ? '—'
                    : `${((s.whiteWins / s.whitePlayed) * 100).toFixed(0)}%`}
                </td>
                <td>{streakLabel(s.streak)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">レーティング推移（Elo）</h2>
      {matches.length === 0 ? (
        <p className="hint">対局を記録すると推移グラフが表示されます。</p>
      ) : (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="label" stroke="#888" tick={{ fontSize: 11 }} />
              <YAxis stroke="#888" domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1e1e2a', border: '1px solid #444' }}
              />
              <Legend />
              {ranked.map((s) => (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={s.name}
                  stroke={colorOf.get(s.name)}
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
