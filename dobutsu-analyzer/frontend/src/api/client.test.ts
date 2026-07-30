import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchEval, fetchMoves, ApiError, apiErrorMessage } from './client';

function mockFetch(status: number, body: unknown = {}) {
  const impl = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', impl);
  return impl;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchEval / fetchMoves', () => {
  it('returns the parsed body on success', async () => {
    mockFetch(200, { result: 'win', dtm: 3 });
    await expect(fetchEval('0000200d51fb300e')).resolves.toEqual({ result: 'win', dtm: 3 });
  });

  it('returns the move list on success', async () => {
    const moves = [{ mv: 'B3B2', result: 'win', dtm: 5 }];
    mockFetch(200, { moves });
    await expect(fetchMoves('0000200d51fb300e')).resolves.toEqual({ moves });
  });

  it('throws ApiError carrying the status', async () => {
    mockFetch(404);
    await expect(fetchEval('deadbeef')).rejects.toBeInstanceOf(ApiError);

    mockFetch(404);
    await expect(fetchMoves('deadbeef')).rejects.toMatchObject({ status: 404 });

    mockFetch(503);
    await expect(fetchMoves('deadbeef')).rejects.toMatchObject({ status: 503 });
  });
});

describe('apiErrorMessage', () => {
  it('explains a position missing from the table', () => {
    expect(apiErrorMessage(new ApiError(404, 'moves failed: 404')))
      .toBe('この局面は完全解析テーブルにありません(駒の枚数が不正か、対局が終了した局面です)');
  });

  it('explains an unloaded table', () => {
    expect(apiErrorMessage(new ApiError(503, 'eval failed: 503')))
      .toContain('解析テーブルが読み込まれていません');
  });

  it('falls back to the status for other API errors', () => {
    expect(apiErrorMessage(new ApiError(500, 'eval failed: 500'))).toBe('評価の取得に失敗しました (500)');
  });

  it('falls back to the message for non-API errors', () => {
    expect(apiErrorMessage(new TypeError('network down'))).toBe('評価の取得に失敗しました (network down)');
    expect(apiErrorMessage('boom')).toBe('評価の取得に失敗しました (boom)');
  });
});
