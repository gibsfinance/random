import { describe, it, expect } from 'vitest'
import {
  plinko,
  plinkoBucket,
  plinkoFairTableX100,
  plinkoEdgedX100,
  plinkoMultiplierX100,
  DEFAULT_ROWS,
  type PlinkoRisk,
} from '../src/games/plinko'

describe('plinko (deflection -> bucket -> table)', () => {
  it('default rows is 16 and tables are symmetric of length rows+1', () => {
    expect(DEFAULT_ROWS).toBe(16)
    for (const risk of ['low', 'medium', 'high'] as PlinkoRisk[]) {
      const t = plinkoFairTableX100(risk, 16)
      expect(t.length).toBe(17)
      for (let i = 0; i < t.length; i++) expect(t[i]).toBe(t[t.length - 1 - i]) // symmetric
    }
  })

  it('bucket = count of right-deflections (one bit of raw per row)', () => {
    expect(plinkoBucket(0n, 16)).toBe(0) // all left
    expect(plinkoBucket(0xffffn, 16)).toBe(16) // all 16 bits set -> all right
    expect(plinkoBucket(1n, 16)).toBe(1) // one bit
    expect(plinkoBucket(0b101n, 16)).toBe(2) // two bits set
    // bits beyond `rows` are ignored
    expect(plinkoBucket(0x1_0000n, 16)).toBe(0)
  })

  it('applies the 1% house edge to the fair multiplier (floored, hundredths)', () => {
    // low rows=16 edge bucket fair = 1600 -> 1600*9900/10000 = 1584
    expect(plinkoEdgedX100(1600n)).toBe(1584n)
    // center bucket fair = 30 -> 30*9900/10000 = 29 (floored)
    expect(plinkoEdgedX100(30n)).toBe(29n)
    expect(plinkoMultiplierX100('low', 16, 0)).toBe(1584n)
    expect(plinkoMultiplierX100('low', 16, 8)).toBe(29n)
  })

  it('settles a win at an edge bucket (mult >= 1.00x) paying stake*(mult-1)', () => {
    // raw all-right -> bucket 16; low table edge fair 1600 -> edged 1584 (15.84x)
    const r = plinko.settleRound(100n, { rows: 16, risk: 'low' }, 0xffffn)
    expect(r.win).toBe(true)
    expect(r.multiplierX100).toBe(1584n)
    expect(r.playerDelta).toBe(100n * 1584n / 100n - 100n) // 1484
  })

  it('settles a loss at the center bucket (mult < 1.00x)', () => {
    // raw=0 ... but bucket 0 is also an edge. Use a center bucket via 8 set bits (0x00ff -> bucket 8).
    const r = plinko.settleRound(100n, { rows: 16, risk: 'low' }, 0x00ffn)
    expect(plinkoBucket(0x00ffn, 16)).toBe(8)
    expect(r.win).toBe(false) // 0.29x < 1.00x
    expect(r.multiplierX100).toBe(29n)
    expect(r.playerDelta).toBe(100n * 29n / 100n - 100n) // -71
  })

  it('is deterministic for the same raw', () => {
    const a = plinko.settleRound(100n, { rows: 16, risk: 'high' }, 0x1234n)
    const b = plinko.settleRound(100n, { rows: 16, risk: 'high' }, 0x1234n)
    expect(a).toEqual(b)
  })

  it('encodeRound is deterministic and hex', () => {
    const e = plinko.encodeRound(100n, { rows: 16, risk: 'medium' }, 0x1234n)
    expect(e).toMatch(/^0x/)
    expect(plinko.encodeRound(100n, { rows: 16, risk: 'medium' }, 0x1234n)).toBe(e)
  })

  it('rejects unsupported rows / risk-table combinations', () => {
    expect(() => plinko.settleRound(100n, { rows: 0, risk: 'low' }, 1n)).toThrow()
    expect(() => plinko.settleRound(100n, { rows: 17, risk: 'low' }, 1n)).toThrow()
    // a row count with no shipped table (e.g. 8) throws via plinkoFairTableX100
    expect(() => plinko.settleRound(100n, { rows: 8, risk: 'low' }, 1n)).toThrow()
  })
})
