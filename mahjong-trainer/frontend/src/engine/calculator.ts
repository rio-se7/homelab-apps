import { type Tile, parseHandString } from './tiles.ts'
import { decomposeHand, type Decomp } from './decompose.ts'
import { calcFu, type WinConditions, type FuResult } from './fu.ts'
import { detectYaku, totalHan, type Yaku, type ExtraConditions } from './yaku.ts'
import { calcScore, type ScoreBreakdown } from './score.ts'

export type { WinConditions, ExtraConditions }

export interface CalculationResult {
  readonly decomp: Decomp
  readonly fuResult: FuResult
  readonly yaku: readonly Yaku[]
  readonly han: number
  readonly score: ScoreBreakdown
}

export interface CalculationInput {
  readonly handString: string  // e.g. "123m456p789s1177z"
  readonly agariString: string // e.g. "7z"
  readonly cond: WinConditions
  readonly extra: ExtraConditions
}

export interface CalculationError {
  readonly kind: 'error'
  readonly message: string
}

function scoreDecomp(decomp: Decomp, agari: Tile, cond: WinConditions, extra: ExtraConditions): CalculationResult | null {
  const yaku = detectYaku(decomp, cond, extra)
  if (yaku.length === 0) return null

  let fuResult: FuResult
  if (decomp.kind === 'chiitoi') {
    fuResult = { total: 25, breakdown: [{ label: '七対子固定', fu: 25 }] }
  } else if (decomp.kind === 'kokushi') {
    fuResult = { total: 30, breakdown: [{ label: '国士無双', fu: 30 }] }
  } else {
    fuResult = calcFu(decomp, cond)
  }

  const han = totalHan(yaku)
  const isYakumanHand = yaku.some(y => y.isYakuman)
  const effectiveFu = isYakumanHand ? 30 : fuResult.total
  const score = calcScore(effectiveFu, han, cond.isDealer ?? false)

  return { decomp, fuResult, yaku, han, score }
}

export function calculate(input: CalculationInput): CalculationResult | CalculationError {
  const hand13 = parseHandString(input.handString)
  if (!hand13) return { kind: 'error', message: '手牌の形式が正しくありません (例: 123m456p789s11z)' }

  const agariTiles = parseHandString(input.agariString)
  if (!agariTiles || agariTiles.length !== 1) {
    return { kind: 'error', message: 'アガリ牌は1枚指定してください' }
  }

  const agari = agariTiles[0]
  const hand14 = [...hand13, agari]

  if (hand14.length !== 14) {
    return { kind: 'error', message: `手牌は13枚+アガリ1枚=14枚必要です (現在${hand14.length}枚)` }
  }

  const decomps = decomposeHand(hand14, agari)
  if (decomps.length === 0) {
    return { kind: 'error', message: '有効な面子構成が見つかりません (和了形でない可能性)' }
  }

  const results: CalculationResult[] = []
  for (const d of decomps) {
    const r = scoreDecomp(d, agari, input.cond, input.extra)
    if (r) results.push(r)
  }

  if (results.length === 0) {
    return { kind: 'error', message: '役なし (無役)' }
  }

  // Return highest scoring result
  results.sort((a, b) => (b.score.ronScore ?? 0) - (a.score.ronScore ?? 0))
  return results[0]
}

export function isError(r: CalculationResult | CalculationError): r is CalculationError {
  return 'kind' in r && r.kind === 'error'
}
