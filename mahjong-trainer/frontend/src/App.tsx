import { useState } from 'react'
import { HandInput } from './components/HandInput.tsx'
import { ScoreBreakdown } from './components/ScoreBreakdown.tsx'
import { QuizMode } from './components/QuizMode.tsx'
import { ScoreTable } from './components/ScoreTable.tsx'
import { calculate, isError, type CalculationResult, type WinConditions, type ExtraConditions } from './engine/calculator.ts'

type Tab = 'calc' | 'quiz' | 'table'

export default function App() {
  const [tab, setTab] = useState<Tab>('calc')
  const [result, setResult] = useState<CalculationResult | string | null>(null)

  function handleCalculate(hand: string, agari: string, cond: WinConditions, extra: ExtraConditions) {
    const r = calculate({ handString: hand, agariString: agari, cond, extra })
    if (isError(r)) {
      setResult(r.message)
    } else {
      setResult(r)
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px',
    border: 'none',
    borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
    background: 'transparent',
    color: active ? '#60a5fa' : '#9ca3af',
    fontWeight: active ? 700 : 400,
    fontSize: '0.95rem',
    cursor: 'pointer',
    transition: 'color 0.15s',
  })

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '16px' }}>
      <header style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem' }}>🀄 麻雀点数計算トレーナー</h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
          符・飜・点数の計算を学ぼう
        </p>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #374151', marginBottom: '24px' }}>
        <button style={tabStyle(tab === 'calc')} onClick={() => setTab('calc')}>計算ツール</button>
        <button style={tabStyle(tab === 'quiz')} onClick={() => setTab('quiz')}>クイズ</button>
        <button style={tabStyle(tab === 'table')} onClick={() => setTab('table')}>点数表</button>
      </div>

      {/* Content */}
      {tab === 'calc' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <HandInput onCalculate={handleCalculate} />

          {result !== null && typeof result === 'string' && (
            <div style={{ background: '#450a0a', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px', color: '#ef4444' }}>
              {result}
            </div>
          )}

          {result !== null && typeof result === 'object' && (
            <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '20px' }}>
              <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#9ca3af' }}>計算結果</h2>
              <ScoreBreakdown result={result} />
            </div>
          )}
        </div>
      )}

      {tab === 'quiz' && <QuizMode />}

      {tab === 'table' && (
        <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '20px' }}>
          <ScoreTable />
        </div>
      )}
    </div>
  )
}
