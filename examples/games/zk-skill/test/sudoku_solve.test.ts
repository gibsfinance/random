import { beforeAll, describe, expect, it } from 'vitest'
import {
  buildSudokuWitnessInput,
  isValidSolution,
  prove,
  setupCircuit,
  sudokuNullifier,
  verify,
  type CircuitSetup,
} from '../src/index.js'

const PTAU_POWER = 15 // 2^15 = 32768 >= ~22.9k constraints

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

const PLAYER = 0x1234567890abcdefn

describe('sanity: fixed vector', () => {
  it('the fixed vector is a genuinely valid sudoku solution', () => {
    expect(isValidSolution(PUZZLE, SOLUTION)).toBe(true)
  })
})

describe('sudoku_solve circuit (M3 role-flip: no house secret, player-bound nullifier)', () => {
  let setup: CircuitSetup

  beforeAll(async () => {
    setup = setupCircuit('sudoku_solve', PTAU_POWER)
  }, 300_000)

  it('proves and verifies a valid solution, with 83 public signals [nullifier, puzzle[81], player]', async () => {
    const input = await buildSudokuWitnessInput({ puzzle: PUZZLE, solution: SOLUTION, player: PLAYER })
    const { proof, publicSignals } = await prove(setup, input)
    const ok = await verify(setup, publicSignals, proof)
    expect(ok).toBe(true)
    expect(publicSignals).toHaveLength(83)
    // ordering: nullifier first, then the 81 puzzle cells, then player
    expect(publicSignals[1]).toBe('1') // puzzle[0]
    expect(publicSignals[82]).toBe(PLAYER.toString()) // player
  })

  it('the circuit nullifier == the JS mirror sudokuNullifier(solution, player)', async () => {
    const input = await buildSudokuWitnessInput({ puzzle: PUZZLE, solution: SOLUTION, player: PLAYER })
    const { publicSignals } = await prove(setup, input)
    const expected = await sudokuNullifier(SOLUTION, PLAYER)
    expect(publicSignals[0]).toBe(expected.toString())
  })

  it('binds the proof to `player`: a different player yields a different nullifier (anti-front-run)', async () => {
    const a = await sudokuNullifier(SOLUTION, PLAYER)
    const b = await sudokuNullifier(SOLUTION, PLAYER + 1n)
    expect(a).not.toBe(b)
  })

  it('nullifier is stable for the same solution+player', async () => {
    const n1 = await sudokuNullifier(SOLUTION, PLAYER)
    const n2 = await sudokuNullifier(SOLUTION, PLAYER)
    expect(n1).toBe(n2)
  })

  it('rejects a solution that breaks a row/box permutation (blank cell)', async () => {
    // row 4, col 4 is blank in PUZZLE (not row 0, not col 0) -- change it to
    // duplicate an existing value in that row/box/column.
    const broken = [...SOLUTION]
    const idx = 4 * 9 + 4
    expect(PUZZLE[idx]).toBe(0)
    broken[idx] = SOLUTION[4 * 9 + 0]! // duplicates row4's first cell (5)
    expect(isValidSolution(PUZZLE, broken)).toBe(false)

    const input = await buildSudokuWitnessInput({ puzzle: PUZZLE, solution: broken, player: PLAYER })
    await expect(prove(setup, input)).rejects.toThrow()
  })

  it('rejects a solution disagreeing with a given clue', async () => {
    // row 0, col 0 IS a given clue (value 1). Change the solution there.
    const disagreeing = [...SOLUTION]
    expect(PUZZLE[0]).toBe(1)
    disagreeing[0] = 9
    expect(isValidSolution(PUZZLE, disagreeing)).toBe(false)

    const input = await buildSudokuWitnessInput({ puzzle: PUZZLE, solution: disagreeing, player: PLAYER })
    await expect(prove(setup, input)).rejects.toThrow()
  })

  it('rejects a forged nullifier (a witness whose claimed nullifier != the computed one)', async () => {
    const input = await buildSudokuWitnessInput({ puzzle: PUZZLE, solution: SOLUTION, player: PLAYER })
    const { proof, publicSignals } = await prove(setup, input)
    // tamper the public nullifier: verify must fail (the proof is bound to the real one)
    const forged = [...publicSignals]
    forged[0] = (BigInt(forged[0]!) + 1n).toString()
    const ok = await verify(setup, forged, proof)
    expect(ok).toBe(false)
  })
})
