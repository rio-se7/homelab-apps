const FU_VALUES = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110]
const HAN_VALUES = [1, 2, 3, 4, 5, 6, 7, 8]

function calcRon(fu: number, han: number): string {
  if (fu === 20 && han === 1) return '—'
  if (fu === 25 && han === 1) return '—'
  if (han >= 13) return '役満'
  if (han >= 11) return '三倍満'
  if (han >= 8) return '倍満'
  if (han >= 6) return '跳満'
  if (han >= 5) return '満貫'

  const basic = fu * Math.pow(2, han + 2)
  const ron = Math.ceil(basic * 4 / 100) * 100
  if (ron >= 8000) return '満貫'
  return ron.toLocaleString()
}

function isLimit(fu: number, han: number): boolean {
  if (han >= 5) return true
  if (han < 1) return false
  const basic = fu * Math.pow(2, han + 2)
  return Math.ceil(basic * 4 / 100) * 100 >= 8000
}

const LIMIT_COLORS: Record<string, string> = {
  '満貫': '#d97706',
  '跳満': '#9333ea',
  '倍満': '#2563eb',
  '三倍満': '#0f766e',
  '役満': '#dc2626',
}

export function ScoreTable() {
  return (
    <div>
      <h3 style={{ margin: '0 0 12px', color: '#9ca3af' }}>点数表 (非親・ロン)</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 10px', background: '#374151', color: '#9ca3af', textAlign: 'center', whiteSpace: 'nowrap' }}>
                符 ＼ 飜
              </th>
              {HAN_VALUES.map(h => (
                <th key={h} style={{ padding: '6px 10px', background: '#374151', color: '#f3f4f6', textAlign: 'center' }}>
                  {h}飜
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FU_VALUES.map(fu => (
              <tr key={fu}>
                <td style={{ padding: '6px 10px', background: '#374151', color: '#fbbf24', fontWeight: 700, textAlign: 'center' }}>
                  {fu}符
                </td>
                {HAN_VALUES.map(h => {
                  const val = calcRon(fu, h)
                  const isLim = isLimit(fu, h) || h >= 5
                  const color = LIMIT_COLORS[val] ?? '#f3f4f6'
                  return (
                    <td key={h} style={{
                      padding: '6px 10px', textAlign: 'right',
                      background: isLim ? '#1a1a2e' : '#111827',
                      color,
                      fontWeight: isLim ? 700 : 400,
                      borderBottom: '1px solid #1f2937',
                      whiteSpace: 'nowrap',
                    }}>
                      {val}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.85rem' }}>
        {Object.entries(LIMIT_COLORS).map(([name, color]) => (
          <span key={name} style={{ color }}>{name}</span>
        ))}
        <span style={{ color: '#6b7280', marginLeft: '8px' }}>
          ※ 非親ロン。「—」は役なしのため不成立
        </span>
      </div>
    </div>
  )
}
