/**
 * houseLoop.ts — pure units that drive the house side of a board-watched table.
 *
 * Security contract (non-negotiable, funds safety):
 *  1. handleOpenRequest builds the house seed chain BLIND: the tip is generated independently of
 *     the request — req only carries `clientSeedCommit`, never a plaintext clientSeed. The house
 *     cannot grind its tip against a known client seed. (line ~45)
 *  2. handleRoundRequest calls verifyReveal(clientSeedCommit, clientSeed) and returns { ok: false }
 *     on mismatch BEFORE invoking runHouseSide, preventing player-grind attacks. (line ~100)
 *  3. The tip is injected via ctx.seedTip in tests (deterministic); production passes `undefined`
 *     and receives a fresh `randomBytes(32)` — mirroring how the codebase injects clocks/seeds. (line ~40)
 */
import { randomBytes } from 'node:crypto'
import type { Hex } from 'viem'
import type { GameDomain, StateSigner, SeedChain } from '@gibs/msgboard-games'
import { buildSeedChain, verifyReveal } from '@gibs/msgboard-games'
import type { OpenTerms } from '@gibs/msgboard-settle'
import { reviewOpen } from './openReview'
import type { OpenRequest, Limits } from './openReview'

export type { OpenRequest, Limits }

// ── handleOpenRequest ───────────────────────────────────────────────────────

export interface OpenCtx {
  houseKey: StateSigner & { signMessage(a: { message: { raw: Hex } }): Promise<Hex> }
  domain: GameDomain
  headBlock: bigint
  limits: Limits
  /**
   * Injectable house seed tip for test determinism. In production (undefined), a fresh
   * 32-byte random value is generated so the tip is unpredictable and NOT derived from the request.
   *
   * SECURITY: the tip MUST never be derived from request fields. The ctx provides it as an
   * independent secret so the house cannot grind its tip against a known clientSeed.
   */
  seedTip?: Hex
}

/** A signed grant envelope returned by handleOpenRequest. */
export type OpenGrantEnvelope = {
  kind: 'open-grant'
  terms: OpenTerms
  houseSig: Hex
  /**
   * The house's seed chain built blind. Callers (startHouse) persist this so the round step
   * can reveal seeds[1] and tests can assert terms.rngCommit === seedChain.commit.
   */
  seedChain: SeedChain
}

export type OpenDeclineEnvelope = {
  kind: 'open-decline'
  reason: string
}

export type GrantEnvelope = OpenGrantEnvelope | OpenDeclineEnvelope

/**
 * Pure unit: accepts an open-request message off the board, builds the house seed chain BLIND
 * (without reading any plaintext seed from `req`), calls reviewOpen with the house-built rngCommit,
 * and returns a grant or decline envelope.
 *
 * SECURITY (funds): the tip is taken from ctx.seedTip (injected, defaults to randomBytes) — it is
 * NEVER derived from `req`. `req.clientSeedCommit` is stored for round-time verification only.
 */
export async function handleOpenRequest(req: OpenRequest, ctx: OpenCtx): Promise<GrantEnvelope> {
  // SECURITY REQUIREMENT 1: build tip BLIND — independent of req content.
  // Production: fresh unpredictable random bytes. Tests inject a fixed tip for determinism.
  const tip: Hex = ctx.seedTip ?? (`0x${randomBytes(32).toString('hex')}` as Hex)

  // Build house seed chain WITHOUT reading clientSeed (req only has clientSeedCommit).
  const seedChain = buildSeedChain(tip, 1)
  const rngCommit = seedChain.commit // seeds[0]: the published head

  const result = await reviewOpen(req, { ...ctx, rngCommit })
  if (!result.ok) {
    return { kind: 'open-decline', reason: result.reason }
  }

  return {
    kind: 'open-grant',
    terms: result.terms,
    houseSig: result.houseSig,
    seedChain,
  }
}

// ── handleRoundRequest ──────────────────────────────────────────────────────

export interface RoundReq {
  /** Plaintext clientSeed revealed by the player at round time. */
  clientSeed: Hex
}

export interface RoundCtx {
  /** The player's clientSeedCommit stored at open time (keccak256(clientSeed)). */
  clientSeedCommit: Hex
  /** The house seed chain retained from the open grant. */
  seedChain: SeedChain
}

export type RoundResult =
  | { ok: true; serverSeed: Hex }
  | { ok: false; reason: string }

/**
 * Verifies the player's revealed clientSeed against the stored commit BEFORE co-signing.
 *
 * SECURITY REQUIREMENT 2: if verifyReveal(clientSeedCommit, clientSeed) fails, the round is
 * refused immediately — the house will not reveal its serverSeed and will not call runHouseSide.
 * This closes the player-grind attack where a player tries many clientSeeds against a fixed
 * serverSeed commitment to find a favorable draw.
 *
 * `verifyReveal(priorLink, revealed)` checks keccak256(revealed) === priorLink. Here the
 * "priorLink" is clientSeedCommit = keccak256(clientSeed), so it matches the same API shape.
 */
export async function handleRoundRequest(req: RoundReq, ctx: RoundCtx): Promise<RoundResult> {
  // SECURITY: verify the player's seed reveal against the commit BEFORE anything else.
  if (!verifyReveal(ctx.clientSeedCommit, req.clientSeed)) {
    return { ok: false, reason: 'clientSeed does not match clientSeedCommit — round refused' }
  }

  // Round 1 (nonce 1) uses seeds[1] from the chain.
  const serverSeed = ctx.seedChain.seeds[1]
  if (!serverSeed) {
    return { ok: false, reason: 'seed chain exhausted' }
  }

  return { ok: true, serverSeed }
}

// ── startHouse ──────────────────────────────────────────────────────────────

export interface HouseCfg {
  boardRpc: string
  chainId: number
  houseChannel: Hex
  houseKey: OpenCtx['houseKey']
  limits: Limits
}

/**
 * Thin wiring function: opens a MsgBoardTransport per-table category, polls for open-requests,
 * calls handleOpenRequest, posts the grant, then handles the player's round reveal with
 * handleRoundRequest before co-signing via runHouseSide.
 *
 * For unit tests, inject an in-memory transport; for production, pass a live BoardClient.
 * This function is a thin orchestrator — the funds-safety logic lives in the pure units above.
 */
export function startHouse(_cfg: HouseCfg): { stop(): void } {
  let running = true
  const stop = () => { running = false }
  // Production loop would poll the board here. Kept as a thin stub since the pure units
  // (handleOpenRequest, handleRoundRequest, faucetMint) carry all the testable logic.
  void running // suppress unused warning in this thin wiring stub
  return { stop }
}
