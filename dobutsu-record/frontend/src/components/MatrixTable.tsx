import { useMemo } from 'react'
import type { Match } from '../api/client'
import { computeMatrix, type Standing } from '../lib/stats'

interface Props {
  standings: Standing[]
  matches: Match[]
}

/** Cell background tinted by the row player's win rate against the column player. */
function tint(wins: number, losses: number): string {
  const decided = wins + losses
  if (decided === 0) return 'transparent'
  const rate = wins / decided
  // green for >0.5, red for <0.5
  const hue = rate >= 0.5 ? 140 : 0
  const strength = Math.abs(rate - 0.5) * 2 // 0..1
  return `hsla(${hue}, 60%, 45%, ${0.15 + strength * 0.45})`
}

export default function MatrixTable({ standings, matches }: Props) {
  const matrix = useMemo(() => computeMatrix(matches), [matches])
  // Only show members who have played at least one game.
  const players = useMemo(
    () => standings.filter((s) => s.played > 0),
    [standings],
  )

  if (players.length === 0) {
    return (
      <div className="card">
        <p>まだ対局がありません。「記録」タブから登録してください。</p>
      </div>
    )
  }

  return (
    <div className="card matrix-card">
      <p className="hint">
        行のプレイヤーから見た成績（<b>勝-敗</b>、引分は括弧）。緑＝勝ち越し / 赤＝負け越し。
      </p>
      <div className="matrix-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th className="corner">＼</th>
              {players.map((p) => (
                <th key={p.id} className="col-head">
                  {p.name}
                </th>
              ))}
              <th className="total-head">通算</th>
              <th className="total-head">勝率</th>
            </tr>
          </thead>
          <tbody>
            {players.map((row) => (
              <tr key={row.id}>
                <th className="row-head">{row.name}</th>
                {players.map((col) => {
                  if (row.id === col.id) {
                    return <td key={col.id} className="diag">—</td>
                  }
                  const c = matrix.get(row.id)?.get(col.id)
                  const wins = c?.wins ?? 0
                  const losses = c?.losses ?? 0
                  const draws = c?.draws ?? 0
                  return (
                    <td
                      key={col.id}
                      style={{ background: tint(wins, losses) }}
                    >
                      {wins + losses + draws === 0 ? (
                        <span className="muted">·</span>
                      ) : (
                        <>
                          {wins}-{losses}
                          {draws > 0 && <span className="draws">({draws})</span>}
                        </>
                      )}
                    </td>
                  )
                })}
                <td className="total-cell">
                  {row.wins}-{row.losses}
                  {row.draws > 0 && <span className="draws">({row.draws})</span>}
                </td>
                <td className="total-cell">
                  {(row.winRate * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
