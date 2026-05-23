import { useState } from 'react'
import { type Tile, parseHandString, tileEmoji, tileName } from '../engine/tiles.ts'
import { type WinConditions, type ExtraConditions } from '../engine/calculator.ts'

interface Props {
  onCalculate: (hand: string, agari: string, cond: WinConditions, extra: ExtraConditions) => void
}

const DEFAULT_COND: WinConditions = {
  winType: 'ron',
  isMenzen: true,
  isDealer: false,
  seatWind: 1,
  roundWind: 1,
}

const DEFAULT_EXTRA: ExtraConditions = {
  isRiichi: false, isIppatsu: false, isDoubleRiichi: false,
  isHaiteiHoutei: false, isRinshan: false, isChankan: false,
  isTenhou: false, isChiihou: false,
}

const WIND_NAMES = ['東', '南', '西', '北']

export function HandInput({ onCalculate }: Props) {
  const [hand, setHand] = useState('123m456p789s')
  const [agari, setAgari] = useState('1z')
  const [cond, setCond] = useState<WinConditions>(DEFAULT_COND)
  const [extra, setExtra] = useState<ExtraConditions>(DEFAULT_EXTRA)

  const parsedHand = parseHandString(hand)
  const parsedAgari = parseHandString(agari)
  const isValid = parsedHand && parsedAgari && parsedAgari.length === 1 && parsedHand.length === 13

  function renderPreview(tiles: Tile[] | null) {
    if (!tiles) return <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>形式エラー</span>
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1px', marginTop: '4px' }}>
        {tiles.map((t, i) => (
          <span key={i} title={tileName(t)} style={{ fontSize: '1.6rem', lineHeight: 1 }}>
            {tileEmoji(t)}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Hand input */}
      <div>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}>
          手牌 (13枚) — 例: <code>123m456p789s11z</code>
        </label>
        <input
          value={hand}
          onChange={e => setHand(e.target.value)}
          style={{ width: '100%', padding: '8px', fontSize: '1rem', borderRadius: '6px', border: '1px solid #374151', background: '#1f2937', color: '#f3f4f6', boxSizing: 'border-box' }}
          placeholder="例: 123m456p789s11z"
        />
        {renderPreview(parsedHand)}
      </div>

      {/* Agari tile */}
      <div>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}>
          アガリ牌 (1枚)
        </label>
        <input
          value={agari}
          onChange={e => setAgari(e.target.value)}
          style={{ width: '120px', padding: '8px', fontSize: '1rem', borderRadius: '6px', border: '1px solid #374151', background: '#1f2937', color: '#f3f4f6' }}
          placeholder="例: 1z"
        />
        {renderPreview(parsedAgari)}
      </div>

      {/* Conditions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', padding: '12px', background: '#1f2937', borderRadius: '8px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={cond.isMenzen}
            onChange={e => setCond(c => ({ ...c, isMenzen: e.target.checked }))} />
          門前
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={cond.isDealer ?? false}
            onChange={e => setCond(c => ({ ...c, isDealer: e.target.checked }))} />
          親
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>アガリ:</span>
          <select
            value={cond.winType}
            onChange={e => setCond(c => ({ ...c, winType: e.target.value as 'ron' | 'tsumo' }))}
            style={{ padding: '4px', borderRadius: '4px', background: '#374151', color: '#f3f4f6', border: '1px solid #4b5563' }}
          >
            <option value="ron">ロン</option>
            <option value="tsumo">ツモ</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>場風:</span>
          <select
            value={cond.roundWind}
            onChange={e => setCond(c => ({ ...c, roundWind: parseInt(e.target.value) as 1|2|3|4 }))}
            style={{ padding: '4px', borderRadius: '4px', background: '#374151', color: '#f3f4f6', border: '1px solid #4b5563' }}
          >
            {WIND_NAMES.map((w, i) => <option key={i} value={i + 1}>{w}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>自風:</span>
          <select
            value={cond.seatWind}
            onChange={e => setCond(c => ({ ...c, seatWind: parseInt(e.target.value) as 1|2|3|4 }))}
            style={{ padding: '4px', borderRadius: '4px', background: '#374151', color: '#f3f4f6', border: '1px solid #4b5563' }}
          >
            {WIND_NAMES.map((w, i) => <option key={i} value={i + 1}>{w}</option>)}
          </select>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={extra.isRiichi}
            onChange={e => setExtra(x => ({ ...x, isRiichi: e.target.checked, isDoubleRiichi: false }))} />
          リーチ
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={extra.isIppatsu} disabled={!extra.isRiichi}
            onChange={e => setExtra(x => ({ ...x, isIppatsu: e.target.checked }))} />
          一発
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={extra.isDoubleRiichi} disabled={!extra.isRiichi}
            onChange={e => setExtra(x => ({ ...x, isDoubleRiichi: e.target.checked }))} />
          ダブルリーチ
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={extra.isHaiteiHoutei}
            onChange={e => setExtra(x => ({ ...x, isHaiteiHoutei: e.target.checked }))} />
          海底/河底
        </label>
      </div>

      <button
        onClick={() => { if (isValid) onCalculate(hand, agari, cond, extra) }}
        disabled={!isValid}
        style={{
          padding: '10px 24px', fontSize: '1rem', fontWeight: 700,
          borderRadius: '8px', border: 'none', cursor: isValid ? 'pointer' : 'not-allowed',
          background: isValid ? '#3b82f6' : '#374151', color: '#fff',
          transition: 'background 0.2s',
        }}
      >
        計算する
      </button>
    </div>
  )
}
