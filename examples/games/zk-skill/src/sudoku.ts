// Sudoku solution commitment + witness helpers (JS mirror of
// circuits/sudoku_solve.circom).
//
// Commitment scheme (must match the circuit bit-for-bit):
//   rowDigest[r] = Poseidon(solution[r*9 .. r*9+8])   for r = 0..8   (9 inputs)
//   commit       = Poseidon(rowDigest[0..8], salt)                  (10 inputs)
// i.e. a two-level sponge: hash each row of the 9x9 grid with one
// Poseidon(9) call, then hash the 9 row digests + salt with one
// Poseidon(10) call. Keeps every Poseidon call within circomlib's <=16
// input limit while covering all 81 cells + the salt.

import { buildPoseidon } from 'circomlibjs'

let poseidonPromise: ReturnType<typeof buildPoseidon> | undefined

function getPoseidon() {
  poseidonPromise ??= buildPoseidon()
  return poseidonPromise
}

export async function sudokuCommit(solution: number[], salt: bigint): Promise<bigint> {
  if (solution.length !== 81) throw new Error('solution must have 81 cells')
  const poseidon = await getPoseidon()
  const F = poseidon.F
  const rowDigests: bigint[] = []
  for (let r = 0; r < 9; r++) {
    const row = solution.slice(r * 9, r * 9 + 9).map(BigInt)
    const h = poseidon(row)
    rowDigests.push(BigInt(F.toString(h)))
  }
  const top = poseidon([...rowDigests, salt])
  return BigInt(F.toString(top))
}

function groupIndices(): number[][] {
  const groups: number[][] = []
  for (let r = 0; r < 9; r++) {
    groups.push(Array.from({ length: 9 }, (_, c) => r * 9 + c))
  }
  for (let c = 0; c < 9; c++) {
    groups.push(Array.from({ length: 9 }, (_, r) => r * 9 + c))
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const cells: number[] = []
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          cells.push((br * 3 + dr) * 9 + (bc * 3 + dc))
        }
      }
      groups.push(cells)
    }
  }
  return groups
}

export const SUDOKU_GROUPS = groupIndices()

/** Reference (non-circuit) full validity check, mirroring the circuit's constraints. */
export function isValidSolution(puzzle: number[], solution: number[]): boolean {
  if (puzzle.length !== 81 || solution.length !== 81) return false
  for (let i = 0; i < 81; i++) {
    if (solution[i]! < 1 || solution[i]! > 9) return false
    if (puzzle[i] !== 0 && puzzle[i] !== solution[i]) return false
  }
  for (const group of SUDOKU_GROUPS) {
    const seen = new Set<number>()
    for (const idx of group) seen.add(solution[idx]!)
    if (seen.size !== 9) return false
  }
  return true
}

export interface SudokuWitnessInput {
  puzzle: number[]
  commit: string
  solution: number[]
  salt: string
  [key: string]: unknown
}

export async function buildSudokuWitnessInput(params: {
  puzzle: number[]
  solution: number[]
  salt: bigint
}): Promise<SudokuWitnessInput> {
  const commit = await sudokuCommit(params.solution, params.salt)
  return {
    puzzle: params.puzzle,
    commit: commit.toString(),
    solution: params.solution,
    salt: params.salt.toString(),
  }
}
