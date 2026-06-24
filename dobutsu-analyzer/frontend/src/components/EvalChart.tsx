import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { scoreToMoves, MATE_BASE } from '../engine/score';

export interface EvalPoint {
  move: number;       // 手数 (0 = 初期局面)
  score: number;      // 符号 = 優勢側 (+先手 / −後手), 絶対値 = 勝勢の強さ (mate に近いほど大)
  notation: string;   // 棋譜表記
}

interface Props {
  history: EvalPoint[];
  highlightMove?: number; // 感想戦モードで現在参照中の手
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: EvalPoint = payload[0].payload;
  const side = d.score > 0 ? '先手' : d.score < 0 ? '後手' : '';
  const label = d.score === 0
    ? '引き分け'
    : `${side}勝ち ${scoreToMoves(d.score)}手`;   // exact mate distance recovered from score
  return (
    <div style={{ background: '#fff', border: '1px solid #ccc', padding: '6px 10px', fontSize: 12 }}>
      <div>{d.move === 0 ? '初期局面' : `${d.move}手目: ${d.notation}`}</div>
      <div><strong>{label}</strong></div>
    </div>
  );
}

export default function EvalChart({ history, highlightMove }: Props) {
  if (history.length === 0) return null;

  // 手ごとの再スケールを止め、Y軸を全局面で固定する
  const domain: [number, number] = [-(MATE_BASE - 1), MATE_BASE - 1];

  return (
    <div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
        評価推移　<span style={{ color: '#2a7' }}>+先手有利</span> /
        <span style={{ color: '#c33' }}>  −後手有利</span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={history} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="move" label={{ value: '手数', position: 'insideRight', offset: -4, fontSize: 11 }} tick={{ fontSize: 11 }} />
          <YAxis domain={domain} tick={{ fontSize: 11 }} tickFormatter={v => v > 0 ? `+${v}` : String(v)} />
          <ReferenceLine y={0} stroke="#888" strokeWidth={1.5} />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="linear"
            dataKey="score"
            stroke="#4a90e2"
            strokeWidth={2}
            dot={(props: any) => {
              const isHighlight = highlightMove !== undefined && props.payload?.move === highlightMove;
              return (
                <circle
                  key={props.index}
                  cx={props.cx} cy={props.cy}
                  r={isHighlight ? 6 : 3}
                  fill={isHighlight ? '#e05020' : '#4a90e2'}
                  stroke={isHighlight ? '#fff' : 'none'}
                  strokeWidth={isHighlight ? 2 : 0}
                />
              );
            }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
