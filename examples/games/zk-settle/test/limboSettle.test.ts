import { describe, it, expect, beforeAll } from 'vitest'
import { compileCircuit, type Compiled } from '../src/compile'
import { prove } from '../src/prove'
import { verify } from '../src/verify'
import {
  limboOutcome,
  limboSettleCommitments,
  commitmentsToPublicInputs,
  limboSettleInputs,
  type LimboSettleAmounts,
  type LimboSettleBlindings,
  type LimboSettleWitness,
} from '../src/limboSettle'

// ---------------------------------------------------------------------------
// Fixed limbo vectors (targetX100 = 500 == 5.00x), found by deterministic
// search over the REAL roundRandom + limbo.settleRound (see report). nonce
// hardcoded 1. Each vector's actual outcome at nonce 1 was VERIFIED before use
// (Track-1 once swapped win/loss seed labels):
//   WIN : serverSeed 0x..01, clientSeed 0x..02 -> u 984557, resultX100 6410
//         (>= 500) -> win, payout 5000, delta +4000
//   LOSS: serverSeed 0x..01, clientSeed 0x..01 -> u 218468, resultX100 126
//         (<  500) -> loss, payout 0, delta -1000
// ---------------------------------------------------------------------------
const TARGET = 500n
const b32 = (n: bigint) => ('0x' + n.toString(16).padStart(64, '0')) as `0x${string}`

const WIN = { serverSeed: b32(1n), clientSeed: b32(2n) }
const LOSS = { serverSeed: b32(1n), clientSeed: b32(1n) }

const STAKE = 1000n
// Open balances chosen so the house can cover the +4000 win payout and so no
// hidden amount coincidentally equals the PUBLIC targetX100 (500) — otherwise
// the "amounts stay hidden" check would flag a collision with a legitimately-
// public input rather than a real leak.
const OPEN_PLAYER = 8000n
const OPEN_HOUSE = 6000n

// Distinct blindings per amount (a real caller draws these randomly; reusing one
// across two amounts would leak their difference — see Task 3 carry-forward).
const BLINDINGS: LimboSettleBlindings = {
  stake: 111n,
  openBalancePlayer: 222n,
  openBalanceHouse: 333n,
  finalBalancePlayer: 444n,
  finalBalanceHouse: 555n,
}

/** Build the conserved amounts from the REAL outcome: final = open +/- delta. */
function conservedAmounts(serverSeed: `0x${string}`, clientSeed: `0x${string}`): LimboSettleAmounts {
  const { playerDelta } = limboOutcome(serverSeed, clientSeed, TARGET, STAKE)
  return {
    stake: STAKE,
    openBalancePlayer: OPEN_PLAYER,
    openBalanceHouse: OPEN_HOUSE,
    finalBalancePlayer: OPEN_PLAYER + playerDelta,
    finalBalanceHouse: OPEN_HOUSE - playerDelta,
  }
}

