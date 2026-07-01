import { useState } from 'react'
import {
  createMember,
  deleteMember,
  updateMember,
  type Member,
} from '../api/client'
import type { Standing } from '../lib/stats'

interface Props {
  members: Member[]
  standings: Standing[]
  onChanged: () => void | Promise<void>
}

export default function MemberManager({ members, standings, onChanged }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const playedOf = new Map(standings.map((s) => [s.id, s.played]))

  const add = async () => {
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    setErr(null)
    try {
      await createMember(n)
      setName('')
      await onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const rename = async (m: Member) => {
    const next = prompt('新しい名前', m.name)?.trim()
    if (!next || next === m.name) return
    await updateMember(m.id, { name: next })
    await onChanged()
  }

  const toggleActive = async (m: Member) => {
    await updateMember(m.id, { active: !m.active })
    await onChanged()
  }

  const remove = async (m: Member) => {
    const played = playedOf.get(m.id) ?? 0
    const msg =
      played > 0
        ? `${m.name} を削除します。この人が関わった ${played}局 の対局も一緒に削除されます。よろしいですか？`
        : `${m.name} を削除しますか？`
    if (!confirm(msg)) return
    try {
      await deleteMember(m.id, played > 0)
      await onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="card">
      <div className="add-member">
        <input
          placeholder="メンバー名を追加"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button onClick={add} disabled={busy || !name.trim()}>
          ＋ 追加
        </button>
      </div>
      {err && <div className="form-msg">⚠️ {err}</div>}

      <ul className="member-list">
        {members.map((m) => {
          const played = playedOf.get(m.id) ?? 0
          return (
            <li key={m.id} className={m.active ? 'member' : 'member archived'}>
              <span className="m-name">
                {m.name}
                {!m.active && <span className="muted"> (引退)</span>}
              </span>
              <span className="m-played">{played}局</span>
              <div className="m-actions">
                <button onClick={() => rename(m)}>改名</button>
                <button onClick={() => toggleActive(m)}>
                  {m.active ? '引退' : '復帰'}
                </button>
                <button
                  className="danger"
                  onClick={() => remove(m)}
                  title={
                    played > 0
                      ? `${played}局の対局も一緒に削除されます`
                      : ''
                  }
                >
                  削除
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {members.length === 0 && (
        <p className="hint">まだメンバーがいません。上から追加してください。</p>
      )}
    </div>
  )
}
