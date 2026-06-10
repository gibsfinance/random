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

  describe('arm and draw', () => {
    const fillRound = async (ctx: any, subset: viem.Hex[], guesses: bigint[], salts: viem.Hex[]) => {
      const players = ctx.signers.slice(1, 1 + guesses.length)
      let firstReceipt: any
      for (let i = 0; i < guesses.length; i++) {
        const receipt = await testUtils.confirmTx(ctx, ctx.raffle.write.commit(
          [stake, threshold, period, subset, commitmentFor(guesses[i], salts[i], players[i].account.address)],
          { value: stake, account: players[i].account },
        ))
        if (i === 0) firstReceipt = receipt
      }
      const opened = await ctx.raffle.getEvents.RoundOpened({}, { blockHash: firstReceipt.blockHash })
      const roundId = opened[0].args.roundId as viem.Hex
      return { roundId, players }
    }

    it('reverts arm before the period elapses', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations } = await testUtils.setUpValidators(ctx, ctx.raffle, 3)
      const { roundId } = await fillRound(ctx, subset, [1n, 2n, 3n], ['0x01', '0x02', '0x03'].map((s) => viem.padHex(s as viem.Hex, { size: 32 })))
      await expectations.revertedWithCustomError(
        ctx.raffle,
        ctx.raffle.write.arm([roundId, locations]),
        'PeriodNotElapsed',
      )
    })

    it('reverts arm below the threshold', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations } = await testUtils.setUpValidators(ctx, ctx.raffle, 3)
      const { roundId } = await fillRound(ctx, subset, [1n, 2n], ['0x01', '0x02'].map((s) => viem.padHex(s as viem.Hex, { size: 32 })))
      await helpers.mine(6)
      await expectations.revertedWithCustomError(
        ctx.raffle,
        ctx.raffle.write.arm([roundId, locations]),
        'ThresholdNotMet',
      )
    })

    it('arms a filled round, casts, and records a draw in [1..256] without paying', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations, secrets } = await testUtils.setUpValidators(ctx, ctx.raffle, 3)
      const salts = ['0x01', '0x02', '0x03'].map((s) => viem.padHex(s as viem.Hex, { size: 32 }))
      const { roundId } = await fillRound(ctx, subset, [1n, 2n, 3n], salts)
      await helpers.mine(6)
      const armReceipt = await testUtils.confirmTx(ctx, ctx.raffle.write.arm([roundId, locations]))
      const key = (await ctx.raffle.getEvents.Armed({}, { blockHash: armReceipt.blockHash }))[0].args.key as viem.Hex
      const publicClient = await ctx.hre.viem.getPublicClient()
      const potBefore = await publicClient.getBalance({ address: ctx.raffle.address })
      const castReceipt = await testUtils.confirmTx(ctx, ctx.random.write.cast([key, locations, secrets]))
      const drawn = await ctx.raffle.getEvents.Drawn({}, { blockHash: castReceipt.blockHash })
      expect(drawn.length).to.equal(1)
      const draw = drawn[0].args.draw as bigint
      expect(draw).to.be.greaterThanOrEqual(1n)
      expect(draw).to.be.lessThanOrEqual(RANGE)
      // no payout on draw
      expect(await publicClient.getBalance({ address: ctx.raffle.address })).to.equal(potBefore)
    })
  })
})
