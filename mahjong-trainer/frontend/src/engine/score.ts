export type LimitType =
  | 'mangan'
  | 'haneman'
  | 'baiman'
  | 'sanbaiman'
  | 'yakuman'

export interface ScoreBreakdown {
  readonly han: number
  readonly fu: number
  readonly limit?: LimitType
  readonly basic: number
  // Payment details
  readonly ronScore?: number
  readonly tsumoDealer?: number
  readonly tsumoNonDealer?: number
  readonly description: string
}

function roundUp100(n: number): number {
  return Math.ceil(n / 100) * 100
}

const MANGAN_BASIC = 2000

function limitFromHan(han: number): LimitType | undefined {
  if (han >= 13) return 'yakuman'
  if (han >= 11) return 'sanbaiman'
  if (han >= 8) return 'baiman'
  if (han >= 6) return 'haneman'
  if (han >= 5) return 'mangan'
  return undefined
}

const LIMIT_MULTIPLIER: Record<LimitType, number> = {
  mangan: 1,
  haneman: 1.5,
  baiman: 2,
  sanbaiman: 3,
  yakuman: 4,
}

export function calcScore(fu: number, han: number, isDealer: boolean): ScoreBreakdown {
  const basic = han >= 13 ? MANGAN_BASIC * 4
    : han >= 11 ? MANGAN_BASIC * 3
    : han >= 8 ? MANGAN_BASIC * 2
    : han >= 6 ? Math.round(MANGAN_BASIC * 1.5)
    : han >= 5 ? MANGAN_BASIC
    : fu * Math.pow(2, han + 2)

  const rawLimit = limitFromHan(han)

  // For non-mangan: check 4han30fu etc (calculate actual payments and cap)
  let limit = rawLimit

  if (!limit) {
    // Check if payment would exceed mangan
    const nonDealerRon = roundUp100(basic * 4)
    const dealerRon = roundUp100(basic * 6)
    if (isDealer && dealerRon > 12000) limit = 'mangan'
    else if (!isDealer && nonDealerRon > 8000) limit = 'mangan'
  }

  const finalBasic = limit
    ? Math.round(MANGAN_BASIC * (LIMIT_MULTIPLIER[limit] ?? 1))
    : basic

  if (isDealer) {
    const ronScore = limit ? roundUp100(finalBasic * 6) : roundUp100(basic * 6)
    const tsumoPer = limit ? roundUp100(finalBasic * 2) : roundUp100(basic * 2)
    const limitLabels: Record<LimitType, string> = {
      mangan: '満貫', haneman: '跳満', baiman: '倍満', sanbaiman: '三倍満', yakuman: '役満',
    }
    const desc = limit ? `${limitLabels[limit]}` : `${han}飜${fu}符`
    return {
      han, fu, limit, basic: finalBasic,
      ronScore,
      tsumoDealer: tsumoPer,
      description: `${desc} — ロン${ronScore.toLocaleString()}点 / ツモ${tsumoPer.toLocaleString()}点オール`,
    }
  } else {
    const ronScore = limit ? roundUp100(finalBasic * 4) : roundUp100(basic * 4)
    const tsumoDealerPay = limit ? roundUp100(finalBasic * 2) : roundUp100(basic * 2)
    const tsumoNonDealerPay = limit ? roundUp100(finalBasic) : roundUp100(basic)
    const limitLabels: Record<LimitType, string> = {
      mangan: '満貫', haneman: '跳満', baiman: '倍満', sanbaiman: '三倍満', yakuman: '役満',
    }
    const desc = limit ? `${limitLabels[limit]}` : `${han}飜${fu}符`
    return {
      han, fu, limit, basic: finalBasic,
      ronScore,
      tsumoDealer: tsumoDealerPay,
      tsumoNonDealer: tsumoNonDealerPay,
      description: `${desc} — ロン${ronScore.toLocaleString()}点 / ツモ${tsumoDealerPay.toLocaleString()}/${tsumoNonDealerPay.toLocaleString()}点`,
    }
  }
}

// Pre-computed score table for reference (non-dealer ron values)
// [fu][han] = score
export function scoreTableValue(fu: number, han: number): number | null {
  if (han <= 0 || fu < 20) return null
  // Pinfu tsumo special case handled outside
  const basic = fu * Math.pow(2, han + 2)
  const ron = Math.ceil(basic * 4 / 100) * 100
  const manganRon = 8000
  return Math.min(ron, manganRon)
}
