// Sudoku solution nullifier + witness helpers (JS mirror of
// circuits/sudoku_solve.circom).
//
// M3 role-flip: the player's win proof no longer references any house secret
// (M2's `Poseidon(solution‖salt) == commit` was unprovable for the player and
// house-griefable). Instead the proof binds all 81 solution cells + the public
// `player` into a nullifier, so it cannot be replayed / front-run:
//
//   rowDigest[r] = Poseidon(solution[r*9 .. r*9+8])    (9 inputs) for r = 0..8
//   nullifier    = Poseidon(rowDigest[0..8], player)   (10 inputs)
//
// i.e. a two-level sponge keeping every Poseidon call within circomlib's <=16
// input limit. Must match the circuit bit-for-bit.

import { buildPoseidon } from 'circomlibjs'

let poseidonPromise: ReturnType<typeof buildPoseidon> | undefined

function getPoseidon() {
  poseidonPromise ??= buildPoseidon()
  return poseidonPromise
}

/** The 9 per-row Poseidon(9) digests of a solution (the sponge's first level). */
async function rowDigests(solution: number[]): Promise<bigint[]> {
  if (solution.length !== 81) throw new Error('solution must have 81 cells')
  const poseidon = await getPoseidon()
  const F = poseidon.F
  const digests: bigint[] = []
  for (let r = 0; r < 9; r++) {
    const row = solution.slice(r * 9, r * 9 + 9).map(BigInt)
    digests.push(BigInt(F.toString(poseidon(row))))
  }
  return digests
}

/**
 * The proof's nullifier = Poseidon(rowDigest[0..8], player). Preimage-resistant in
 * `solution` (a watcher who cannot solve the puzzle cannot compute it) and bound to
 * `player` so a copied proof cannot be reused for a different player+round. The
 * contract records spent nullifiers to block replay / double-claim.
 */
export async function sudokuNullifier(solution: number[], player: bigint): Promise<bigint> {
  const poseidon = await getPoseidon()
  const F = poseidon.F
  const digests = await rowDigests(solution)
  return BigInt(F.toString(poseidon([...digests, player])))
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
  player: string
  solution: number[]
  [key: string]: unknown
}

/**
 * Build the circuit witness input for a solve of `puzzle` by `player`. The proof binds
 * to `player` (an address as a field element) via the nullifier; the same builder is
 * used both for the HOUSE's solvability proof at open (any player value) and the
 * PLAYER's win proof (player = the table's player).
 */
export async function buildSudokuWitnessInput(params: {
  puzzle: number[]
  solution: number[]
  player: bigint
}): Promise<SudokuWitnessInput> {
  return {
    puzzle: params.puzzle,
    player: params.player.toString(),
    solution: params.solution,
  }
}
