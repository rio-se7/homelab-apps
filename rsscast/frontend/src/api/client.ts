export interface Feed {
  id: string
  name: string
  url: string
  createdAt: string
}

export interface Episode {
  id: string
  title: string
  script: string
  articleCount: number
  feedCount: number
  createdAt: string
  audioSize: number
}

const BASE = '/api'

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  feeds: {
    list: () => req<Feed[]>('GET', '/feeds'),
    create: (name: string, url: string) => req<Feed>('POST', '/feeds', { name, url }),
    delete: (id: string) => req<void>('DELETE', `/feeds/${id}`),
  },
  episodes: {
    list: () => req<Episode[]>('GET', '/episodes'),
    generate: () => req<Episode>('POST', '/episodes/generate'),
    audioUrl: (id: string) => `${BASE}/episodes/${id}/audio`,
  },
}
