export type Suit = 'man' | 'pin' | 'sou' | 'honor'
export type TileNum = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export interface Tile {
  readonly suit: Suit
  readonly num: TileNum
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.num === b.num
}

export function tileOrder(t: Tile): number {
  const s = { man: 0, pin: 1, sou: 2, honor: 3 }[t.suit]
  return s * 10 + t.num
}

export function sortTiles(tiles: readonly Tile[]): Tile[] {
  return [...tiles].sort((a, b) => tileOrder(a) - tileOrder(b))
}

export function isTerminal(t: Tile): boolean {
  return t.suit !== 'honor' && (t.num === 1 || t.num === 9)
}

export function isHonor(t: Tile): boolean {
  return t.suit === 'honor'
}

export function isYaochu(t: Tile): boolean {
  return isTerminal(t) || isHonor(t)
}

export function isSimple(t: Tile): boolean {
  return !isYaochu(t)
}

export function isDragon(t: Tile): boolean {
  return t.suit === 'honor' && t.num >= 5
}

export function isWind(t: Tile): boolean {
  return t.suit === 'honor' && t.num <= 4
}

// 1z=東, 2z=南, 3z=西, 4z=北, 5z=白, 6z=発, 7z=中
const TILE_EMOJI: Record<string, string> = {
  '1man': '🀇', '2man': '🀈', '3man': '🀉', '4man': '🀊', '5man': '🀋',
  '6man': '🀌', '7man': '🀍', '8man': '🀎', '9man': '🀏',
  '1pin': '🀙', '2pin': '🀚', '3pin': '🀛', '4pin': '🀜', '5pin': '🀝',
  '6pin': '🀞', '7pin': '🀟', '8pin': '🀠', '9pin': '🀡',
  '1sou': '🀐', '2sou': '🀑', '3sou': '🀒', '4sou': '🀓', '5sou': '🀔',
  '6sou': '🀕', '7sou': '🀖', '8sou': '🀗', '9sou': '🀘',
  '1honor': '🀀', '2honor': '🀁', '3honor': '🀂', '4honor': '🀃',
  '5honor': '🀆', '6honor': '🀅', '7honor': '🀄',
}

const HONOR_NAMES = ['東', '南', '西', '北', '白', '発', '中']

export function tileEmoji(t: Tile): string {
  return TILE_EMOJI[`${t.num}${t.suit}`] ?? '？'
}

export function tileName(t: Tile): string {
  if (t.suit === 'honor') return HONOR_NAMES[t.num - 1]
  const s = { man: '萬', pin: '筒', sou: '索' }[t.suit]
  return `${t.num}${s}`
}

export function tileKey(t: Tile): string {
  return `${t.num}${t.suit}`
}

// Parse "123m456p789s1177z" style string into Tile array
export function parseHandString(s: string): Tile[] | null {
  const tiles: Tile[] = []
  const pending: number[] = []

  for (const c of s.trim()) {
    if (c >= '1' && c <= '9') {
      pending.push(parseInt(c))
    } else if ('mpsz'.includes(c)) {
      const suit: Suit = c === 'm' ? 'man' : c === 'p' ? 'pin' : c === 's' ? 'sou' : 'honor'
      for (const n of pending) {
        if (suit === 'honor' && n > 7) return null
        tiles.push({ suit, num: n as TileNum })
      }
      pending.length = 0
    } else if (c !== ' ') {
      return null
    }
  }

  if (pending.length > 0) return null
  return tiles
}

// All 34 tile types
export const ALL_TILES: Tile[] = [
  ...([1,2,3,4,5,6,7,8,9] as TileNum[]).map(n => ({ suit: 'man' as Suit, num: n })),
  ...([1,2,3,4,5,6,7,8,9] as TileNum[]).map(n => ({ suit: 'pin' as Suit, num: n })),
  ...([1,2,3,4,5,6,7,8,9] as TileNum[]).map(n => ({ suit: 'sou' as Suit, num: n })),
  ...([1,2,3,4,5,6,7] as TileNum[]).map(n => ({ suit: 'honor' as Suit, num: n })),
]