describe('limbo PRIVACY settle (Task 5): hidden amounts + conservation', () => {
  let c: Compiled
  beforeAll(async () => {
    c = await compileCircuit('test-circuits/limboSettle')
  }, 120_000)

  it('a real WIN proves+verifies; public commitments match the TS ones; amounts stay hidden', async () => {
    // VERIFY the vector's actual outcome at nonce 1 (labels-once-swapped guard).
    const outcome = limboOutcome(WIN.serverSeed, WIN.clientSeed, TARGET, STAKE)
    expect(outcome.win).toBe(true)
    expect(outcome.playerDelta).toBe(4000n)

    const amounts = conservedAmounts(WIN.serverSeed, WIN.clientSeed)
    // win delta +4000 -> finalP 12000, finalH 2000 (pot conserved)
    expect(amounts.finalBalancePlayer).toBe(12000n)
    expect(amounts.finalBalanceHouse).toBe(2000n)
    expect(amounts.finalBalancePlayer + amounts.finalBalanceHouse).toBe(
      amounts.openBalancePlayer + amounts.openBalanceHouse,
    )

    const witness: LimboSettleWitness = {
      serverSeed: WIN.serverSeed,
      clientSeed: WIN.clientSeed,
      targetX100: TARGET,
      amounts,
      blindings: BLINDINGS,
    }
    const { proof, publicInputs } = await prove(c, limboSettleInputs(witness))

    // Public inputs = rngCommit(32) + clientSeedCommit(32) + targetX100(1) +
    // 5 commitment points (x,y each = 10). The verifier sees ONLY these — never
    // an amount. The commitment fields must equal the TS-built commitments.
    const commits = await limboSettleCommitments(amounts, BLINDINGS)
    const expectedCommitInputs = commitmentsToPublicInputs(commits)
    const tail = publicInputs.slice(publicInputs.length - 10)
    expect(tail.map((h) => BigInt(h))).toEqual(expectedCommitInputs.map((h) => BigInt(h)))

    // No hidden amount appears among the public inputs.
    const pubAsBig = publicInputs.map((h) => BigInt(h))
    for (const v of [amounts.stake, amounts.openBalancePlayer, amounts.openBalanceHouse, amounts.finalBalancePlayer, amounts.finalBalanceHouse]) {
      expect(pubAsBig).not.toContain(v)
    }

    expect(await verify(c, proof, publicInputs)).toBe(true)
  }, 180_000)

  it('a real LOSS proves+verifies; payout 0; conservation holds', async () => {
    // VERIFY the vector's actual outcome at nonce 1.
    const outcome = limboOutcome(LOSS.serverSeed, LOSS.clientSeed, TARGET, STAKE)
    expect(outcome.win).toBe(false)
    expect(outcome.playerDelta).toBe(-1000n)

    const amounts = conservedAmounts(LOSS.serverSeed, LOSS.clientSeed)
    // loss delta -1000 -> finalP 7000, finalH 7000
    expect(amounts.finalBalancePlayer).toBe(7000n)
    expect(amounts.finalBalanceHouse).toBe(7000n)

    const witness: LimboSettleWitness = {
      serverSeed: LOSS.serverSeed,
      clientSeed: LOSS.clientSeed,
      targetX100: TARGET,
      amounts,
      blindings: BLINDINGS,
    }
    const { proof, publicInputs } = await prove(c, limboSettleInputs(witness))
    expect(await verify(c, proof, publicInputs)).toBe(true)
  }, 180_000)

  describe('soundness: forged witnesses FAIL to prove', () => {
    it('wrong finalBalancePlayer (not openP + delta) fails — conservation bites', async () => {
      const amounts = conservedAmounts(WIN.serverSeed, WIN.clientSeed)
      const forged: LimboSettleAmounts = { ...amounts, finalBalancePlayer: amounts.finalBalancePlayer + 1n }
      const witness: LimboSettleWitness = {
        serverSeed: WIN.serverSeed,
        clientSeed: WIN.clientSeed,
        targetX100: TARGET,
        amounts: forged,
        blindings: BLINDINGS,
      }
      await expect(prove(c, limboSettleInputs(witness))).rejects.toThrow()
    }, 180_000)

    it('wrong finalBalanceHouse (not openH - delta) fails — conservation bites', async () => {
      const amounts = conservedAmounts(LOSS.serverSeed, LOSS.clientSeed)
      const forged: LimboSettleAmounts = { ...amounts, finalBalanceHouse: amounts.finalBalanceHouse - 1n }
      const witness: LimboSettleWitness = {
        serverSeed: LOSS.serverSeed,
        clientSeed: LOSS.clientSeed,
        targetX100: TARGET,
        amounts: forged,
        blindings: BLINDINGS,
      }
      await expect(prove(c, limboSettleInputs(witness))).rejects.toThrow()
    }, 180_000)

    it('wrong serverSeed (does not match rngCommit) fails — seed bind bites', async () => {
      // WIN amounts but a different serverSeed: the circuit recomputes r from the
      // witness seeds and the conserved final balances no longer match the
      // outcome of THOSE seeds (b32(999) at nonce 1 is a LOSS, delta -1000, not
      // the WIN delta +4000 the amounts were conserved against). Conservation
      // against the new r breaks; witness generation throws.
      const amounts = conservedAmounts(WIN.serverSeed, WIN.clientSeed)
      const witness: LimboSettleWitness = {
        serverSeed: b32(999n),
        clientSeed: WIN.clientSeed,
        targetX100: TARGET,
        amounts,
        blindings: BLINDINGS,
      }
      await expect(prove(c, limboSettleInputs(witness))).rejects.toThrow()
    }, 180_000)
  })
})
