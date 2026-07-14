import { beforeAll, describe, expect, it } from 'vitest'
import {
  buildSudokuWitnessInput,
  isValidSolution,
  prove,
  setupCircuit,
  sudokuCommit,
  verify,
  type CircuitSetup,
} from '../src/index.js'

const PTAU_POWER = 15 // 2^15 = 32768 >= 22462 constraints

// A known-valid, fully solved 9x9 grid (band-rotation construction).
// Every row / column / 3x3 box is a permutation of 1..9.
const SOLUTION: number[] = [
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

// Given clues: only row 0 and column 0 are revealed, everything else blank.
const PUZZLE: number[] = SOLUTION.map((v, i) => {
  const r = Math.floor(i / 9)
  const c = i % 9
  return r === 0 || c === 0 ? v : 0
})

describe('sanity: fixed vector', () => {
  it('the fixed vector is a genuinely valid sudoku solution', () => {
    expect(isValidSolution(PUZZLE, SOLUTION)).toBe(true)
  })
})

describe('sudoku_solve circuit', () => {
  let setup: CircuitSetup

  beforeAll(async () => {
    setup = setupCircuit('sudoku_solve', PTAU_POWER)
  }, 300_000)

  const salt = 13371337n

  it('proves and verifies a valid solution', async () => {
    const input = await buildSudokuWitnessInput({ puzzle: PUZZLE, solution: SOLUTION, salt })
    const { proof, publicSignals } = await prove(setup, input)
    const ok = await verify(setup, publicSignals, proof)
    expect(ok).toBe(true)
  })

  it('rejects a solution that breaks a row/box permutation (blank cell)', async () => {
    // row 4, col 4 is blank in PUZZLE (not row 0, not col 0) -- change it to
    // duplicate an existing value in that row/box/column.
    const broken = [...SOLUTION]
    const idx = 4 * 9 + 4
    expect(PUZZLE[idx]).toBe(0)
    broken[idx] = SOLUTION[4 * 9 + 0]! // duplicates row4's first cell (5)
    expect(isValidSolution(PUZZLE, broken)).toBe(false)

    const input = await buildSudokuWitnessInput({ puzzle: PUZZLE, solution: broken, salt })
    await expect(prove(setup, input)).rejects.toThrow()
  })

  it('rejects a solution disagreeing with a given clue', async () => {
    // row 0, col 0 IS a given clue (value 1). Change the solution there.
    const disagreeing = [...SOLUTION]
    expect(PUZZLE[0]).toBe(1)
    disagreeing[0] = 9
    expect(isValidSolution(PUZZLE, disagreeing)).toBe(false)

    const input = await buildSudokuWitnessInput({ puzzle: PUZZLE, solution: disagreeing, salt })
    await expect(prove(setup, input)).rejects.toThrow()
  })

  it('rejects a wrong commit', async () => {
    const input = await buildSudokuWitnessInput({ puzzle: PUZZLE, solution: SOLUTION, salt })
    const wrongCommit = (BigInt(input.commit) + 1n).toString()
    await expect(prove(setup, { ...input, commit: wrongCommit })).rejects.toThrow()
  })

  it('commit is stable for the same solution+salt', async () => {
    const c1 = await sudokuCommit(SOLUTION, salt)
    const c2 = await sudokuCommit(SOLUTION, salt)
    expect(c1).toBe(c2)
  })
})
