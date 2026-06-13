import type { Hex } from 'viem'

export const EDGE_BPS = 100n // 1% house edge, in basis points
export const HUNDREDTHS = 100n // fixed-point scale: 1.00x or 100.00% == 100

export interface RoundOutcome {
  /** signed player delta in chip base units: >0 player wins from house, <0 player loses. */
  playerDelta: bigint
  win: boolean
  /** multiplier applied, in hundredths (181 == 1.81x); 0 on a loss. */
  multiplierX100: bigint
}

/** A house game is a pure pair: settle a round from randomness, and abi-encode its
 *  per-round state for the on-chain mirror (settlement plan). TParams is the bet config. */
export interface Game<TParams> {
  gameId: number
  /** settle one round. `raw` is roundRandom(...). `stake` is the chip wager. */
  settleRound(stake: bigint, params: TParams, raw: bigint): RoundOutcome
  /** canonical abi encoding of (params, raw, outcome) — preimage of gameStateHash. */
  encodeRound(stake: bigint, params: TParams, raw: bigint): Hex
}
