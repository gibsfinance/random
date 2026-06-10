import { describe, it, expect } from 'vitest'
import * as viem from 'viem'
import { coinflip } from '../src/index'

const params = {
  stake: viem.parseEther('1'),
  validatorSubset: [
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
    '0x3333333333333333333333333333333333333333',
  ] as viem.Hex[],
}

describe('coinflip.settle', () => {
  it('returns heads on an even seed and tails on an odd seed', () => {
    const entries = [
      { player: '0xaaa' as viem.Hex, side: 'heads' as const },
      { player: '0xbbb' as viem.Hex, side: 'tails' as const },
    ]
    expect(coinflip.settle(params, entries, viem.padHex('0x02', { size: 32 })).winner).to.equal('0xaaa')
    expect(coinflip.settle(params, entries, viem.padHex('0x03', { size: 32 })).winner).to.equal('0xbbb')
  })

  it('canArm only with one heads and one tails at equal stake', () => {
    expect(coinflip.canArm(params, [{ player: '0xaaa', side: 'heads' }])).to.equal(false)
    expect(coinflip.canArm(params, [{ player: '0xaaa', side: 'heads' }, { player: '0xbbb', side: 'tails' }])).to.equal(true)
    expect(coinflip.canArm(params, [{ player: '0xaaa', side: 'heads' }, { player: '0xbbb', side: 'heads' }])).to.equal(false)
  })

  it('parseParams rejects a subset below the minimum of three', () => {
    expect(() => coinflip.parseParams({ stake: 1n, validatorSubset: ['0x1', '0x2'] })).to.throw()
  })
})
