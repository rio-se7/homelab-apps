import { type Tile, type TileNum, sameTile, sortTiles, isHonor, isYaochu, tileKey } from './tiles.ts'

export type MentsuType = 'shuntsu' | 'koutsu' | 'kantsu'
export type WaitType = 'ryanmen' | 'penchan' | 'kanchan' | 'shanpon' | 'tanki'

export interface Mentsu {
  readonly type: MentsuType
  readonly tiles: readonly Tile[]
  readonly open: boolean
}

export interface StandardDecomp {
  readonly kind: 'standard'
  readonly jantai: readonly [Tile, Tile]
  readonly mentsu: readonly Mentsu[]
  readonly wait: WaitType
}

export interface ChiitoiDecomp {
  readonly kind: 'chiitoi'
  readonly pairs: readonly Tile[]
}

export interface KokushiDecomp {
  readonly kind: 'kokushi'
  readonly agari: Tile
}

export type Decomp = StandardDecomp | ChiitoiDecomp | KokushiDecomp

function removeFirst(tiles: Tile[], target: Tile): Tile[] | null {
  const idx = tiles.findIndex(t => sameTile(t, target))
  if (idx === -1) return null
  return [...tiles.slice(0, idx), ...tiles.slice(idx + 1)]
}

function decompMentsu(tiles: Tile[]): Mentsu[][] {
  if (tiles.length === 0) return [[]]
  if (tiles.length % 3 !== 0) return []

  const first = tiles[0]
  const results: Mentsu[][] = []

  // Try koutsu
  if (tiles.length >= 3 && sameTile(tiles[1], first) && sameTile(tiles[2], first)) {
    for (const sub of decompMentsu(tiles.slice(3))) {
      results.push([{ type: 'koutsu', tiles: [first, tiles[1], tiles[2]], open: false }, ...sub])
    }
  }

  // Try shuntsu (non-honor, num <= 7)
  if (!isHonor(first) && first.num <= 7) {
    const b: Tile = { suit: first.suit, num: (first.num + 1) as TileNum }
    const c: Tile = { suit: first.suit, num: (first.num + 2) as TileNum }
    const r1 = removeFirst(tiles.slice(1), b)
    if (r1 !== null) {
      const r2 = removeFirst(r1, c)
      if (r2 !== null) {
        for (const sub of decompMentsu(r2)) {
          results.push([{ type: 'shuntsu', tiles: [first, b, c], open: false }, ...sub])
        }
      }
    }
  }

  return results
}

function detectWait(jantai: readonly [Tile, Tile], mentsu: readonly Mentsu[], agari: Tile): WaitType {
  // Agari completes the jantai?
  if (sameTile(jantai[0], agari)) return 'tanki'

  for (const m of mentsu) {
    if (!m.tiles.some(t => sameTile(t, agari))) continue

    if (m.type === 'koutsu' || m.type === 'kantsu') return 'shanpon'

    // shuntsu: determine position of agari
    const sorted = [...m.tiles].sort((a, b) => a.num - b.num)
    const pos = sorted.findIndex(t => sameTile(t, agari))

    if (pos === 1) return 'kanchan'
    if (pos === 0) {
      // partial was [sorted[1], sorted[2]] — penchan if partial is [8,9]
      return sorted[1].num === 8 ? 'penchan' : 'ryanmen'
    }
    // pos === 2: partial was [sorted[0], sorted[1]] — penchan if partial is [1,2]
    return sorted[0].num === 1 ? 'penchan' : 'ryanmen'
  }

  return 'tanki'
}

const YAOCHU_TYPES: Tile[] = [
  { suit: 'man', num: 1 }, { suit: 'man', num: 9 },
  { suit: 'pin', num: 1 }, { suit: 'pin', num: 9 },
  { suit: 'sou', num: 1 }, { suit: 'sou', num: 9 },
  { suit: 'honor', num: 1 }, { suit: 'honor', num: 2 }, { suit: 'honor', num: 3 },
  { suit: 'honor', num: 4 }, { suit: 'honor', num: 5 }, { suit: 'honor', num: 6 },
  { suit: 'honor', num: 7 },
]

export function decomposeHand(hand14: readonly Tile[], agari: Tile): Decomp[] {
  const sorted = sortTiles(hand14)
  const results: Decomp[] = []

  // Chiitoi: exactly 7 pairs
  const freq = new Map<string, number>()
  for (const t of sorted) freq.set(tileKey(t), (freq.get(tileKey(t)) ?? 0) + 1)
  if (freq.size === 7 && [...freq.values()].every(v => v === 2)) {
    results.push({ kind: 'chiitoi', pairs: [...freq.keys()].map(k => {
      const suit = k.slice(1) as Tile['suit']
      const num = parseInt(k[0]) as TileNum
      return { suit, num }
    }) })
  }

  // Kokushi: all 13 yaochu tile types present
  const handKeys = new Set(sorted.map(tileKey))
  if (YAOCHU_TYPES.every(y => handKeys.has(tileKey(y))) && isYaochu(agari)) {
    results.push({ kind: 'kokushi', agari })
  }

  // Standard decomposition
  const tried = new Set<string>()
  for (let i = 0; i < sorted.length - 1; i++) {
    if (!sameTile(sorted[i], sorted[i + 1])) continue
    const key = tileKey(sorted[i])
    if (tried.has(key)) continue
    tried.add(key)

    const jantaiTile = sorted[i]
    const remaining = [...sorted.slice(0, i), ...sorted.slice(i + 2)]

    for (const mentsu of decompMentsu(remaining)) {
      const jantai: [Tile, Tile] = [jantaiTile, jantaiTile]
      const wait = detectWait(jantai, mentsu, agari)
      results.push({ kind: 'standard', jantai, mentsu, wait })
    }
  }

  return results
}
