import { type SkillGame, type SkillOutcome, skillOutcome } from '../skill'

/**
 * ZK-Sudoku (gameId 31) — the house commits a puzzle (published clues) before the bet and proves at
 * open that it is SOLVABLE (a sudoku_solve proof of a private solution), so it cannot post an
 * unsolvable/ambiguous board an honest solver would forfeit on. The player then privately solves it and
 * submits a PLONK proof they know ANY valid solution to the committed puzzle (see @gibs/zk-skill
 * circuits/sudoku_solve.circom + contracts/zk/SudokuRules.sol). The proof references NO house secret;
 * it is bound to the player's own address via a nullifier = Poseidon(solutionDigest ‖ player), so in a
 * timed/multiplayer race a mempool front-runner cannot copy the solve, and the contract records the
 * nullifier to block replay/double-claim (M3, shipped).
 *
 * Payout is a flat, PUBLISHED skill multiplier on a valid solve; no solve → loss. The house edge is
 * not in the multiplier — it is in the puzzle difficulty and the time/stake budget, chosen so the
 * average player's solve rate keeps the return < 1× (see SUDOKU_REFERENCE_SOLVE_RATE). On-chain
 * mirror: SkillPayouts.sudokuMultX100.
 */

export const SUDOKU_GAME_ID = 31

/** flat payout multiplier (×100) on a proven valid solve: 1.90×. Also the escrow ceiling. */
export const SUDOKU_MULT_X100 = 190n

/**
 * PUBLISHED reference "average player" solve rate (in basis points of rounds solved within the
 * committed puzzle's time/stake budget): 5000 == 50%. This is the assumption the house edge is quoted
 * against — the puzzle difficulty and clock are set to hold the average solver near it. RTP under it is
 * `solveRate × SUDOKU_MULT_X100`: 0.50 × 1.90 = 0.95 (a 5% edge). A stronger solver beats it — that is
 * the skill. The guarantee (asserted in test/skillGames.test.ts) is only that at this reference rate
 * the house is not player-favourable. Because the multiplier is 1.90×, ANY reference rate below
 * 1/1.90 ≈ 52.6% keeps RTP < 100%.
 */
export const SUDOKU_REFERENCE_SOLVE_RATE_BPS = 5000n

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SudokuParams {
  /** intentionally empty: the puzzle + commitment are round facts bound on-chain at open, not a bet
   *  knob, and the multiplier is flat — so there is no per-round param to configure. */
}

/** The verified round summary: was a valid solution to the committed puzzle proven. */
export interface SudokuResult {
  solved: boolean
}

/** payout multiplier (×100) for a result — the flat solve multiplier, or 0 if unsolved. */
export function sudokuMultiplierX100(result: SudokuResult): bigint {
  return result.solved ? SUDOKU_MULT_X100 : 0n
}

export const sudoku: SkillGame<SudokuParams, SudokuResult> = {
  gameId: SUDOKU_GAME_ID,
  maxMultiplierX100(): bigint {
    return SUDOKU_MULT_X100
  },
  settleRound(stake, _params, result): SkillOutcome {
    return skillOutcome(stake, sudokuMultiplierX100(result))
  },
}
