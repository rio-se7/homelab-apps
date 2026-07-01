import type { Match, Member } from '../api/client'

export const INITIAL_RATING = 1500
const K = 24

/** Matches sorted oldest -> newest (chronological), for sequential processing. */
export function chronological(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => {
    if (a.played_at !== b.played_at) return a.played_at < b.played_at ? -1 : 1
    return a.id - b.id
  })
}

export interface Standing {
  id: number
  name: string
  active: boolean
  played: number
  wins: number
  losses: number
  draws: number
  winRate: number
  rating: number
  /** Positive = win streak, negative = lose streak, 0 = none / last was draw. */
  streak: number
  blackPlayed: number
  blackWins: number
  whitePlayed: number
  whiteWins: number
}

function expected(self: number, opp: number): number {
  return 1 / (1 + Math.pow(10, (opp - self) / 400))
}

/** Per-member aggregate stats including final Elo rating. */
export function computeStandings(members: Member[], matches: Match[]): Standing[] {
  const byId = new Map<number, Standing>()
  for (const m of members) {
    byId.set(m.id, {
      id: m.id,
      name: m.name,
      active: m.active,
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      rating: INITIAL_RATING,
      streak: 0,
      blackPlayed: 0,
      blackWins: 0,
      whitePlayed: 0,
      whiteWins: 0,
    })
  }

  for (const m of chronological(matches)) {
    const black = byId.get(m.black_id)
    const white = byId.get(m.white_id)
    if (!black || !white) continue // member deleted; skip

    const sBlack = m.result === 'black_win' ? 1 : m.result === 'draw' ? 0.5 : 0
    const sWhite = 1 - sBlack

    // Elo
    const eBlack = expected(black.rating, white.rating)
    black.rating += K * (sBlack - eBlack)
    white.rating += K * (sWhite - (1 - eBlack))

    // counts
    black.played++
    white.played++
    // 先後別の集計は先手/後手が判明している対局のみ対象。
    if (m.sides_known) {
      black.blackPlayed++
      white.whitePlayed++
    }

    if (m.result === 'draw') {
      black.draws++
      white.draws++
      black.streak = 0
      white.streak = 0
    } else if (m.result === 'black_win') {
      black.wins++
      white.losses++
      if (m.sides_known) black.blackWins++
      black.streak = black.streak > 0 ? black.streak + 1 : 1
      white.streak = white.streak < 0 ? white.streak - 1 : -1
    } else {
      white.wins++
      black.losses++
      if (m.sides_known) white.whiteWins++
      white.streak = white.streak > 0 ? white.streak + 1 : 1
      black.streak = black.streak < 0 ? black.streak - 1 : -1
    }
  }

  const standings = [...byId.values()]
  for (const s of standings) {
    const decided = s.wins + s.losses
    s.winRate = decided === 0 ? 0 : s.wins / decided
    s.rating = Math.round(s.rating)
  }
  // Rank by rating desc, then win rate.
  standings.sort((a, b) => b.rating - a.rating || b.winRate - a.winRate)
  return standings
}

export interface HeadToHead {
  wins: number
  losses: number
  draws: number
}

/**
 * Round-robin matrix keyed by `rowId -> colId`.
 * cell = how `row` performed against `col` (row's wins/losses/draws).
 */
export function computeMatrix(matches: Match[]): Map<number, Map<number, HeadToHead>> {
  const matrix = new Map<number, Map<number, HeadToHead>>()
  const cell = (a: number, b: number): HeadToHead => {
    let row = matrix.get(a)
    if (!row) {
      row = new Map()
      matrix.set(a, row)
    }
    let c = row.get(b)
    if (!c) {
      c = { wins: 0, losses: 0, draws: 0 }
      row.set(b, c)
    }
    return c
  }

  for (const m of matches) {
    const blackVsWhite = cell(m.black_id, m.white_id)
    const whiteVsBlack = cell(m.white_id, m.black_id)
    if (m.result === 'draw') {
      blackVsWhite.draws++
      whiteVsBlack.draws++
    } else if (m.result === 'black_win') {
      blackVsWhite.wins++
      whiteVsBlack.losses++
    } else {
      whiteVsBlack.wins++
      blackVsWhite.losses++
    }
  }
  return matrix
}

export interface RatingPoint {
  /** sequential index (0 = start) */
  idx: number
  label: string
  [memberName: string]: number | string
}

/** Elo trajectory over time for the chart — one line per member. */
export function computeRatingHistory(members: Member[], matches: Match[]): RatingPoint[] {
  const rating = new Map<number, number>()
  const nameOf = new Map<number, string>()
  for (const m of members) {
    rating.set(m.id, INITIAL_RATING)
    nameOf.set(m.id, m.name)
  }

  const snapshot = (idx: number, label: string): RatingPoint => {
    const p: RatingPoint = { idx, label }
    for (const [id, r] of rating) {
      const name = nameOf.get(id)
      if (name) p[name] = Math.round(r)
    }
    return p
  }

  const ordered = chronological(matches)
  const points: RatingPoint[] = [snapshot(0, 'start')]

  ordered.forEach((m, i) => {
    const rb = rating.get(m.black_id)
    const rw = rating.get(m.white_id)
    if (rb === undefined || rw === undefined) return
    const sBlack = m.result === 'black_win' ? 1 : m.result === 'draw' ? 0.5 : 0
    const eBlack = expected(rb, rw)
    rating.set(m.black_id, rb + K * (sBlack - eBlack))
    rating.set(m.white_id, rw + K * (1 - sBlack - (1 - eBlack)))
    points.push(snapshot(i + 1, `#${i + 1}`))
  })

  return points
}
