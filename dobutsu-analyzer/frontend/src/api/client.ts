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

export class ApiError extends Error {
  // Parameter properties are not allowed under erasableSyntaxOnly.
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Never stringify an unknown value directly — an object would render as
// "[object Object]".
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'unknown error';
}

// Reason to show the user for a failed lookup. 404 is the common case: the
// position is not part of the perfect-play table — a broken piece inventory
// built in setup mode, or a finished game.
export function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404) {
      return 'この局面は完全解析テーブルにありません(駒の枚数が不正か、対局が終了した局面です)';
    }
    if (e.status === 503) {
      return '解析テーブルが読み込まれていません(backend のデータ配置を確認してください)';
    }
    return `評価の取得に失敗しました (${e.status})`;
  }
  return `評価の取得に失敗しました (${describeError(e)})`;
}

export async function fetchEval(pos: string): Promise<EvalResponse> {
  const res = await fetch(`/api/eval?pos=${pos}`);
  if (!res.ok) throw new ApiError(res.status, `eval failed: ${res.status}`);
  return res.json();
}

export async function fetchMoves(pos: string): Promise<MovesResponse> {
  const res = await fetch(`/api/moves?pos=${pos}`);
  if (!res.ok) throw new ApiError(res.status, `moves failed: ${res.status}`);
  return res.json();
}
