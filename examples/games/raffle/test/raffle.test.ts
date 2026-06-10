import { describe, it, expect } from 'vitest'
import * as viem from 'viem'
import { raffle } from '../src/index'
import { raffleDraw } from '@gibs/games-core'

const params = {
  stake: viem.parseEther('1'),
  threshold: 3n,
  period: 5n,
  validatorSubset: [
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
    '0x3333333333333333333333333333333333333333',
  ] as viem.Hex[],
}

const ticket = (ticketId: bigint, player: viem.Hex, guess: bigint, committedAtBlock: bigint, revealed = true) =>
  ({ ticketId, player, guess, committedAtBlock, revealed })

describe('raffle.settle', () => {
  it('picks the revealed guess closest to the draw', () => {
    const seed = viem.padHex('0x80', { size: 32 }) // draw = 1 + (128 mod 256) = 129
    const draw = raffleDraw(seed)
    expect(draw).to.equal(129n)
    const entries = [ticket(1n, '0xaaa', 10n, 1n), ticket(2n, '0xbbb', 130n, 1n), ticket(3n, '0xccc', 250n, 1n)]
    expect(raffle.settle(params, entries, seed)?.ticketId).to.equal(2n)
  })

  it('breaks an equidistant tie by earliest commit then ticket id', () => {
    const seed = viem.padHex('0x80', { size: 32 }) // draw 129
    // 128 and 130 are both distance 1; earliest committedAtBlock wins
    const entries = [ticket(5n, '0xaaa', 130n, 9n), ticket(6n, '0xbbb', 128n, 7n)]
    expect(raffle.settle(params, entries, seed)?.ticketId).to.equal(6n)
    // same block -> smallest ticket id wins
    const sameBlock = [ticket(9n, '0xaaa', 130n, 4n), ticket(8n, '0xbbb', 128n, 4n)]
    expect(raffle.settle(params, sameBlock, seed)?.ticketId).to.equal(8n)
  })

  it('ignores unrevealed entries and returns null on a no-contest', () => {
    const seed = viem.padHex('0x80', { size: 32 })
    const entries = [ticket(1n, '0xaaa', 10n, 1n, false)]
    expect(raffle.settle(params, entries, seed)).to.equal(null)
  })
})
