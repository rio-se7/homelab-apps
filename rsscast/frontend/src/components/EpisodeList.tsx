import { useState } from 'react'
import { type Episode, api } from '../api/client.ts'

interface Props {
  episodes: Episode[]
  generating: boolean
  onGenerate: () => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function EpisodeList({ episodes, generating, onGenerate }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#9ca3af' }}>エピソード</h2>
        <button
          onClick={onGenerate}
          disabled={generating}
          style={{
            padding: '8px 18px', borderRadius: '6px', border: 'none',
            background: generating ? '#374151' : '#10b981',
            color: '#fff', cursor: generating ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: '0.95rem',
          }}
        >
          {generating ? '生成中…' : '▶ 新規生成'}
        </button>
      </div>

      {episodes.length === 0 ? (
        <p style={{ color: '#6b7280', margin: 0 }}>エピソードがありません。「新規生成」を押してください。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {episodes.map(ep => (
            <div key={ep.id} style={{ background: '#1f2937', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{ep.title}</div>
                  <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '2px' }}>
                    {formatDate(ep.createdAt)} · {ep.articleCount}記事 · {formatBytes(ep.audioSize)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                  <button
                    onClick={() => setExpanded(expanded === ep.id ? null : ep.id)}
                    style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    {expanded === ep.id ? '▲ スクリプト' : '▼ スクリプト'}
                  </button>
                </div>
              </div>

              {/* Audio player */}
              <div style={{ padding: '0 16px 14px' }}>
                <audio
                  controls
                  src={api.episodes.audioUrl(ep.id)}
                  style={{ width: '100%', height: '36px', accentColor: '#10b981' }}
                />
              </div>

              {/* Script */}
              {expanded === ep.id && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid #374151' }}>
                  <pre style={{ margin: '12px 0 0', whiteSpace: 'pre-wrap', fontSize: '0.85rem', color: '#d1d5db', lineHeight: 1.6 }}>
                    {ep.script}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
