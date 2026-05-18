export type WdlResult = 'win' | 'lose' | 'draw';

export interface EvalResponse {
  result: WdlResult;
  dtm: number;
}

export interface MoveEval {
  mv: string;
  result: WdlResult;
  dtm: number;
}

export interface MovesResponse {
  moves: MoveEval[];
}

export async function fetchEval(pos: string): Promise<EvalResponse> {
  const res = await fetch(`/api/eval?pos=${pos}`);
  if (!res.ok) throw new Error(`eval failed: ${res.status}`);
  return res.json();
}

export async function fetchMoves(pos: string): Promise<MovesResponse> {
  const res = await fetch(`/api/moves?pos=${pos}`);
  if (!res.ok) throw new Error(`moves failed: ${res.status}`);
  return res.json();
}
