import * as viem from 'viem'
import { expect } from 'chai'
import * as helpers from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import * as expectations from './expectations'
import * as testUtils from './utils'

const RANGE = 256n

const commitmentFor = (guess: bigint, salt: viem.Hex, player: viem.Hex): viem.Hex =>
  viem.keccak256(viem.encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes32' }, { type: 'address' }], [guess, salt, player]))

describe('Raffle', () => {
  const stake = viem.parseEther('1')
  const threshold = 3n
  const period = 5n

  describe('commit and cancel', () => {
    it('opens a round on the first commit and escrows the stake', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset } = await testUtils.setUpValidators(ctx, ctx.raffle, 3)
      const [, p] = ctx.signers
      const salt = viem.keccak256(viem.toHex('salt-1'))
      const commitment = commitmentFor(7n, salt, p.account.address)
      await expectations.emit(ctx,
        ctx.raffle.write.commit([stake, threshold, period, subset, commitment], { value: stake, account: p.account }),
        ctx.raffle, 'RoundOpened',
      )
      const publicClient = await ctx.hre.viem.getPublicClient()
      expect(await publicClient.getBalance({ address: ctx.raffle.address })).to.equal(stake)
    })

    it('concentrates commits of the same tuple into one round', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset } = await testUtils.setUpValidators(ctx, ctx.raffle, 3)
      const [, a, b] = ctx.signers
      const first = await testUtils.confirmTx(ctx, ctx.raffle.write.commit([stake, threshold, period, subset, commitmentFor(1n, viem.keccak256(viem.toHex('sa')), a.account.address)], { value: stake, account: a.account }))
      const opened = await ctx.raffle.getEvents.RoundOpened({}, { blockHash: first.blockHash })
      expect(opened.length).to.equal(1) // first commit opens exactly one round
      const roundId = opened[0].args.roundId as viem.Hex
      const second = await testUtils.confirmTx(ctx, ctx.raffle.write.commit([stake, threshold, period, subset, commitmentFor(2n, viem.keccak256(viem.toHex('sb')), b.account.address)], { value: stake, account: b.account }))
      expect((await ctx.raffle.getEvents.RoundOpened({}, { blockHash: second.blockHash })).length).to.equal(0) // no new round
      const round = await ctx.raffle.read.rounds([roundId])
      // tuple order matches the Round struct; commitCount is field index 5
      expect(round[5]).to.equal(2n)
    })

    it('cancels a waiting ticket and refunds the stake', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset } = await testUtils.setUpValidators(ctx, ctx.raffle, 3)
      const [, p] = ctx.signers
      await testUtils.confirmTx(ctx, ctx.raffle.write.commit([stake, threshold, period, subset, commitmentFor(7n, viem.keccak256(viem.toHex('s')), p.account.address)], { value: stake, account: p.account }))
      await expectations.changeEtherBalances(ctx,
        ctx.raffle.write.cancel([1n], { account: p.account }),
        [p.account.address],
        [stake],
      )
    })

    it('rejects a cancel from a non-owner of the ticket', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset } = await testUtils.setUpValidators(ctx, ctx.raffle, 3)
      const [, p, other] = ctx.signers
      await testUtils.confirmTx(ctx, ctx.raffle.write.commit([stake, threshold, period, subset, commitmentFor(7n, viem.keccak256(viem.toHex('s')), p.account.address)], { value: stake, account: p.account }))
      await expectations.revertedWithCustomError(
        ctx.raffle,
        ctx.raffle.write.cancel([1n], { account: other.account }),
        'NotTicketOwner',
      )
    })
  })
})
