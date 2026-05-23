import { type Tile, isYaochu, isHonor, isDragon } from './tiles.ts'
import { type StandardDecomp, type Mentsu } from './decompose.ts'

export interface FuItem {
  readonly label: string
  readonly fu: number
}

export interface FuResult {
  readonly total: number  // rounded up to nearest 10
  readonly breakdown: readonly FuItem[]
}

export interface WinConditions {
  readonly winType: 'ron' | 'tsumo'
  readonly isMenzen: boolean
  readonly seatWind: 1 | 2 | 3 | 4
  readonly roundWind: 1 | 2 | 3 | 4
}

function isYakuhai(t: Tile, cond: WinConditions): boolean {
  if (!isHonor(t)) return false
  if (isDragon(t)) return true
  return t.num === cond.seatWind || t.num === cond.roundWind
}

function mentsuFu(m: Mentsu, _cond: WinConditions): number {
  if (m.type === 'shuntsu') return 0

  const base = isYaochu(m.tiles[0]) ? 2 : 1
  const openMul = m.open ? 1 : 2
  const typeMul = m.type === 'kantsu' ? 4 : 1

  return base * 2 * openMul * typeMul
}

function jantaiFu(jantai: readonly [Tile, Tile], cond: WinConditions): number {
  return isYakuhai(jantai[0], cond) ? 2 : 0
}

function waitFu(wait: StandardDecomp['wait']): number {
  return wait === 'kanchan' || wait === 'penchan' || wait === 'tanki' ? 2 : 0
}

export function calcFu(decomp: StandardDecomp, cond: WinConditions): FuResult {
  const items: FuItem[] = []

  // Base fu (fuutei)
  const isPinfu = decomp.wait === 'ryanmen' &&
    decomp.mentsu.every(m => m.type === 'shuntsu') &&
    !isYakuhai(decomp.jantai[0], cond)

  if (isPinfu && cond.winType === 'tsumo') {
    // Pinfu tsumo is fixed 20 fu
    return { total: 20, breakdown: [{ label: '副底 (平和ツモ固定)', fu: 20 }] }
  }

  items.push({ label: '副底', fu: 20 })

  // Menzen ron bonus
  if (cond.isMenzen && cond.winType === 'ron') {
    items.push({ label: '門前加符', fu: 10 })
  }

  // Tsumo fu (not pinfu)
  if (cond.winType === 'tsumo' && !isPinfu) {
    items.push({ label: '自摸符', fu: 2 })
  }

  // Mentsu fu
  for (const m of decomp.mentsu) {
    const fu = mentsuFu(m, cond)
    if (fu > 0) {
      const typeLabel = m.type === 'koutsu' ? (m.open ? '明刻' : '暗刻') : (m.open ? '明槓' : '暗槓')
      const termLabel = isYaochu(m.tiles[0]) ? '(么九)' : '(中張)'
      items.push({ label: `${typeLabel}${termLabel}`, fu })
    }
  }

  // Jantai fu
  const jfu = jantaiFu(decomp.jantai, cond)
  if (jfu > 0) {
    items.push({ label: '雀頭 (役牌)', fu: jfu })
  }

  // Wait fu
  const wfu = waitFu(decomp.wait)
  if (wfu > 0) {
    const waitNames: Record<StandardDecomp['wait'], string> = {
      kanchan: '嵌張', penchan: '辺張', tanki: '単騎',
      ryanmen: '両面', shanpon: '双碰',
    }
    items.push({ label: `待ち (${waitNames[decomp.wait]})`, fu: wfu })
  }

  const rawTotal = items.reduce((s, i) => s + i.fu, 0)
  const total = Math.ceil(rawTotal / 10) * 10

  return { total, breakdown: items }
}
