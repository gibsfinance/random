/**
 * skillGames.test.ts — the ZK skill games' PUBLISHED payout curves (Wordle by guesses-used, Sudoku
 * flat) are: (a) correct at every reachable result, (b) escrow-safe — settle never pays above the
 * declared ceiling, and (c) FAIRNESS — under each game's documented reference outcome distribution the
 * realized RTP is ≤ 100% (never player-favourable) and inside the published band. Unlike the RNG games
 * these are skill games, so RTP is a function of a *reference* player distribution, not a fixed roll
 * probability — a skilled player can beat it; the house is protected only against the average player.
 */
import { describe, it, expect } from 'vitest'
import {
  rtpBps,
  wordle, WORDLE_GAME_ID, WORDLE_MAX_GUESSES, WORDLE_MULT_X100, WORDLE_REFERENCE_WEIGHTS,
  wordleMultiplierX100,
  sudoku, SUDOKU_GAME_ID, SUDOKU_MULT_X100, SUDOKU_REFERENCE_SOLVE_RATE_BPS, sudokuMultiplierX100,
  skillOutcome,
} from '../src'

describe('skill games — shared outcome helper', () => {
  it('a payout > stake is a win; == stake is a break-even push; < stake is a partial-refund loss; 0 is a loss', () => {
    expect(skillOutcome(100n, 250n)).toEqual({ win: true, playerDelta: 150n, multiplierX100: 250n })
    expect(skillOutcome(100n, 100n)).toEqual({ win: false, playerDelta: 0n, multiplierX100: 100n }) // push
    expect(skillOutcome(100n, 80n)).toEqual({ win: false, playerDelta: -20n, multiplierX100: 80n }) // refund
    expect(skillOutcome(100n, 0n)).toEqual({ win: false, playerDelta: -100n, multiplierX100: 0n }) // loss
  })
})

describe('ZK-Wordle (gameId 30)', () => {
  const params = { maxGuesses: WORDLE_MAX_GUESSES }

  it('has the expected gameId and escrow ceiling (solve-in-1)', () => {
    expect(wordle.gameId).toBe(30)
    expect(WORDLE_GAME_ID).toBe(30)
    expect(wordle.maxMultiplierX100(params)).toBe(WORDLE_MULT_X100[1])
  })

  it('pays the published multiplier for each guesses-used, 0 on a miss', () => {
    for (let g = 1; g <= WORDLE_MAX_GUESSES; g++) {
      const o = wordle.settleRound(1000n, params, { solved: true, guessesUsed: g })
      const expectedMult = WORDLE_MULT_X100[g]!
      expect(o.multiplierX100).toBe(expectedMult)
      expect(o.playerDelta).toBe((1000n * expectedMult) / 100n - 1000n)
    }
    const miss = wordle.settleRound(1000n, params, { solved: false, guessesUsed: 6 })
    expect(miss).toEqual({ win: false, playerDelta: -1000n, multiplierX100: 0n })
  })

  it('fast solves (1–3) win; the modal 4-guess solve is a net loss (partial refund)', () => {
    expect(wordle.settleRound(100n, params, { solved: true, guessesUsed: 1 }).win).toBe(true)
    expect(wordle.settleRound(100n, params, { solved: true, guessesUsed: 3 }).win).toBe(true)
    expect(wordle.settleRound(100n, params, { solved: true, guessesUsed: 4 }).win).toBe(false)
  })

  it('FUNDS-SAFETY: no reachable result pays above the escrow ceiling', () => {
    const ceiling = wordle.maxMultiplierX100(params)
    for (let g = 1; g <= WORDLE_MAX_GUESSES; g++) {
      expect(wordle.settleRound(1000n, params, { solved: true, guessesUsed: g }).multiplierX100)
        .toBeLessThanOrEqual(ceiling)
    }
  })

  it('rejects out-of-range guesses-used and unsupported maxGuesses', () => {
    expect(() => wordleMultiplierX100({ solved: true, guessesUsed: 7 })).toThrow()
    expect(() => wordleMultiplierX100({ solved: true, guessesUsed: 0 })).toThrow()
    expect(() => wordle.settleRound(1n, { maxGuesses: 5 }, { solved: true, guessesUsed: 1 })).toThrow()
  })

  it('FAIRNESS: realized RTP under the reference distribution is ≤ 100% and in [90%, 99%]', () => {
    const outcomes = WORDLE_REFERENCE_WEIGHTS.map(({ guesses, weight }) => ({
      weight,
      multX100: guesses === 0 ? 0n : WORDLE_MULT_X100[guesses]!,
    }))
    const rtp = rtpBps(outcomes)
    expect(rtp).toBe(9460n) // 94.60% — pinned so a table change can't silently move the edge
    expect(rtp).toBeLessThanOrEqual(10_000n) // never player-favourable
    expect(rtp).toBeGreaterThanOrEqual(9_000n)
  })
})

describe('ZK-Sudoku (gameId 31)', () => {
  it('has the expected gameId and flat escrow ceiling', () => {
    expect(sudoku.gameId).toBe(31)
    expect(SUDOKU_GAME_ID).toBe(31)
    expect(sudoku.maxMultiplierX100({})).toBe(SUDOKU_MULT_X100)
  })

  it('pays the flat multiplier on a solve, loses stake on no solve', () => {
    const win = sudoku.settleRound(1000n, {}, { solved: true })
    expect(win).toEqual({ win: true, playerDelta: 900n, multiplierX100: 190n })
    const loss = sudoku.settleRound(1000n, {}, { solved: false })
    expect(loss).toEqual({ win: false, playerDelta: -1000n, multiplierX100: 0n })
    expect(sudokuMultiplierX100({ solved: false })).toBe(0n)
  })

  it('FUNDS-SAFETY: a solve never pays above the escrow ceiling', () => {
    expect(sudoku.settleRound(1000n, {}, { solved: true }).multiplierX100)
      .toBeLessThanOrEqual(sudoku.maxMultiplierX100({}))
  })

  it('FAIRNESS: RTP at the reference solve rate is ≤ 100% (and any rate < 1/1.90 keeps an edge)', () => {
    // RTP(bps) = solveRate(bps) × multX100 / 100
    const rtp = (SUDOKU_REFERENCE_SOLVE_RATE_BPS * SUDOKU_MULT_X100) / 100n
    expect(rtp).toBe(9500n) // 0.50 × 1.90 = 0.95
    expect(rtp).toBeLessThanOrEqual(10_000n)
    // the break-even solve rate is 1/1.90 = 52.63% → 5263 bps; the reference sits safely below it.
    expect(SUDOKU_REFERENCE_SOLVE_RATE_BPS).toBeLessThan((10_000n * 100n) / SUDOKU_MULT_X100)
  })
})
