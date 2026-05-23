import { useState, useCallback } from 'react'
import { QUIZ_QUESTIONS, generateChoices } from '../engine/quiz.ts'
import { parseHandString } from '../engine/tiles.ts'
import { HandDisplay } from './TileDisplay.tsx'

type Phase = 'question' | 'answered'

export function QuizMode() {
  const [qIdx, setQIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('question')
  const [selected, setSelected] = useState<number | null>(null)
  const [score, setScore] = useState({ correct: 0, total: 0 })

  const q = QUIZ_QUESTIONS[qIdx % QUIZ_QUESTIONS.length]
  const [currentChoices, setCurrentChoices] = useState<number[]>(() => generateChoices(q.answerRon))

  const nextQuestion = useCallback(() => {
    const nextIdx = (qIdx + 1) % QUIZ_QUESTIONS.length
    setQIdx(nextIdx)
    setPhase('question')
    setSelected(null)
    setCurrentChoices(generateChoices(QUIZ_QUESTIONS[nextIdx].answerRon))
  }, [qIdx])

  const answer = (choice: number) => {
    if (phase !== 'question') return
    setSelected(choice)
    setPhase('answered')
    setScore(s => ({
      correct: s.correct + (choice === q.answerRon ? 1 : 0),
      total: s.total + 1,
    }))
  }

  const parsedHand = parseHandString(q.hand + q.agari)
  const parsedAgari = parseHandString(q.agari)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Score tracker */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
          問題 {qIdx + 1} / {QUIZ_QUESTIONS.length}
        </span>
        <span style={{ color: '#34d399', fontWeight: 700 }}>
          正解率: {score.total > 0 ? Math.round(score.correct / score.total * 100) : 0}%
          &nbsp;({score.correct}/{score.total})
        </span>
      </div>

      {/* Question */}
      <div style={{ background: '#1f2937', borderRadius: '10px', padding: '20px' }}>
        <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '8px' }}>
          {q.hint}
        </div>
        {parsedHand && parsedAgari && (
          <HandDisplay tiles={parsedHand} agari={parsedAgari[0]} />
        )}
        <div style={{ marginTop: '12px', color: '#d1d5db', fontSize: '0.9rem' }}>
          非親 · ロン · 門前
          {q.extra.isRiichi && ' · リーチ'}
          {q.extra.isIppatsu && ' · 一発'}
          {q.cond.roundWind === 1 ? ' · 東場' : ' · 南場'}
        </div>
        <div style={{ marginTop: '8px', color: '#fbbf24', fontWeight: 600 }}>
          ロン点数は何点？
        </div>
      </div>

      {/* Choices */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {currentChoices.map(c => {
          const isCorrect = c === q.answerRon
          const isSelected = c === selected
          let bg = '#1f2937'
          let border = '1px solid #374151'
          let color = '#f3f4f6'

          if (phase === 'answered') {
            if (isCorrect) { bg = '#064e3b'; border = '2px solid #34d399'; color = '#34d399' }
            else if (isSelected && !isCorrect) { bg = '#450a0a'; border = '2px solid #ef4444'; color = '#ef4444' }
          } else if (isSelected) {
            bg = '#1e3a5f'; border = '2px solid #3b82f6'
          }

          return (
            <button
              key={c}
              onClick={() => answer(c)}
              disabled={phase === 'answered'}
              style={{
                padding: '14px', fontSize: '1.1rem', fontWeight: 700,
                borderRadius: '8px', border, background: bg, color,
                cursor: phase === 'question' ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}
            >
              {c.toLocaleString()}点
            </button>
          )
        })}
      </div>

      {/* Explanation */}
      {phase === 'answered' && (
        <div style={{ background: '#1e3a2f', border: '1px solid #34d399', borderRadius: '8px', padding: '16px' }}>
          <div style={{ color: selected === q.answerRon ? '#34d399' : '#ef4444', fontWeight: 700, marginBottom: '8px' }}>
            {selected === q.answerRon ? '正解！' : `不正解 — 正解: ${q.answerRon.toLocaleString()}点`}
          </div>
          <div style={{ color: '#d1d5db', fontSize: '0.9rem' }}>{q.explanation}</div>
          <button
            onClick={nextQuestion}
            style={{
              marginTop: '12px', padding: '8px 20px', background: '#3b82f6',
              color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.95rem',
            }}
          >
            次の問題 →
          </button>
        </div>
      )}
    </div>
  )
}
