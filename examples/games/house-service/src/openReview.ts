import type { Hex } from 'viem'
import type { GameDomain, StateSigner } from '@gibs/msgboard-games'
import { diceMaxMultiplierX100, escrowFor } from '@gibs/msgboard-games'
import { signOpenTerms, type OpenTerms } from '@gibs/msgboard-settle'

export type OpenRequest = {
  tableId: Hex; player: Hex; playerKey: Hex; gameId: number
  targetX100: bigint; stake: bigint
  /** keccak256(clientSeed): the player's entropy COMMITMENT, not the seed itself. Sending only the
   *  commit forces the house to build its server seed chain (ctx.rngCommit) blind, so it cannot grind
   *  its tip against a known clientSeed to bias the roll. The seed is revealed at round time. */
  clientSeedCommit: Hex
}
export type Limits = { maxEscrowHouse: bigint; minTargetX100: bigint; clockBlocks: bigint; expiryBlocks: bigint }

export async function reviewOpen(
  req: OpenRequest,
  // rngCommit is the HOUSE's freshly-built seed-chain commit (seeds[0]); it must be generated WITHOUT
  // knowledge of the player's clientSeed (the request carries only clientSeedCommit), or the house
  // could grind its tip to force a loss. Never sourced from the player.
  ctx: { houseKey: StateSigner; domain: GameDomain; headBlock: bigint; limits: Limits; rngCommit: Hex },
): Promise<{ ok: true; terms: OpenTerms; houseSig: Hex } | { ok: false; reason: string }> {
  if (req.targetX100 < ctx.limits.minTargetX100) return { ok: false, reason: 'target below minimum' }
  if (req.stake <= 0n) return { ok: false, reason: 'non-positive stake' }
  const { escrowPlayer, escrowHouse } = escrowFor(req.stake, diceMaxMultiplierX100({ targetX100: req.targetX100 }))
  if (escrowHouse > ctx.limits.maxEscrowHouse) return { ok: false, reason: 'escrow exceeds house cap' }
  const terms: OpenTerms = {
    tableId: req.tableId, player: req.player, playerKey: req.playerKey,
    escrowPlayer, escrowHouse, gameId: req.gameId, rngCommit: ctx.rngCommit,
    clockBlocks: ctx.limits.clockBlocks, expiry: ctx.headBlock + ctx.limits.expiryBlocks,
  }
  const houseSig = await signOpenTerms(ctx.houseKey, ctx.domain, terms)
  return { ok: true, terms, houseSig }
}
