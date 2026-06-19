import { describe, it, expect } from 'vitest'
import { diceMaxMultiplierX100, escrowFor } from '../src/escrow'

describe('dice escrow sizing', () => {
  it('a 50% roll-under target pays ~1.98x after the 1% edge', () => {
    // fair = 100/50 = 2.00x; with EDGE_BPS=100 → 0.99 * 2.00 = 1.98x → 198 (hundredths)
    expect(diceMaxMultiplierX100({ targetX100: 5000n })).toBe(198n)
  })

  it('escrowHouse covers exactly the player win above their own stake', () => {
    const { escrowPlayer, escrowHouse } = escrowFor(1_000n, 198n)
    expect(escrowPlayer).toBe(1_000n)        // player brings their stake
    expect(escrowHouse).toBe(980n)           // 1000 * (198-100)/100 = 980
    // total locked 1980 == stake * 1.98x; on a win the player can take all of it
  })
})
