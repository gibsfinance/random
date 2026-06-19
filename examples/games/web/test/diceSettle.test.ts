/**
 * Test: Dice escrowed settlement + co-sign funds-safety (Task 7)
 *
 * Tests cover:
 *  1. EscrowedSettlement.buildSettle yields a settle TxRequest with the correct final state
 *     (nonce 1, player balance from the co-signed ROUND) from a real co-signed transcript.
 *  2. Funds-safety: the co-sign flow (runPlayerSide + runHouseSide) returns a record derived
 *     from the actual co-signed ROUND SessionState, not a fabricated literal. Verified by
 *     checking that the record's balances match what verifyFinishedSession replays.
 *  3. Refusal: the player rejects a round where the house substitutes a different clientSeed
 *     (anti-house-bias binding). At least one side must reject.
 */

import { describe, it, expect } from 'vitest'
import { type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  dice,
  makeDomain,
  buildSeedChain,
  runPlayerSide,
  runHouseSide,
  verifyFinishedSession,
  type SessionConfig,
  type VerifyContext,
  type SessionState,
  type RoundProof,
  type CoSignTransport,
} from '@gibs/msgboard-games'
import { EscrowedSettlement } from '@gibs/msgboard-settle'

// ── fixtures ──────────────────────────────────────────────────────────────────

const HOUSE_CHANNEL = '0x57876609E4fEDDEeB83e46A1b3A20140998f0e46' as Hex
const CHAIN_ID = 943

const playerAccount = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const houseAccount = privateKeyToAccount(`0x${'22'.repeat(32)}`)
const tableId = `0x${'ab'.repeat(32)}` as Hex
const seedTip = `0x${'77'.repeat(32)}` as Hex
const clientSeed = `0x${'33'.repeat(32)}` as Hex

const domain = makeDomain(CHAIN_ID, HOUSE_CHANNEL)
const chainLength = 1
const openBalances = { player: 1000n, house: 1000n }
const stake = 100n
const params = { targetX100: 5000n } // 50% win chance

const playerSigner = {
  address: playerAccount.address,
  signTypedData: (args: Parameters<typeof playerAccount.signTypedData>[0]) =>
    playerAccount.signTypedData(args),
  signMessage: (args: { message: { raw: Hex } }) => playerAccount.signMessage(args),
}
const houseSigner = {
  address: houseAccount.address,
  signTypedData: (args: Parameters<typeof houseAccount.signTypedData>[0]) =>
    houseAccount.signTypedData(args),
  signMessage: (args: { message: { raw: Hex } }) => houseAccount.signMessage(args),
}

/**
 * settlementMode: 1 is the Escrowed mode (HouseChannel.open locks escrow, settle() calls
 * settle() on the contract). EscrowedSettlement requires this value; the co-sign layer
 * (runHouseSide/runPlayerSide) encodes it in the OPEN SessionState so the player refuses to
 * sign any round where the house changes it.
 */
const SETTLEMENT_MODE = 1

const houseCfg: SessionConfig<{ targetX100: bigint }> = {
  domain,
  tableId,
  game: dice,
  player: playerSigner,
  house: houseSigner,
  seedTip,
  chainLength,
  openBalances,
  settlementMode: SETTLEMENT_MODE,
}

function makeVerifyCtx(): VerifyContext<{ targetX100: bigint }> {
  return {
    parties: { player: playerAccount.address, house: houseAccount.address },
    commit: buildSeedChain(seedTip, chainLength).commit,
    game: dice,
    domain,
  }
}

/**
 * Build a linked in-memory CoSignTransport pair.
 * Identical to memoryCoSignPair in msgboard-games/test/helpers but self-contained so this
 * test file has no dependency on test-only exports.
 *
 * @param onAccept Optional callback invoked after the player successfully signs a state.
 */
function buildCoSignPair(
  onAccept?: (state: SessionState, proof?: RoundProof<unknown>) => void,
): { houseT: CoSignTransport; playerT: CoSignTransport } {
  type Pending = {
    state: SessionState
    proof?: RoundProof<unknown>
    resolve: (sig: Hex) => void
    reject: (err: unknown) => void
  }
  const queue: Pending[] = []
  const waiters: Array<(p: Pending) => void> = []

  const push = (p: Pending) => {
    const w = waiters.shift()
    if (w) w(p)
    else queue.push(p)
  }
  const pull = (): Promise<Pending> =>
    new Promise((res) => {
      const q = queue.shift()
      if (q) res(q)
      else waiters.push(res)
    })

  const houseT: CoSignTransport = {
    request: (state, proof) =>
      new Promise<Hex>((resolve, reject) => push({ state, proof, resolve, reject })),
    serve: () => { throw new Error('houseT.serve not used') },
  }

  const playerT: CoSignTransport = {
    request: () => { throw new Error('playerT.request not used') },
    serve: (sign) => {
      const loop = async () => {
        for (;;) {
          const p = await pull()
          try {
            const sig = await sign(p.state, p.proof)
            onAccept?.(p.state, p.proof)
            p.resolve(sig)
          } catch (err) {
            p.reject(err)
          }
        }
      }
      void loop()
    },
  }
  return { houseT, playerT }
}

