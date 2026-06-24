import type { MoveEval } from '../api/client';

export interface CriticalInfo {
  isOnlyMove: boolean;   // true when exactly one move preserves the best WDL result
  label: string;         // '必勝手' | '唯一の引き分け' | '唯一の最善粘り' | '' (empty when not an only-move)
}

// Analyze a best-first sorted legal move list for a single position.
export function analyzeCritical(moves: MoveEval[]): CriticalInfo {
  if (moves.length === 0) {
    return { isOnlyMove: false, label: '' };
  }

  const best = moves[0].result;
  const count = moves.filter(m => m.result === best).length;
  const isOnlyMove = count === 1;

  if (!isOnlyMove) {
    return { isOnlyMove: false, label: '' };
  }

  let label = '';
  if (best === 'win') {
    label = '必勝手';
  } else if (best === 'draw') {
    label = '唯一の引き分け';
  } else if (best === 'lose') {
    label = '唯一の最善粘り';
  }

  return { isOnlyMove, label };
}
