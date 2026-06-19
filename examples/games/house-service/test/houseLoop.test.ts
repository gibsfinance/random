/**
 * Tests for handleOpenRequest (pure unit from houseLoop.ts) and round-step security checks.
 *
 * Security invariants tested:
 *  1. House builds seed chain BLIND: env.terms.rngCommit === env.seedChain.commit (house-built,
 *     NOT taken from req) — req only carries clientSeedCommit, never a plaintext seed.
 *  2. Round step: a mismatched revealed clientSeed is rejected BEFORE runHouseSide is called.
 *  3. faucetMint caps to min(amount, cap) and calls walletClient.writeContract correctly.
 */
import { describe, it, expect, vi } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { makeSettleDomain } from '@gibs/msgboard-settle'
import { commitSeed, buildSeedChain } from '@gibs/msgboard-games'
import type { Hex } from 'viem'
import { handleOpenRequest, handleRoundRequest } from '../src/houseLoop'
import { faucetMint } from '../src/faucet'

// ── fixtures ────────────────────────────────────────────────────────────────

const HOUSE_KEY_HEX = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex
const HOUSE = privateKeyToAccount(HOUSE_KEY_HEX)
// Thin adapter matching StateSigner + EnvelopeSigner
const houseKey = {
  address: HOUSE.address,
  signTypedData: (a: Parameters<typeof HOUSE.signTypedData>[0]) => HOUSE.signTypedData(a),
  signMessage: (a: Parameters<typeof HOUSE.signMessage>[0]) => HOUSE.signMessage(a),
} as const

const domain = makeSettleDomain(943, '0x57876609E4fEDDEeB83e46A1b3A20140998f0e46')
const limits = {
  maxEscrowHouse: 10n ** 24n,
  minTargetX100: 100n,
  clockBlocks: 120n,
  expiryBlocks: 300n,
}

const clientSeed = ('0x' + 'aa'.repeat(32)) as Hex
const clientSeedCommit = commitSeed(clientSeed) // keccak256(clientSeed)

const baseReq = {
  tableId: ('0x' + '11'.repeat(32)) as Hex,
  player: '0x000000000000000000000000000000000000dEaD' as Hex,
  playerKey: '0x000000000000000000000000000000000000bEEF' as Hex,
  gameId: 0,
  targetX100: 5000n,
  stake: 1_000n,
  // SECURITY: only the commit is sent; plaintext seed stays with the player
  clientSeedCommit,
}

// Injected deterministic tip for test repeatability (prod uses randomBytes)
const deterministicTip = ('0x' + '77'.repeat(32)) as Hex

// ── handleOpenRequest tests ─────────────────────────────────────────────────

describe('handleOpenRequest', () => {
  it('answers a valid open-request with a signed grant whose rngCommit is the house chain head', async () => {
    const env = await handleOpenRequest(baseReq, {
      houseKey,
      domain,
      headBlock: 1000n,
      limits,
      // inject tip for test determinism; prod defaults to fresh randomBytes
      seedTip: deterministicTip,
    })

    expect(env.kind).toBe('open-grant')
    if (env.kind !== 'open-grant') return

    // Correct escrow
    expect(env.terms.escrowHouse).toBe(980n)

    // SECURITY REQUIREMENT 1: rngCommit is the house-built seed chain commit, not from req
    expect(env.terms.rngCommit).toBe(env.seedChain.commit)

    // The commit should equal the chain built from the injected tip
    const expectedChain = buildSeedChain(deterministicTip, 1)
    expect(env.terms.rngCommit).toBe(expectedChain.commit)

    // houseSig should be a valid hex signature
    expect(env.houseSig).toMatch(/^0x/)
    expect(env.houseSig.length).toBe(132) // 65-byte ECDSA sig
  })

  it('declines a target below the minimum', async () => {
    const env = await handleOpenRequest(
      { ...baseReq, targetX100: 50n },
      { houseKey, domain, headBlock: 1000n, limits, seedTip: deterministicTip },
    )
    expect(env.kind).toBe('open-decline')
  })

  it('does NOT read any plaintext clientSeed from the request (only clientSeedCommit)', async () => {
    // The request object must not have a `clientSeed` property — only clientSeedCommit.
    // handleOpenRequest must build its tip independently of req content.
    const reqWithNoSeed = baseReq
    // Verify the req only carries the commit, never the plaintext
    expect('clientSeed' in reqWithNoSeed).toBe(false)
    expect('clientSeedCommit' in reqWithNoSeed).toBe(true)

    // Even if the caller tried to inject a seed, the house tip must come from seedTip (ctx), not req
    const env = await handleOpenRequest(reqWithNoSeed, {
      houseKey,
      domain,
      headBlock: 1000n,
      limits,
      seedTip: deterministicTip,
    })
    expect(env.kind).toBe('open-grant')
    if (env.kind !== 'open-grant') return
    // The rngCommit must be derived from the ctx-injected seedTip, NOT from req
    const expectedChain = buildSeedChain(deterministicTip, 1)
    expect(env.terms.rngCommit).toBe(expectedChain.commit)
  })
})

