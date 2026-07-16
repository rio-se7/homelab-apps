import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evalPly, buildTimeline } from './timeline';
import { initialState } from '../engine/board';
import { LION, type GameState } from '../engine/types';
import { fetchMoves } from '../api/client';

// The engine's fetchMoves is the only external dependency of evalPly.
vi.mock('../api/client', () => ({ fetchMoves: vi.fn() }));
const mockedFetchMoves = vi.mocked(fetchMoves);

const emptyBoard = () => Array.from({ length: 3 }, () => [0, 0, 0, 0]);
// White lion captured → checkWinner returns 'black' (terminal).
const terminalBlackWin: GameState = {
  board: (() => { const b = emptyBoard(); b[1][3] = LION; return b; })(),
  hand: { black: [0, 0, 0], white: [0, 0, 0] }, turn: 'white', history: [],
};

beforeEach(() => mockedFetchMoves.mockReset());

describe('evalPly', () => {
  it('normalizes the mover-best result to learner perspective (turn === learner)', async () => {
    mockedFetchMoves.mockResolvedValue({ moves: [{ mv: 'x', result: 'win', dtm: 1 }] });
    const p = await evalPly(initialState(), 'black'); // black to move, learner black
    expect(p.vLearner).toBe(2);
    expect(p.moves).toHaveLength(1);
  });

  it('inverts the value when the side to move is the opponent (2 - moverRank)', async () => {
    mockedFetchMoves.mockResolvedValue({ moves: [{ mv: 'x', result: 'win', dtm: 1 }] });
    const p = await evalPly(initialState(), 'white'); // black to move, learner white
    expect(p.vLearner).toBe(0);
  });

  it('resolves terminal positions via checkWinner without hitting the API', async () => {
    const p = await evalPly(terminalBlackWin, 'black');
    expect(p.vLearner).toBe(2);      // black won
    expect(p.moves).toEqual([]);
    expect(mockedFetchMoves).not.toHaveBeenCalled();

    const pw = await evalPly(terminalBlackWin, 'white');
    expect(pw.vLearner).toBe(0);     // white lost
  });
});

describe('buildTimeline', () => {
  it('evaluates every position in order', async () => {
    mockedFetchMoves.mockResolvedValue({ moves: [{ mv: 'x', result: 'draw', dtm: 0 }] });
    const timeline = await buildTimeline([initialState(), terminalBlackWin], 'black');
    expect(timeline).toHaveLength(2);
    expect(timeline[0].vLearner).toBe(1);  // draw, learner to move
    expect(timeline[1].vLearner).toBe(2);  // terminal black win
    expect(mockedFetchMoves).toHaveBeenCalledTimes(1); // only the non-terminal position
  });
});
