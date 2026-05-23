import { type WinConditions, type ExtraConditions } from './calculator.ts'

export interface QuizQuestion {
  readonly id: number
  readonly hand: string        // 13-tile hand
  readonly agari: string       // agari tile
  readonly cond: WinConditions
  readonly extra: ExtraConditions
  readonly answerRon: number   // correct non-dealer ron score (0 if N/A)
  readonly hint: string        // hand description for display
  readonly explanation: string // score breakdown explanation
}

const BASE_COND: WinConditions = {
  winType: 'ron',
  isMenzen: true,
  isDealer: false,
  seatWind: 1,
  roundWind: 1,
}

const BASE_EXTRA: ExtraConditions = {
  isRiichi: false, isIppatsu: false, isDoubleRiichi: false,
  isHaiteiHoutei: false, isRinshan: false, isChankan: false,
  isTenhou: false, isChiihou: false,
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    hand: '123m456p789s115z',
    agari: '5z',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: { ...BASE_EXTRA, isRiichi: true },
    answerRon: 8000,
    hint: 'リーチ + 清一色に近い手',
    explanation: 'リーチ(1)+清一色(6)=7飜 → 跳満 12000点 (自摸) / ロン12000点',
  },
  {
    id: 2,
    hand: '234m234p234s2266z',
    agari: '6z',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: BASE_EXTRA,
    answerRon: 2000,
    hint: '役牌(発)のみ 30符',
    explanation: '発(1飜) / 30符 — ロン 2000点',
  },
  {
    id: 3,
    hand: '234m234p234s2255z',
    agari: '5z',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: { ...BASE_EXTRA, isRiichi: true },
    answerRon: 5200,
    hint: 'リーチ + 役牌(白) 40符',
    explanation: 'リーチ(1)+白(1)=2飜 40符 — 基本点640, ロン 2560→2600点',
  },
  {
    id: 4,
    hand: '234m456m789m2367z',
    agari: '7z',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true, roundWind: 1, seatWind: 1 },
    extra: BASE_EXTRA,
    answerRon: 7700,
    hint: '中(役牌) + 東(場風・自風ダブ東) 40符',
    explanation: '中(1)+東場(1)+東自風(1)=3飜 40符 — 基本点1280, ロン 5120→5200点',
  },
  {
    id: 5,
    hand: '123m456m789m2344p',
    agari: '4p',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: BASE_EXTRA,
    answerRon: 2000,
    hint: '平和のみ (門前ロン)',
    explanation: '平和(1飜) 30符 — 基本点480, ロン 1920→2000点',
  },
  {
    id: 6,
    hand: '123m456m789m2345p',
    agari: '5p',
    cond: { ...BASE_COND, winType: 'tsumo', isMenzen: true },
    extra: BASE_EXTRA,
    answerRon: 0,
    hint: '平和 + ツモ (20符固定)',
    explanation: '平和(1)+ツモ(1)=2飜 20符(固定) — ツモ: 親400/子200',
  },
  {
    id: 7,
    hand: '22334455667788p',
    agari: '8p',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: { ...BASE_EXTRA, isRiichi: true },
    answerRon: 8000,
    hint: '七対子 + リーチ',
    explanation: '七対子(2)+リーチ(1)=3飜 25符 — 基本点800, ロン 3200点',
  },
  {
    id: 8,
    hand: '111m222m333m456m7m',
    agari: '7m',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: { ...BASE_EXTRA, isRiichi: true },
    answerRon: 8000,
    hint: 'リーチ + 清一色',
    explanation: 'リーチ(1)+清一色(6)=7飜 → 跳満 12000点',
  },
  {
    id: 9,
    hand: '234m234m234m111p9p',
    agari: '9p',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: { ...BASE_EXTRA, isRiichi: true },
    answerRon: 3900,
    hint: 'リーチのみ 30符',
    explanation: 'リーチ(1飜) 30符 — 基本点480, ロン 1920→2000点',
  },
  {
    id: 10,
    hand: '234s456s789s1199m',
    agari: '9m',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: { ...BASE_EXTRA, isRiichi: true },
    answerRon: 3900,
    hint: 'リーチ + 一盃口',
    explanation: 'リーチ(1)+一盃口(1)=2飜 40符 — 基本点640, ロン 2560→2600点',
  },
  {
    id: 11,
    hand: '345m345m345m3456p',
    agari: '6p',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: { ...BASE_EXTRA, isRiichi: true },
    answerRon: 3900,
    hint: 'リーチ + 断么九',
    explanation: 'リーチ(1)+断么九(1)=2飜 30符 — 基本点480, ロン 1920→2000点',
  },
  {
    id: 12,
    hand: '123m456m789m123p55p',
    agari: '5p',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: { ...BASE_EXTRA, isRiichi: true },
    answerRon: 3900,
    hint: 'リーチ + 一気通貫',
    explanation: 'リーチ(1)+一気通貫(2)=3飜 30符 — 基本点960, ロン 3840→3900点',
  },
  {
    id: 13,
    hand: '111m222p333s111z22z',
    agari: '2z',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true, roundWind: 2, seatWind: 1 },
    extra: BASE_EXTRA,
    answerRon: 8000,
    hint: '対々和 + 三暗刻',
    explanation: '対々和(2)+三暗刻(2)=4飜 40符 — 基本点2560, ロン 10240→満貫8000点',
  },
  {
    id: 14,
    hand: '111222333m456p11p',
    agari: '1p',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: { ...BASE_EXTRA, isRiichi: true },
    answerRon: 8000,
    hint: 'リーチ + 三色同順',
    explanation: 'リーチ(1)+三色同順(2)=3飜 40符 — 基本点1280, ロン 5120→5200点',
  },
  {
    id: 15,
    hand: '111m111p111s11111z',
    agari: '1z',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: BASE_EXTRA,
    answerRon: 32000,
    hint: '字一色 (役満)',
    explanation: '字一色 (役満) — ロン32000点',
  },
  {
    id: 16,
    hand: '123456789m1234p',
    agari: '4p',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: { ...BASE_EXTRA, isRiichi: true },
    answerRon: 8000,
    hint: 'リーチ + 清一色',
    explanation: 'リーチ(1)+清一色(6)=7飜 → 跳満 12000点',
  },
  {
    id: 17,
    hand: '111999m111999p11s',
    agari: '1s',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: BASE_EXTRA,
    answerRon: 32000,
    hint: '清老頭 (役満)',
    explanation: '清老頭 (役満) — ロン32000点',
  },
  {
    id: 18,
    hand: '234m456p789s2344m',
    agari: '4m',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: { ...BASE_EXTRA, isRiichi: true },
    answerRon: 5200,
    hint: 'リーチ + 三色同順 + 断么九',
    explanation: 'リーチ(1)+三色同順(2)+断么九(1)=4飜 30符 — 基本点1920, ロン 7680→7700点',
  },
  {
    id: 19,
    hand: '567m567p567s5566z',
    agari: '6z',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true },
    extra: BASE_EXTRA,
    answerRon: 8000,
    hint: '三色同順 + 発(役牌)',
    explanation: '三色同順(2)+発(1)=3飜 30符 — 基本点960, ロン 3840→3900点',
  },
  {
    id: 20,
    hand: '123m456m789m123s55s',
    agari: '5s',
    cond: { ...BASE_COND, winType: 'ron', isMenzen: true, isDealer: true },
    extra: { ...BASE_EXTRA, isRiichi: true },
    answerRon: 12000,
    hint: '親 + リーチ + 一気通貫 (3飜30符)',
    explanation: 'リーチ(1)+一気通貫(2)=3飜 30符 — 親ロン 960×6=5760→5800点',
  },
]

export function getRandomQuestion(): QuizQuestion {
  return QUIZ_QUESTIONS[Math.floor(Math.random() * QUIZ_QUESTIONS.length)]
}

export function generateChoices(correct: number): number[] {
  const choices = new Set<number>([correct])
  const candidates = [500, 1000, 1300, 1600, 2000, 2300, 2600, 3200, 3900, 5200, 5800, 7700, 8000, 12000, 16000, 24000, 32000]
  while (choices.size < 4) {
    const c = candidates[Math.floor(Math.random() * candidates.length)]
    choices.add(c)
  }
  return [...choices].sort((a, b) => a - b)
}
