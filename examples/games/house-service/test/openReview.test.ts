import { describe, it, expect } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { makeSettleDomain, verifyOpenTermsSig } from '@gibs/msgboard-settle'
import { reviewOpen } from '../src/openReview'

const HOUSE = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const houseKey = { signTypedData: (a: any) => HOUSE.signTypedData(a), signMessage: (a: any) => HOUSE.signMessage(a) } as any
const domain = makeSettleDomain(943, '0x57876609E4fEDDEeB83e46A1b3A20140998f0e46')
const limits = { maxEscrowHouse: 10n ** 24n, minTargetX100: 100n, clockBlocks: 120n, expiryBlocks: 300n }
const baseReq = {
  tableId: ('0x' + '11'.repeat(32)) as `0x${string}`,
  player: '0x000000000000000000000000000000000000dEaD' as `0x${string}`,
  playerKey: '0x000000000000000000000000000000000000bEEF' as `0x${string}`,
  gameId: 0, targetX100: 5000n, stake: 1_000n,
  rngCommit: ('0x' + '22'.repeat(32)) as `0x${string}`,
  clientSeed: ('0x' + '33'.repeat(32)) as `0x${string}`,
}

describe('reviewOpen', () => {
  it('grants in-band terms the player can verify against the house key', async () => {
    const r = await reviewOpen(baseReq, { houseKey, domain, headBlock: 1000n, limits })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.terms.escrowPlayer).toBe(1_000n)
    expect(r.terms.escrowHouse).toBe(980n)
    expect(r.terms.gameId).toBe(0)
    expect(await verifyOpenTermsSig(HOUSE.address, domain, r.terms, r.houseSig)).toBe(true)
  })

  it('declines a target below the min (escrow would blow the cap)', async () => {
    const r = await reviewOpen({ ...baseReq, targetX100: 1n, stake: 10n ** 21n }, { houseKey, domain, headBlock: 1000n, limits })
    expect(r.ok).toBe(false)
  })
})
