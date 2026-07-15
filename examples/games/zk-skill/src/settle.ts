// @gibs/zk-skill — the off-chain E2E settle for the ZK skill games: generate REAL Groth16 proofs,
// verify them, derive the round RESULT from the proven public signals, and settle the payout through
// the canonical @gibs/msgboard-games skill modules. This is the proof-driven analog of
// @gibs/zk-settle's settle.ts (which does the same for the RNG privacy track), and it ties the
// circuits (M0), the on-chain verifiers (M1), and the payout economics together into a full round.
//
// The payout MATH is not re-implemented here — it is imported from @gibs/msgboard-games so the
// off-chain settle, the on-chain SkillPayouts.sol mirror, and this integration can never drift.

import { setupCircuit, prove, verify, type CircuitSetup } from './harness.js'
import { buildWordleWitnessInput, scoreGuess, type Clue } from './wordle.js'
import { buildSudokuWitnessInput } from './sudoku.js'
import {
  wordle,
  sudoku,
  WORDLE_MAX_GUESSES,
  type WordleParams,
  type WordleResult,
  type SudokuResult,
  type SkillOutcome,
} from '@gibs/msgboard-games'

const PTAU_WORDLE = 12 // 2^12 >= wordle_clue constraints
const PTAU_SUDOKU = 15 // 2^15 >= sudoku_solve constraints

// Compiling + setting up a circuit is the slow step; cache per circuit so a multi-guess Wordle round
// (one proof per guess) reuses one setup.
const setupCache = new Map<string, CircuitSetup>()
function setupFor(name: string, ptauPower: number): CircuitSetup {
  let s = setupCache.get(name)
  if (!s) {
    s = setupCircuit(name, ptauPower)
    setupCache.set(name, s)
  }
  return s
}

const isAllGreen = (clue: Clue[]): boolean => clue.length === 5 && clue.every((t) => t === 2)

/** One house-proven clue in a Wordle round: the guess, its honest clue, and the proof of that. */
export interface WordleClueProof {
  guess: number[]
  clue: Clue[]
  proof: unknown
  publicSignals: string[]
  verified: boolean
}

export interface WordleRoundResult {
  clueProofs: WordleClueProof[]
  result: WordleResult
  outcome: SkillOutcome
}

/**
 * Play + settle one full ZK-Wordle round. The house holds `word` (+`salt`) behind a commitment; for
 * each of the player's `guesses` (in order) it scores the honest clue and PROVES it against the
 * commitment (wordle_clue.circom). The round result is the first guess that scores all-green (the
 * solve) and how many guesses that took; the payout comes straight from `wordle.settleRound`. A round
 * that never goes all-green (within maxGuesses) is a loss — and every clue is still proven, so the
 * loss is auditable.
 *
 * Every returned clue proof is INDEPENDENTLY verified here; a failing verify throws (the house cannot
 * pass off a dishonest clue). Stops proving once solved — later guesses are moot.
 */
export async function playWordleRound(params: {
  word: number[]
  salt: bigint
  guesses: number[][]
  stake: bigint
  maxGuesses?: number
}): Promise<WordleRoundResult> {
  const maxGuesses = params.maxGuesses ?? WORDLE_MAX_GUESSES
  if (params.guesses.length > maxGuesses) throw new Error('wordle: more guesses than allowed')
  const setup = setupFor('wordle_clue', PTAU_WORDLE)

  const clueProofs: WordleClueProof[] = []
  let solvedAt = 0 // 1-based guesses-used; 0 == not solved
  for (let i = 0; i < params.guesses.length; i++) {
    const guess = params.guesses[i]!
    const clue = scoreGuess(params.word, guess)
    const input = await buildWordleWitnessInput({ word: params.word, salt: params.salt, guess, clue })
    const { proof, publicSignals } = await prove(setup, input)
    const verified = await verify(setup, publicSignals, proof)
    if (!verified) throw new Error(`wordle: clue proof ${i + 1} failed to verify`)
    clueProofs.push({ guess, clue, proof, publicSignals, verified })
    if (isAllGreen(clue)) {
      solvedAt = i + 1
      break
    }
  }

  const wordleParams: WordleParams = { maxGuesses }
  const result: WordleResult = { solved: solvedAt > 0, guessesUsed: solvedAt || params.guesses.length }
  const outcome = wordle.settleRound(params.stake, wordleParams, result)
  return { clueProofs, result, outcome }
}

export interface SudokuRoundResult {
  /** the house's solvability proof of the SAME public puzzle (guarantees ≥1 solution exists) */
  houseSolvabilityProof: { proof: unknown; publicSignals: string[]; verified: boolean }
  /** the player's win proof, bound to `player` via the nullifier (publicSignals[0]) */
  proof: unknown
  publicSignals: string[]
  nullifier: string
  result: SudokuResult
  outcome: SkillOutcome
}

/**
 * Play + settle one full ZK-Sudoku round with the M3 "role-flip" flow:
 *
 *   1. The HOUSE proves SOLVABILITY of the public `puzzle` at open (a sudoku_solve proof of
 *      `houseSolution`), so a malicious house cannot post an unsolvable/ambiguous board that an honest
 *      solver would forfeit on. This reuses the same circuit — the solution stays private.
 *   2. The PLAYER proves they know a VALID solution to the SAME public puzzle (sudoku_solve.circom),
 *      bound to their OWN `player` address via the nullifier — NOT to any house secret. ANY valid
 *      solution wins. A verifying proof is a win → flat multiplier; an invalid solution fails
 *      witness-gen / verify → loss.
 *
 * `houseSolution` and `solution` may be the same grid (unique puzzle) or different valid grids
 * (ambiguous puzzle) — any valid solution wins, so uniqueness is not required for fairness once the
 * house has proven solvability. `player` binds the win proof; a mempool watcher cannot copy it.
 */
export async function playSudokuRound(params: {
  puzzle: number[]
  solution: number[]
  player: bigint
  stake: bigint
  /** the house's own valid solution used only to prove solvability at open; defaults to `solution` */
  houseSolution?: number[]
  /** address the house binds its solvability proof to (irrelevant to solvability); defaults to 1n */
  housePlayer?: bigint
}): Promise<SudokuRoundResult> {
  const setup = setupFor('sudoku_solve', PTAU_SUDOKU)

  // 1. house solvability proof (open): proves the committed puzzle has ≥1 solution.
  const houseInput = await buildSudokuWitnessInput({
    puzzle: params.puzzle,
    solution: params.houseSolution ?? params.solution,
    player: params.housePlayer ?? 1n,
  })
  const houseProved = await prove(setup, houseInput)
  const houseVerified = await verify(setup, houseProved.publicSignals, houseProved.proof)
  if (!houseVerified) throw new Error('sudoku: house solvability proof failed to verify')

  // 2. player win proof: a valid solution to the SAME public puzzle, bound to `player`.
  const input = await buildSudokuWitnessInput({
    puzzle: params.puzzle,
    solution: params.solution,
    player: params.player,
  })
  const { proof, publicSignals } = await prove(setup, input)
  const verified = await verify(setup, publicSignals, proof)
  const result: SudokuResult = { solved: verified }
  const outcome = sudoku.settleRound(params.stake, {}, result)
  return {
    houseSolvabilityProof: {
      proof: houseProved.proof,
      publicSignals: houseProved.publicSignals,
      verified: houseVerified,
    },
    proof,
    publicSignals,
    nullifier: publicSignals[0]!,
    result,
    outcome,
  }
}
