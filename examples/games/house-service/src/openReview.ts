import type { Hex } from 'viem'
import type { GameDomain, StateSigner } from '@gibs/msgboard-games'
import { diceMaxMultiplierX100, escrowFor } from '@gibs/msgboard-games'
import { signOpenTerms, type OpenTerms } from '@gibs/msgboard-settle'

export type OpenRequest = {
  tableId: Hex; player: Hex; playerKey: Hex; gameId: number
  targetX100: bigint; stake: bigint; rngCommit: Hex; clientSeed: Hex
}
export type Limits = { maxEscrowHouse: bigint; minTargetX100: bigint; clockBlocks: bigint; expiryBlocks: bigint }

export async function reviewOpen(
  req: OpenRequest,
  ctx: { houseKey: StateSigner; domain: GameDomain; headBlock: bigint; limits: Limits },
): Promise<{ ok: true; terms: OpenTerms; houseSig: Hex } | { ok: false; reason: string }> {
  if (req.targetX100 < ctx.limits.minTargetX100) return { ok: false, reason: 'target below minimum' }
  if (req.stake <= 0n) return { ok: false, reason: 'non-positive stake' }
  const { escrowPlayer, escrowHouse } = escrowFor(req.stake, diceMaxMultiplierX100({ targetX100: req.targetX100 }))
  if (escrowHouse > ctx.limits.maxEscrowHouse) return { ok: false, reason: 'escrow exceeds house cap' }
  const terms: OpenTerms = {
    tableId: req.tableId, player: req.player, playerKey: req.playerKey,
    escrowPlayer, escrowHouse, gameId: req.gameId, rngCommit: req.rngCommit,
    clockBlocks: ctx.limits.clockBlocks, expiry: ctx.headBlock + ctx.limits.expiryBlocks,
  }
  const houseSig = await signOpenTerms(ctx.houseKey, ctx.domain, terms)
  return { ok: true, terms, houseSig }
}
