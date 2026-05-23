import { type CalculationResult } from '../engine/calculator.ts'
import { type StandardDecomp } from '../engine/decompose.ts'
import { tileEmoji } from '../engine/tiles.ts'

interface Props {
  result: CalculationResult
}

const WAIT_LABELS: Record<string, string> = {
  ryanmen: '両面', penchan: '辺張', kanchan: '嵌張', shanpon: '双碰', tanki: '単騎',
}

const LIMIT_LABELS: Record<string, string> = {
  mangan: '満貫', haneman: '跳満', baiman: '倍満', sanbaiman: '三倍満', yakuman: '役満',
}

function MentsuDisplay({ decomp }: { decomp: StandardDecomp }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px' }}>
      {/* Jantai */}
      <div style={{ background: '#1f2937', borderRadius: '6px', padding: '6px 10px', textAlign: 'center' }}>
        <div style={{ fontSize: '1.4rem' }}>
          {decomp.jantai.map((t, i) => <span key={i}>{tileEmoji(t)}</span>)}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>雀頭</div>
      </div>
      {/* Mentsu */}
      {decomp.mentsu.map((m, i) => (
        <div key={i} style={{ background: '#1f2937', borderRadius: '6px', padding: '6px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem' }}>
            {m.tiles.map((t, j) => <span key={j}>{tileEmoji(t)}</span>)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>
            {m.type === 'shuntsu' ? '順子' : m.type === 'koutsu' ? '刻子' : '槓子'}
            {m.open ? '(鳴き)' : ''}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '6px', color: '#6b7280', fontSize: '0.85rem' }}>
        待ち: {WAIT_LABELS[decomp.wait] ?? decomp.wait}
      </div>
    </div>
  )
}

export function ScoreBreakdown({ result }: Props) {
  const { decomp, fuResult, yaku, han, score } = result

  const limitLabel = score.limit ? LIMIT_LABELS[score.limit] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Hand structure */}
      {decomp.kind === 'standard' && (
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: '#9ca3af' }}>面子構成</h3>
          <MentsuDisplay decomp={decomp} />
        </div>
      )}
      {decomp.kind === 'chiitoi' && (
        <div style={{ color: '#a78bfa' }}>七対子</div>
      )}
      {decomp.kind === 'kokushi' && (
        <div style={{ color: '#a78bfa' }}>国士無双</div>
      )}

      {/* Yaku */}
      <div>
        <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: '#9ca3af' }}>役</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {yaku.map((y, i) => (
            <span key={i} style={{
              padding: '4px 10px', borderRadius: '20px', fontSize: '0.9rem',
              background: y.isYakuman ? '#7c3aed' : '#1e3a5f',
              color: y.isYakuman ? '#fff' : '#93c5fd',
              border: `1px solid ${y.isYakuman ? '#a78bfa' : '#3b82f6'}`,
            }}>
              {y.name}
              <span style={{ marginLeft: '4px', opacity: 0.8 }}>
                {y.isYakuman ? '役満' : `${y.han}飜`}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Fu breakdown */}
      {decomp.kind === 'standard' && (
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: '#9ca3af' }}>符計算</h3>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <tbody>
              {fuResult.breakdown.map((item, i) => (
                <tr key={i}>
                  <td style={{ padding: '2px 12px 2px 0', color: '#d1d5db' }}>{item.label}</td>
                  <td style={{ padding: '2px 0', color: '#fbbf24', textAlign: 'right' }}>{item.fu}符</td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid #374151' }}>
                <td style={{ padding: '4px 12px 2px 0', fontWeight: 700 }}>合計 (切り上げ)</td>
                <td style={{ padding: '4px 0', color: '#fbbf24', fontWeight: 700, textAlign: 'right' }}>{fuResult.total}符</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Score */}
      <div style={{
        background: '#1e3a2f', border: '1px solid #34d399', borderRadius: '10px',
        padding: '16px', marginTop: '4px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399' }}>
            {limitLabel ?? `${han}飜${fuResult.total}符`}
          </span>
          {limitLabel && (
            <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>
              ({han}飜{fuResult.total}符)
            </span>
          )}
        </div>
        <div style={{ marginTop: '8px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {score.ronScore !== undefined && (
            <div>
              <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>ロン</span>
              <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: '1.2rem', marginLeft: '8px' }}>
                {score.ronScore.toLocaleString()}点
              </span>
            </div>
          )}
          {score.tsumoDealer !== undefined && score.tsumoNonDealer !== undefined && (
            <div>
              <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>ツモ</span>
              <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: '1.2rem', marginLeft: '8px' }}>
                {score.tsumoDealer.toLocaleString()}/<wbr />{score.tsumoNonDealer.toLocaleString()}点
              </span>
            </div>
          )}
          {score.tsumoDealer !== undefined && score.tsumoNonDealer === undefined && (
            <div>
              <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>ツモ</span>
              <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: '1.2rem', marginLeft: '8px' }}>
                {score.tsumoDealer.toLocaleString()}点オール
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
