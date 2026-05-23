import { useState } from 'react'
import { type Feed, api } from '../api/client.ts'

interface Props {
  feeds: Feed[]
  onUpdate: () => void
}

export function FeedManager({ feeds, onUpdate }: Props) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add() {
    if (!name.trim() || !url.trim()) return
    setAdding(true)
    setError(null)
    try {
      await api.feeds.create(name.trim(), url.trim())
      setName('')
      setUrl('')
      onUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add feed')
    } finally {
      setAdding(false)
    }
  }

  async function remove(id: string) {
    try {
      await api.feeds.delete(id)
      onUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete feed')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#9ca3af' }}>RSS フィード</h2>

      {/* Add form */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="名前 (例: NHK ニュース)"
          style={inputStyle}
        />
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="RSS URL"
          style={{ ...inputStyle, flex: 2, minWidth: '200px' }}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
        />
        <button onClick={add} disabled={adding || !name || !url} style={btnStyle(!(adding || !name || !url))}>
          {adding ? '追加中…' : '追加'}
        </button>
      </div>

      {error && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}

      {/* Feed list */}
      {feeds.length === 0 ? (
        <p style={{ color: '#6b7280', margin: 0 }}>フィードがありません。RSS URL を追加してください。</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {feeds.map(f => (
            <li key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#1f2937', borderRadius: '8px', padding: '10px 14px' }}>
              <span style={{ fontWeight: 600, minWidth: '120px' }}>{f.name}</span>
              <span style={{ color: '#6b7280', fontSize: '0.85rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.url}</span>
              <button onClick={() => remove(f.id)} style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '0.8rem' }}>
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '8px 12px', fontSize: '0.95rem',
  borderRadius: '6px', border: '1px solid #374151',
  background: '#1f2937', color: '#f3f4f6',
  minWidth: '140px',
}

const btnStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 18px', borderRadius: '6px', border: 'none',
  background: active ? '#3b82f6' : '#374151',
  color: '#fff', cursor: active ? 'pointer' : 'not-allowed',
  fontWeight: 600, fontSize: '0.95rem',
})
