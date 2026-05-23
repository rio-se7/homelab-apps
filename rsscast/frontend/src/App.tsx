import { useState, useEffect } from 'react'
import { type Feed, type Episode, api } from './api/client.ts'
import { FeedManager } from './components/FeedManager.tsx'
import { EpisodeList } from './components/EpisodeList.tsx'

export default function App() {
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backendOk, setBackendOk] = useState<boolean | null>(null)

  function loadFeeds() {
    api.feeds.list().then(setFeeds).catch(() => undefined)
  }

  useEffect(() => {
    fetch('/health').then(r => setBackendOk(r.ok)).catch(() => setBackendOk(false))
    api.feeds.list().then(setFeeds).catch(() => undefined)
    api.episodes.list().then(setEpisodes).catch(() => undefined)
  }, [])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const ep = await api.episodes.generate()
      setEpisodes(prev => [ep, ...prev])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Episode generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 16px' }}>
      <header style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '2rem' }}>📻</span>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>rsscast</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>
            RSS → AI 要約 → 音声ポッドキャスト
          </p>
        </div>
        <span style={{
          marginLeft: 'auto', fontSize: '0.75rem', padding: '3px 10px',
          borderRadius: '20px', fontWeight: 600,
          background: backendOk === null ? '#374151' : backendOk ? '#064e3b' : '#450a0a',
          color: backendOk === null ? '#9ca3af' : backendOk ? '#34d399' : '#ef4444',
          border: `1px solid ${backendOk === null ? '#4b5563' : backendOk ? '#34d399' : '#ef4444'}`,
        }}>
          {backendOk === null ? '確認中…' : backendOk ? 'Backend: OK' : 'Backend: オフライン'}
        </span>
      </header>

      {backendOk === false && (
        <div style={{ background: '#450a0a', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '0.9rem', color: '#fca5a5' }}>
          バックエンドが起動していません。<br />
          <code style={{ background: '#1f2937', padding: '2px 6px', borderRadius: '3px' }}>
            cd rsscast/backend && uvicorn main:app --port 8090
          </code>
        </div>
      )}

      {error && (
        <div style={{ background: '#450a0a', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#ef4444' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '20px' }}>
          <FeedManager feeds={feeds} onUpdate={loadFeeds} />
        </div>

        <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '20px' }}>
          <EpisodeList episodes={episodes} generating={generating} onGenerate={generate} />
        </div>
      </div>
    </div>
  )
}
