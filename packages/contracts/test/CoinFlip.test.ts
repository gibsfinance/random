import * as viem from 'viem'
import { expect } from 'chai'
import * as helpers from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import * as expectations from './expectations'
import * as testUtils from './utils'

describe('CoinFlip', () => {
  describe('enter', () => {
    it('escrows the stake and records an active entry', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const [player] = ctx.signers
      const stake = viem.parseEther('1')
      const preimage = viem.keccak256(viem.toHex('secret-a'))
      const hash = await ctx.coinFlip.write.enter([0, preimage], { value: stake, account: player.account })
      await testUtils.confirmTx(ctx, hash)
      const publicClient = await ctx.hre.viem.getPublicClient()
      const balance = await publicClient.getBalance({ address: ctx.coinFlip.address })
      expect(balance).to.equal(stake)
      const entry = await ctx.coinFlip.read.entries([1n])
      // tuple order: [player, side, stake, preimage, enteredAtBlock, active]
      expect(entry[2]).to.equal(stake)
      expect(entry[5]).to.equal(true)
    })

    it('rejects a zero stake', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.enter([0, viem.zeroHash], { value: 0n }),
        'ZeroStake',
      )
    })

    it('rejects an invalid side', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const stake = viem.parseEther('1')
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.enter([2, viem.zeroHash], { value: stake }),
        'WrongSide',
      )
    })
  })

  describe('matching', () => {
    it('queues same-side entrants and pairs the first opposite-side entrant', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const [a, b, c] = ctx.signers
      const stake = viem.parseEther('1')
      // two heads, no tails -> both queue, none paired
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enter([0, viem.keccak256(viem.toHex('a'))], { value: stake, account: a.account }))
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enter([0, viem.keccak256(viem.toHex('b'))], { value: stake, account: b.account }))
      const noPair = await ctx.coinFlip.getEvents.Paired()
      expect(noPair.length).to.equal(0)
      // first tails pairs with the oldest heads (entry 1 = a)
      await expectations.emit(ctx,
        ctx.coinFlip.write.enter([1, viem.keccak256(viem.toHex('c'))], { value: stake, account: c.account }),
        ctx.coinFlip, 'Paired', { heads: viem.getAddress(a.account!.address) })
    })

    it('does not match across different stakes', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const [a, b] = ctx.signers
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enter([0, viem.keccak256(viem.toHex('a'))], { value: viem.parseEther('1'), account: a.account }))
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enter([1, viem.keccak256(viem.toHex('b'))], { value: viem.parseEther('2'), account: b.account }))
      expect((await ctx.coinFlip.getEvents.Paired()).length).to.equal(0)
    })
  })
})