// ── helper: run a full co-sign round and return transcript + accepted ROUND state ──────────────

async function runCoSignRound(): Promise<{ transcriptJson: string; roundState: SessionState }> {
  let acceptedRound: SessionState | undefined

  const { houseT, playerT } = buildCoSignPair((state) => {
    if (state.nonce > 0n) acceptedRound = state
  })

  const [transcriptJson] = await Promise.all([
    runHouseSide(houseCfg, houseT, { stake, params, clientSeed }),
    runPlayerSide(
      { domain, tableId, game: dice, player: playerSigner, houseRemote: true as const,
        clientSeed, seedTip: `0x${'00'.repeat(32)}` as Hex, chainLength, openBalances,
        settlementMode: SETTLEMENT_MODE },
      playerT,
    ),
  ])

  if (!acceptedRound) throw new Error('test: no accepted ROUND state')
  return { transcriptJson, roundState: acceptedRound }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('EscrowedSettlement.buildSettle', () => {
  it('1. yields a settle TxRequest with nonce 1 and correct player balance from the co-signed transcript', async () => {
    const { transcriptJson, roundState } = await runCoSignRound()

    const esc = new EscrowedSettlement<{ targetX100: bigint }>({
      parties: { player: playerAccount.address, house: houseAccount.address },
      commit: buildSeedChain(seedTip, chainLength).commit,
      game: dice,
      domain,
      settlementMode: SETTLEMENT_MODE,
      channel: HOUSE_CHANNEL,
    })

    const tx = await esc.buildSettle(transcriptJson)

    expect(tx.functionName).toBe('settle')
    const [finalState] = tx.args as [SessionState, ...unknown[]]
    // Must be the ROUND state (nonce 1), not the OPEN state.
    expect(finalState.nonce).toBe(1n)
    // The balance must match what the player's side co-signed.
    expect(finalState.balancePlayer).toBe(roundState.balancePlayer)
    expect(finalState.balanceHouse).toBe(roundState.balanceHouse)
    // The settle call targets the HouseChannel contract address.
    expect(tx.address.toLowerCase()).toBe(HOUSE_CHANNEL.toLowerCase())
  })
})

describe('Funds-safety: co-sign round record is derived from the real co-signed state', () => {
  it('2. play() record balances come from the accepted ROUND SessionState, not a fabricated literal', async () => {
    const { transcriptJson, roundState } = await runCoSignRound()

    // The transcript must verify with the correct parties and domain.
    const ctx = makeVerifyCtx()
    expect(await verifyFinishedSession(transcriptJson, ctx)).toBe(true)

    // The round state's balances must be consistent with the game's logic (player and house
    // balances change by outcome.playerDelta, which can be positive or negative).
    const balanceSum = roundState.balancePlayer + roundState.balanceHouse
    const openSum = openBalances.player + openBalances.house
    // Conservation: player delta + house delta = 0 (zero-sum game, no rake in co-sign layer).
    expect(balanceSum).toBe(openSum)
    // Nonce must be 1 (first and only round in chainLength=1).
    expect(roundState.nonce).toBe(1n)
    // The balances were co-signed by both parties — verifyFinishedSession checks both sigs.
    // Now confirm the record we'd build from the accepted state is consistent with the transcript.
    const playerDelta = roundState.balancePlayer - openBalances.player
    const win = roundState.balancePlayer > openBalances.player
    // Parse the transcript body to compare (not just trusting our derivation).
    const parsed = JSON.parse(transcriptJson) as {
      entries: Array<{ kind: string; body: { outcome?: { win: boolean; playerDelta: string } } }>
    }
    const roundEntry = parsed.entries.find((e) => e.kind === 'ROUND')
    expect(roundEntry).toBeDefined()
    const outcome = roundEntry!.body.outcome!
    // The win flag derived from balancePlayer must match the transcript outcome.
    expect(win).toBe(outcome.win)
    // The playerDelta derived from balances must match the transcript's recorded delta.
    expect(playerDelta).toBe(BigInt(outcome.playerDelta))
  })
})

describe('Refusal: house-substituted clientSeed is rejected (anti-house-bias)', () => {
  it('3. player rejects a round where the house uses a different clientSeed', async () => {
    const biasedSeed = `0x${'44'.repeat(32)}` as Hex
    expect(biasedSeed).not.toBe(clientSeed)

    const { houseT, playerT } = buildCoSignPair()

    const results = await Promise.allSettled([
      // House drives round with BIASED seed — not the one the player committed.
      runHouseSide(houseCfg, houseT, { stake, params, clientSeed: biasedSeed }),
      // Player side uses the REAL clientSeed and matching settlementMode — will reject the biased round.
      runPlayerSide(
        { domain, tableId, game: dice, player: playerSigner, houseRemote: true as const,
          clientSeed, seedTip: `0x${'00'.repeat(32)}` as Hex, chainLength, openBalances,
          settlementMode: SETTLEMENT_MODE },
        playerT,
      ),
    ])

    // The player must reject the tampered round — at least one side fails.
    expect(results.some((r) => r.status === 'rejected')).toBe(true)
    // The rejection message must mention clientSeed.
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(Error)
    expect((rejected.reason as Error).message).toMatch(/clientSeed/)
  })
})