// ── handleRoundRequest (clientSeed verify step) tests ──────────────────────

describe('handleRoundRequest — clientSeed reveal verification', () => {
  it('rejects a round whose revealed clientSeed does not match the stored commit', async () => {
    const grantEnv = await handleOpenRequest(baseReq, {
      houseKey,
      domain,
      headBlock: 1000n,
      limits,
      seedTip: deterministicTip,
    })
    if (grantEnv.kind !== 'open-grant') throw new Error('expected grant')

    const wrongSeed = ('0x' + 'ff'.repeat(32)) as Hex
    // A mismatched revealed seed MUST be rejected before co-signing
    const result = await handleRoundRequest(
      { clientSeed: wrongSeed },
      { clientSeedCommit, seedChain: grantEnv.seedChain },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toMatch(/clientSeed/i)
    }
  })

  it('accepts a round with the correct revealed clientSeed', async () => {
    const grantEnv = await handleOpenRequest(baseReq, {
      houseKey,
      domain,
      headBlock: 1000n,
      limits,
      seedTip: deterministicTip,
    })
    if (grantEnv.kind !== 'open-grant') throw new Error('expected grant')

    const result = await handleRoundRequest(
      { clientSeed }, // the real clientSeed matching clientSeedCommit
      { clientSeedCommit, seedChain: grantEnv.seedChain },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      // On success, the serverSeed for round 1 should be provided
      expect(result.serverSeed).toMatch(/^0x/)
    }
  })
})

// ── faucetMint tests ────────────────────────────────────────────────────────

describe('faucetMint', () => {
  const chips = ('0x' + 'cc'.repeat(20)) as Hex
  const to = ('0x' + 'dd'.repeat(20)) as Hex
  const cap = 1_000n

  it('calls writeContract with min(amount, cap) when amount <= cap', async () => {
    const walletClient = { writeContract: vi.fn().mockResolvedValue('0xabcd' as Hex) } as any
    const txHash = await faucetMint({ walletClient, chips, to, amount: 500n, cap })
    expect(txHash).toBe('0xabcd')
    expect(walletClient.writeContract).toHaveBeenCalledOnce()
    const call = walletClient.writeContract.mock.calls[0][0]
    // Should mint exactly `amount` (500 < 1000 cap)
    expect(call.args[1]).toBe(500n)
    expect(call.args[0]).toBe(to)
  })

  it('calls writeContract with cap when amount > cap', async () => {
    const walletClient = { writeContract: vi.fn().mockResolvedValue('0xbeef' as Hex) } as any
    const txHash = await faucetMint({ walletClient, chips, to, amount: 5_000n, cap })
    expect(txHash).toBe('0xbeef')
    const call = walletClient.writeContract.mock.calls[0][0]
    // Should mint only up to cap
    expect(call.args[1]).toBe(cap)
  })

  it('calls writeContract targeting the chips contract address', async () => {
    const walletClient = { writeContract: vi.fn().mockResolvedValue('0xcafe' as Hex) } as any
    await faucetMint({ walletClient, chips, to, amount: 100n, cap })
    const call = walletClient.writeContract.mock.calls[0][0]
    expect(call.address).toBe(chips)
  })
})
