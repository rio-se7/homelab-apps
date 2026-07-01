import { useMemo, useState } from 'react'
import { createMatch, type Member, type MatchResult } from '../api/client'

interface Props {
  members: Member[]
  onSaved: () => void | Promise<void>
}

/**
 * Match entry. Two player slots (internally black/white). 先後 recording is
 * optional: when off, the slots are just "player A/B" and the match is saved
 * with sides_known=false so it is excluded from 先後別 stats.
 */
export default function RecordForm({ members, onSaved }: Props) {
  const active = useMemo(() => members.filter((m) => m.active), [members])
  const [blackId, setBlackId] = useState<number | null>(null)
  const [whiteId, setWhiteId] = useState<number | null>(null)
  const [sidesKnown, setSidesKnown] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const ready = blackId !== null && whiteId !== null && blackId !== whiteId

  const submit = async (result: MatchResult) => {
    if (!ready || busy) return
    setBusy(true)
    setMsg(null)
    try {
      await createMatch({
        black_id: blackId!,
        white_id: whiteId!,
        result,
        sides_known: sidesKnown,
        note: note.trim() || undefined,
      })
      setNote('')
      setMsg('✅ 記録しました')
      await onSaved()
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const swap = () => {
    setBlackId(whiteId)
    setWhiteId(blackId)
  }

  const nameOf = (id: number | null) =>
    id === null ? '—' : members.find((m) => m.id === id)?.name ?? '?'

  // Side markers only shown when 先後 is being recorded.
  const mark1 = sidesKnown ? '▲' : ''
  const mark2 = sidesKnown ? '△' : ''
  const label1 = sidesKnown ? '先手 ▲' : 'プレイヤー1'
  const label2 = sidesKnown ? '後手 △' : 'プレイヤー2'

  if (active.length < 2) {
    return (
      <div className="card">
        <p>対局するには「メンバー」タブで2人以上を登録してください。</p>
      </div>
    )
  }

  return (
    <div className="card record-form">
      <label className="sides-toggle">
        <input
          type="checkbox"
          checked={sidesKnown}
          onChange={(e) => setSidesKnown(e.target.checked)}
        />
        先手・後手を記録する
      </label>

      <div className="player-pick">
        <div className="pick-col">
          <label>{label1}</label>
          <select
            value={blackId ?? ''}
            onChange={(e) => setBlackId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">選択…</option>
            {active.map((m) => (
              <option key={m.id} value={m.id} disabled={m.id === whiteId}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <button
          className="swap-btn"
          onClick={swap}
          title={sidesKnown ? '先後を入れ替え' : '入れ替え'}
        >
          ⇄
        </button>

        <div className="pick-col">
          <label>{label2}</label>
          <select
            value={whiteId ?? ''}
            onChange={(e) => setWhiteId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">選択…</option>
            {active.map((m) => (
              <option key={m.id} value={m.id} disabled={m.id === blackId}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <input
        className="note-input"
        placeholder="メモ（任意：トライ勝ち / 持ち時間 など）"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="result-buttons">
        <button
          className="win-btn black"
          disabled={!ready || busy}
          onClick={() => submit('black_win')}
        >
          {mark1}
          {nameOf(blackId)} の勝ち
        </button>
        <button
          className="draw-btn"
          disabled={!ready || busy}
          onClick={() => submit('draw')}
        >
          引き分け
        </button>
        <button
          className="win-btn white"
          disabled={!ready || busy}
          onClick={() => submit('white_win')}
        >
          {mark2}
          {nameOf(whiteId)} の勝ち
        </button>
      </div>

      {msg && <div className="form-msg">{msg}</div>}
    </div>
  )
}
