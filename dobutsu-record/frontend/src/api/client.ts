export interface Member {
  id: number
  name: string
  active: boolean
  created_at: string
}

export type MatchResult = 'black_win' | 'white_win' | 'draw'

export interface Match {
  id: number
  played_at: string
  black_id: number
  white_id: number
  result: MatchResult
  /** Whether black_id/white_id are the real 先手/後手. */
  sides_known: boolean
  note: string | null
}

export interface NewMatch {
  played_at?: string
  black_id: number
  white_id: number
  result: MatchResult
  sides_known?: boolean
  note?: string
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status}`
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch {
      // ignore parse failure
    }
    throw new Error(msg)
  }
  return res.json()
}

// ---- members ----

export async function fetchMembers(): Promise<Member[]> {
  return json(await fetch('/api/members'))
}

export async function createMember(name: string): Promise<void> {
  await json(
    await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  )
}

export async function updateMember(
  id: number,
  patch: { name?: string; active?: boolean },
): Promise<void> {
  const res = await fetch(`/api/members/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`update member failed: ${res.status}`)
}

export async function deleteMember(id: number, force = false): Promise<void> {
  const url = force ? `/api/members/${id}?force=true` : `/api/members/${id}`
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `delete member failed: ${res.status}`)
  }
}

// ---- matches ----

export async function fetchMatches(): Promise<Match[]> {
  return json(await fetch('/api/matches'))
}

export async function createMatch(m: NewMatch): Promise<void> {
  await json(
    await fetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(m),
    }),
  )
}

export interface MatchPatch {
  black_id?: number
  white_id?: number
  result?: MatchResult
  sides_known?: boolean
  note?: string
}

export async function updateMatch(id: number, patch: MatchPatch): Promise<void> {
  const res = await fetch(`/api/matches/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `update match failed: ${res.status}`)
  }
}

export async function deleteMatch(id: number): Promise<void> {
  const res = await fetch(`/api/matches/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`delete match failed: ${res.status}`)
}
