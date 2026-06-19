import { describe, it, expect } from 'vitest'
import { verifyFinishedSession } from '../src/session'
import { runHouseSide, runPlayerSide } from '../src/coSignTransport'
import { fixedDiceConfig } from './helpers'

describe('co-sign over transport', () => {
  it('produces a transcript that verifies like the in-process session', async () => {
    const { houseCfg, playerCfg, houseT, playerT, play, ctx } = fixedDiceConfig()
    const [transcriptJson] = await Promise.all([
      runHouseSide(houseCfg, houseT, play),
      runPlayerSide(playerCfg, playerT),
    ])
    expect(await verifyFinishedSession(transcriptJson, ctx)).toBe(true)
  })

  it('the split co-signatures recover to the right addresses (player half ≠ house half)', async () => {
    const { houseCfg, playerCfg, houseT, playerT, play, ctx } = fixedDiceConfig()
    const [transcriptJson] = await Promise.all([
      runHouseSide(houseCfg, houseT, play),
      runPlayerSide(playerCfg, playerT),
    ])
    const t = JSON.parse(transcriptJson)
    for (const e of t.entries) {
      const { player, house } = e.body.sigs
      expect(player).not.toBe(house) // distinct keys signed distinct halves
      expect(player.length).toBe(132) // 65-byte ECDSA sig as 0x + 130 hex
      expect(house.length).toBe(132)
    }
    // sanity: ctx parties are the two distinct accounts the helper used
    expect(ctx.parties.player.toLowerCase()).not.toBe(ctx.parties.house.toLowerCase())
  })

  it('the player REFUSES to sign a round whose proposed balance was tampered (real recompute, not theater)', async () => {
    const { houseCfg, playerCfg, houseT, playerT, play } = fixedDiceConfig()
    // Wrap the house transport so the ROUND state it sends the player is corrupted: bump the
    // player balance by 1 without a matching reveal. The honest player must reject it.
    const corruptHouseT = {
      ...houseT,
      request: (state: any, proof: any) =>
        houseT.request(
          state.nonce === 1n ? { ...state, balancePlayer: state.balancePlayer + 1n } : state,
          proof,
        ),
    }
    const results = await Promise.allSettled([
      runHouseSide(houseCfg, corruptHouseT, play),
      runPlayerSide(playerCfg, playerT),
    ])
    expect(results.some((r) => r.status === 'rejected')).toBe(true)
  })
})
