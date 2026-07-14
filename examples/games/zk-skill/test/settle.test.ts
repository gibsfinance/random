/**
 * settle.test.ts — the ZK skill games' full OFF-CHAIN round, end to end with REAL Groth16 proofs:
 * generate the proof(s) → verify → derive the result from the proven play → settle the payout through
 * the canonical @gibs/msgboard-games modules. Proves the circuits (M0), the proving glue, and the
 * payout economics agree on a complete round for each game — the off-chain twin of the on-chain
 * SkillSettle foundry round.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  playWordleRound,
  playSudokuRound,
  setupCircuit,
  wordToIndices,
} from '../src/index.js'

// A known-valid solved grid + a clues-only puzzle (row 0 + col 0 revealed) — the M0 vector.
const SUDOKU_SOLUTION: number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9,
  4, 5, 6, 7, 8, 9, 1, 2, 3,
  7, 8, 9, 1, 2, 3, 4, 5, 6,
  2, 3, 1, 5, 6, 4, 8, 9, 7,
  5, 6, 4, 8, 9, 7, 2, 3, 1,
  8, 9, 7, 2, 3, 1, 5, 6, 4,
  3, 1, 2, 6, 4, 5, 9, 7, 8,
  6, 4, 5, 9, 7, 8, 3, 1, 2,
  9, 7, 8, 3, 1, 2, 6, 4, 5,
]
const SUDOKU_PUZZLE: number[] = SUDOKU_SOLUTION.map((v, i) =>
  Math.floor(i / 9) === 0 || i % 9 === 0 ? v : 0,
)

describe('ZK skill games — full off-chain round with real proofs', () => {
  // warm the circuit setups once (compile + groth16 setup is the slow step)
  beforeAll(async () => {
    setupCircuit('wordle_clue', 12)
    setupCircuit('sudoku_solve', 15)
  }, 600_000)

  it('Wordle: solving in 2 guesses pays 3.50× (each clue proven honest)', async () => {
    const word = wordToIndices('crane')
    const round = await playWordleRound({
      word,
      salt: 424242n,
      // guess 1 misses, guess 2 is the word itself → all-green solve at guess 2
      guesses: [wordToIndices('slate'), wordToIndices('crane')],
      stake: 1000n,
    })
    expect(round.clueProofs).toHaveLength(2)
    expect(round.clueProofs.every((p) => p.verified)).toBe(true)
    expect(round.clueProofs[1]!.clue).toEqual([2, 2, 2, 2, 2]) // the solve
    expect(round.result).toEqual({ solved: true, guessesUsed: 2 })
    expect(round.outcome.multiplierX100).toBe(350n)
    expect(round.outcome.playerDelta).toBe(2500n) // 1000*3.50 - 1000
    expect(round.outcome.win).toBe(true)
  }, 600_000)

  it('Wordle: a solve in 1 pays the 25× ceiling', async () => {
    const word = wordToIndices('proxy')
    const round = await playWordleRound({
      word,
      salt: 7n,
      guesses: [wordToIndices('proxy')],
      stake: 100n,
    })
    expect(round.result).toEqual({ solved: true, guessesUsed: 1 })
    expect(round.outcome.multiplierX100).toBe(2500n)
    expect(round.outcome.playerDelta).toBe(2400n)
  }, 600_000)

  it('Wordle: missing all 6 guesses is a loss (and every clue is still proven)', async () => {
    const word = wordToIndices('crane')
    const round = await playWordleRound({
      word,
      salt: 999n,
      guesses: [
        wordToIndices('boils'),
        wordToIndices('humid'),
        wordToIndices('unfit'),
        wordToIndices('ghost'),
        wordToIndices('dozen'),
        wordToIndices('jumbo'),
      ],
      stake: 500n,
    })
    expect(round.clueProofs).toHaveLength(6)
    expect(round.clueProofs.every((p) => p.verified)).toBe(true)
    expect(round.clueProofs.some((p) => p.clue.every((t) => t === 2))).toBe(false)
    expect(round.result.solved).toBe(false)
    expect(round.outcome).toEqual({ win: false, playerDelta: -500n, multiplierX100: 0n })
  }, 600_000)

  it('Sudoku: a real solve proof settles the flat 1.90× win', async () => {
    const round = await playSudokuRound({
      puzzle: SUDOKU_PUZZLE,
      solution: SUDOKU_SOLUTION,
      salt: 13371337n,
      stake: 1000n,
    })
    expect(round.result.solved).toBe(true)
    expect(round.outcome.multiplierX100).toBe(190n)
    expect(round.outcome.playerDelta).toBe(900n) // 1000*1.90 - 1000
    expect(round.outcome.win).toBe(true)
  }, 600_000)
})
