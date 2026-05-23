import { type Tile, sameTile, isSimple, isYaochu, isTerminal, isHonor, isDragon } from './tiles.ts'
import { type StandardDecomp, type Decomp, type Mentsu } from './decompose.ts'
import { type WinConditions } from './fu.ts'

export interface Yaku {
  readonly name: string
  readonly han: number
  readonly isYakuman: boolean
}

export interface ExtraConditions {
  readonly isRiichi: boolean
  readonly isIppatsu: boolean
  readonly isDoubleRiichi: boolean
  readonly isHaiteiHoutei: boolean
  readonly isRinshan: boolean
  readonly isChankan: boolean
  readonly isTenhou: boolean
  readonly isChiihou: boolean
}

// --- helpers ---

function allMentsuOf(decomp: StandardDecomp, pred: (m: Mentsu) => boolean): boolean {
  return decomp.mentsu.every(pred)
}


function isKoutsuOrKantsu(m: Mentsu): boolean {
  return m.type === 'koutsu' || m.type === 'kantsu'
}

function sameTileSet(a: readonly Tile[], b: readonly Tile[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort((x, y) => x.num - y.num)
  const sb = [...b].sort((x, y) => x.num - y.num)
  return sa.every((t, i) => sameTile(t, sb[i]))
}

// --- standard yaku detectors ---

function yakuTsumo(d: StandardDecomp, cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  return (cond.winType === 'tsumo' && cond.isMenzen)
    ? { name: '門前清自摸和', han: 1, isYakuman: false } : null
}

function yakuRiichi(d: StandardDecomp, _cond: WinConditions, ex: ExtraConditions): Yaku | null {
  return ex.isDoubleRiichi ? { name: 'ダブルリーチ', han: 2, isYakuman: false }
    : ex.isRiichi ? { name: '立直', han: 1, isYakuman: false } : null
}

function yakuIppatsu(_d: StandardDecomp, _cond: WinConditions, ex: ExtraConditions): Yaku | null {
  return ex.isIppatsu ? { name: '一発', han: 1, isYakuman: false } : null
}

function yakuHaitei(_d: StandardDecomp, _cond: WinConditions, ex: ExtraConditions): Yaku | null {
  if (!ex.isHaiteiHoutei) return null
  return { name: '海底/河底', han: 1, isYakuman: false }
}

function yakuRinshan(_d: StandardDecomp, _cond: WinConditions, ex: ExtraConditions): Yaku | null {
  return ex.isRinshan ? { name: '嶺上開花', han: 1, isYakuman: false } : null
}

function yakuChankan(_d: StandardDecomp, _cond: WinConditions, ex: ExtraConditions): Yaku | null {
  return ex.isChankan ? { name: '槍槓', han: 1, isYakuman: false } : null
}

function yakuTanyao(d: StandardDecomp, _cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  const allSimple = [...d.mentsu.flatMap(m => m.tiles), ...d.jantai].every(isSimple)
  return allSimple ? { name: '断么九', han: 1, isYakuman: false } : null
}

function yakuPinfu(d: StandardDecomp, cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  if (!cond.isMenzen) return null
  if (d.wait !== 'ryanmen') return null
  if (!d.mentsu.every(m => m.type === 'shuntsu')) return null

  const j = d.jantai[0]
  if (!isHonor(j)) return { name: '平和', han: 1, isYakuman: false }
  if (isDragon(j)) return null
  if (j.num === cond.seatWind || j.num === cond.roundWind) return null
  return { name: '平和', han: 1, isYakuman: false }
}

function yakuIipeiko(d: StandardDecomp, cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  if (!cond.isMenzen) return null
  const shuntsu = d.mentsu.filter(m => m.type === 'shuntsu')
  for (let i = 0; i < shuntsu.length; i++) {
    for (let j = i + 1; j < shuntsu.length; j++) {
      if (sameTileSet(shuntsu[i].tiles, shuntsu[j].tiles)) {
        return { name: '一盃口', han: 1, isYakuman: false }
      }
    }
  }
  return null
}

function yakuRyanpeiko(d: StandardDecomp, cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  if (!cond.isMenzen) return null
  const shuntsu = d.mentsu.filter(m => m.type === 'shuntsu')
  if (shuntsu.length < 4) return null
  // check pairs (A,A,B,B pattern)
  const used = new Array(4).fill(false)
  let pairs = 0
  for (let i = 0; i < 4; i++) {
    if (used[i]) continue
    for (let j = i + 1; j < 4; j++) {
      if (!used[j] && sameTileSet(shuntsu[i].tiles, shuntsu[j].tiles)) {
        used[i] = true; used[j] = true; pairs++; break
      }
    }
  }
  return pairs === 2 ? { name: '二盃口', han: 3, isYakuman: false } : null
}

function yakuYakuhai(d: StandardDecomp, cond: WinConditions, _ex: ExtraConditions): Yaku[] {
  const result: Yaku[] = []
  for (const m of d.mentsu) {
    if (!isKoutsuOrKantsu(m)) continue
    const t = m.tiles[0]
    if (!isHonor(t)) continue
    if (isDragon(t)) {
      const names: Record<number, string> = { 5: '白', 6: '発', 7: '中' }
      result.push({ name: names[t.num], han: 1, isYakuman: false })
    } else {
      if (t.num === cond.seatWind) result.push({ name: '自風', han: 1, isYakuman: false })
      if (t.num === cond.roundWind) result.push({ name: '場風', han: 1, isYakuman: false })
    }
  }
  return result
}

function yakuToitoi(d: StandardDecomp, _cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  return allMentsuOf(d, isKoutsuOrKantsu) ? { name: '対々和', han: 2, isYakuman: false } : null
}

function yakuSanankou(d: StandardDecomp, cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  const closedAnkou = d.mentsu.filter(m => isKoutsuOrKantsu(m) && !m.open)
  // Last ankou can't be "concealed" if completed by ron (shanpon)
  const count = (cond.winType === 'ron' && d.wait === 'shanpon')
    ? closedAnkou.length - 1 : closedAnkou.length
  return count >= 3 ? { name: '三暗刻', han: 2, isYakuman: false } : null
}

function yakuSanshokuDoujun(d: StandardDecomp, cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  const shuntsu = d.mentsu.filter(m => m.type === 'shuntsu')
  for (const sm of shuntsu) {
    const n = sm.tiles[0].num
    const man = shuntsu.find(m => m.tiles[0].suit === 'man' && m.tiles[0].num === n)
    const pin = shuntsu.find(m => m.tiles[0].suit === 'pin' && m.tiles[0].num === n)
    const sou = shuntsu.find(m => m.tiles[0].suit === 'sou' && m.tiles[0].num === n)
    if (man && pin && sou) {
      const han = cond.isMenzen ? 2 : 1
      return { name: '三色同順', han, isYakuman: false }
    }
  }
  return null
}

function yakuIttsu(d: StandardDecomp, cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  const shuntsu = d.mentsu.filter(m => m.type === 'shuntsu')
  const suits = ['man', 'pin', 'sou'] as const
  for (const suit of suits) {
    const s = shuntsu.filter(m => m.tiles[0].suit === suit)
    const has123 = s.some(m => m.tiles[0].num === 1)
    const has456 = s.some(m => m.tiles[0].num === 4)
    const has789 = s.some(m => m.tiles[0].num === 7)
    if (has123 && has456 && has789) {
      const han = cond.isMenzen ? 2 : 1
      return { name: '一気通貫', han, isYakuman: false }
    }
  }
  return null
}

function yakuSanshokuDoukou(d: StandardDecomp, _cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  const koutsu = d.mentsu.filter(isKoutsuOrKantsu)
  for (const m of koutsu) {
    const n = m.tiles[0].num
    const man = koutsu.find(k => k.tiles[0].suit === 'man' && k.tiles[0].num === n)
    const pin = koutsu.find(k => k.tiles[0].suit === 'pin' && k.tiles[0].num === n)
    const sou = koutsu.find(k => k.tiles[0].suit === 'sou' && k.tiles[0].num === n)
    if (man && pin && sou) return { name: '三色同刻', han: 2, isYakuman: false }
  }
  return null
}

function yakuHonitsu(d: StandardDecomp, cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  const allTiles = [...d.mentsu.flatMap(m => m.tiles), ...d.jantai]
  const suits = new Set(allTiles.filter(t => !isHonor(t)).map(t => t.suit))
  if (suits.size !== 1) return null
  const hasHonor = allTiles.some(isHonor)
  if (!hasHonor) return null
  const han = cond.isMenzen ? 3 : 2
  return { name: '混一色', han, isYakuman: false }
}

function yakuChinitsu(d: StandardDecomp, cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  const allTiles = [...d.mentsu.flatMap(m => m.tiles), ...d.jantai]
  if (allTiles.some(isHonor)) return null
  const suits = new Set(allTiles.map(t => t.suit))
  if (suits.size !== 1) return null
  const han = cond.isMenzen ? 6 : 5
  return { name: '清一色', han, isYakuman: false }
}

function yakuTsuuiisou(d: StandardDecomp, _cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  const allTiles = [...d.mentsu.flatMap(m => m.tiles), ...d.jantai]
  return allTiles.every(isHonor) ? { name: '字一色', han: 13, isYakuman: true } : null
}

function yakuChinroutou(d: StandardDecomp, _cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  const allTiles = [...d.mentsu.flatMap(m => m.tiles), ...d.jantai]
  return allTiles.every(isTerminal) ? { name: '清老頭', han: 13, isYakuman: true } : null
}

function yakuDaisangen(d: StandardDecomp, _cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  const dragonAnkou = d.mentsu.filter(m => isKoutsuOrKantsu(m) && isDragon(m.tiles[0]))
  return dragonAnkou.length === 3 ? { name: '大三元', han: 13, isYakuman: true } : null
}

function yakuSuuankou(d: StandardDecomp, cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  const closedAnkou = d.mentsu.filter(m => isKoutsuOrKantsu(m) && !m.open)
  if (closedAnkou.length < 4) return null
  // Suuankou tanki is double yakuman in some rules; here just yakuman
  const isTanki = d.wait === 'tanki'
  if (cond.winType === 'ron' && !isTanki) return null
  return { name: '四暗刻', han: 13, isYakuman: true }
}

function yakuJunchan(d: StandardDecomp, cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  const allSets = [...d.mentsu, { type: 'jantai' as const, tiles: d.jantai, open: false }]
  const hasYaochu = allSets.every(m => m.tiles.some(isYaochu))
  const hasShuntsu = d.mentsu.some(m => m.type === 'shuntsu')
  if (!hasYaochu || !hasShuntsu) return null
  // Check if any honor (tsuuiisou/honitsu not junchan)
  const allTiles = [...d.mentsu.flatMap(m => m.tiles), ...d.jantai]
  if (allTiles.some(isHonor)) return null
  const han = cond.isMenzen ? 3 : 2
  return { name: '純チャン', han, isYakuman: false }
}

function yakuChanta(d: StandardDecomp, cond: WinConditions, _ex: ExtraConditions): Yaku | null {
  const allSets = [...d.mentsu, { type: 'jantai' as const, tiles: d.jantai, open: false }]
  if (!allSets.every(m => m.tiles.some(isYaochu))) return null
  if (!d.mentsu.some(m => m.type === 'shuntsu')) return null
  // If no honor tiles, it's junchan not chanta
  const allTiles = [...d.mentsu.flatMap(m => m.tiles), ...d.jantai]
  if (!allTiles.some(isHonor)) return null
  const han = cond.isMenzen ? 2 : 1
  return { name: '混全帯么九', han, isYakuman: false }
}

// --- public API ---

type StandardYakuFn = (d: StandardDecomp, cond: WinConditions, ex: ExtraConditions) => Yaku | null
type StandardYakuArrayFn = (d: StandardDecomp, cond: WinConditions, ex: ExtraConditions) => Yaku[]

const STANDARD_YAKU_FNS: StandardYakuFn[] = [
  yakuTsumo, yakuRiichi, yakuIppatsu, yakuHaitei, yakuRinshan, yakuChankan,
  yakuTanyao, yakuPinfu, yakuRyanpeiko, yakuIipeiko,
  yakuToitoi, yakuSanankou, yakuSanshokuDoujun, yakuIttsu,
  yakuSanshokuDoukou, yakuHonitsu, yakuChinitsu, yakuJunchan, yakuChanta,
  yakuTsuuiisou, yakuChinroutou, yakuDaisangen, yakuSuuankou,
]

const STANDARD_YAKU_ARRAY_FNS: StandardYakuArrayFn[] = [yakuYakuhai]

export function detectYakuStandard(
  d: StandardDecomp,
  cond: WinConditions,
  ex: ExtraConditions,
): Yaku[] {
  const yaku: Yaku[] = []
  for (const fn of STANDARD_YAKU_FNS) {
    const y = fn(d, cond, ex)
    if (y) yaku.push(y)
  }
  for (const fn of STANDARD_YAKU_ARRAY_FNS) {
    yaku.push(...fn(d, cond, ex))
  }

  // Remove lower-tier yaku superseded by yakuman
  const hasYakuman = yaku.some(y => y.isYakuman)
  if (hasYakuman) return yaku.filter(y => y.isYakuman)

  // Ryanpeiko supersedes iipeiko
  if (yaku.some(y => y.name === '二盃口')) {
    return yaku.filter(y => y.name !== '一盃口')
  }

  // Chinitsu supersedes honitsu
  if (yaku.some(y => y.name === '清一色')) {
    return yaku.filter(y => y.name !== '混一色')
  }

  // Suuankou supersedes sanankou, toitoi
  if (yaku.some(y => y.name === '四暗刻')) {
    return yaku.filter(y => y.name !== '三暗刻' && y.name !== '対々和')
  }

  // Junchan supersedes chanta
  if (yaku.some(y => y.name === '純チャン')) {
    return yaku.filter(y => y.name !== '混全帯么九')
  }

  // 三暗刻+対々 coexist, that's fine
  return yaku
}


export function detectYaku(
  decomp: Decomp,
  cond: WinConditions,
  ex: ExtraConditions,
): Yaku[] {
  if (decomp.kind === 'chiitoi') {
    const yaku: Yaku[] = [{ name: '七対子', han: 2, isYakuman: false }]
    if (ex.isRiichi) yaku.push(ex.isDoubleRiichi ? { name: 'ダブルリーチ', han: 2, isYakuman: false } : { name: '立直', han: 1, isYakuman: false })
    if (ex.isIppatsu) yaku.push({ name: '一発', han: 1, isYakuman: false })
    if (ex.isHaiteiHoutei) yaku.push({ name: '海底/河底', han: 1, isYakuman: false })
    return yaku
  }

  if (decomp.kind === 'kokushi') {
    const yaku: Yaku[] = []
    if (ex.isTenhou) return [{ name: '天和', han: 13, isYakuman: true }]
    if (ex.isChiihou) return [{ name: '地和', han: 13, isYakuman: true }]
    yaku.push({ name: '国士無双', han: 13, isYakuman: true })
    return yaku
  }

  // standard
  if (ex.isTenhou) return [{ name: '天和', han: 13, isYakuman: true }]
  if (ex.isChiihou) return [{ name: '地和', han: 13, isYakuman: true }]

  return detectYakuStandard(decomp, cond, ex)
}

export function totalHan(yaku: readonly Yaku[]): number {
  return yaku.reduce((s, y) => s + y.han, 0)
}

