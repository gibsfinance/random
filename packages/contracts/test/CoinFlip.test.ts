import * as viem from 'viem'
import { expect } from 'chai'
import * as helpers from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import * as expectations from './expectations'
import * as testUtils from './utils'
import { contractName } from '../lib/utils'

describe('CoinFlip', () => {
  describe('enter', () => {
    it('escrows the stake and records an active entry', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [player] = ctx.signers
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: player.account }))
      const publicClient = await ctx.hre.viem.getPublicClient()
      expect(await publicClient.getBalance({ address: ctx.coinFlip.address })).to.equal(stake)
      const entry = await ctx.coinFlip.read.entries([1n])
      // tuple order: [player, side, stake, subsetHash, enteredAtBlock, active]
      expect(entry[2]).to.equal(stake)
      expect(entry[5]).to.equal(true)
    })

    it('rejects a zero stake', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: 0n }),
        'ZeroStake',
      )
    })

    it('rejects an invalid side', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.enterAndMatch([2, subset, []], { value: viem.parseEther('1') }),
        'WrongSide',
      )
    })

    it('rejects an unvalidatable subset', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.enterAndMatch([0, [ctx.signers[9]!.account.address], []], { value: viem.parseEther('1') }),
        'BadSubset',
      )
    })
  })

  describe('matching', () => {
    it('queues same-side entrants and pairs the first opposite-side entrant on the same subset', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [a, b, c] = ctx.signers
      const stake = viem.parseEther('1')
      // two heads, no tails -> both queue, none paired
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: a.account }))
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: b.account }))
      expect((await ctx.coinFlip.getEvents.Paired()).length).to.equal(0)
      // first tails pairs with the oldest heads (entry 1 = a)
      await expectations.emit(ctx,
        ctx.coinFlip.write.enterAndMatch([1, subset, locations], { value: stake, account: c!.account }),
        ctx.coinFlip, 'Paired', { heads: viem.getAddress(a!.account!.address) })
    })

    it('does not match across different stakes', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [a, b] = ctx.signers
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: viem.parseEther('1'), account: a.account }))
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, subset, []], { value: viem.parseEther('2'), account: b.account }))
      expect((await ctx.coinFlip.getEvents.Paired()).length).to.equal(0)
    })

    it('does not match across different validator subsets', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      // setUpValidators allowlists validators on coinFlip and inks their preimages
      const { subset: subsetA } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const { subset: subsetB } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 4)
      const [a, b] = ctx.signers
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subsetA, []], { value: stake, account: a.account }))
      // subsetB differs from subsetA -> different subsetHash -> no match
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, subsetB, []], { value: stake, account: b.account }))
      expect((await ctx.coinFlip.getEvents.Paired()).length).to.equal(0)
    })

    it('heats validators and records a key on pairing', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [a, b] = ctx.signers
      const stake = viem.parseEther('1')
      // first entrant has no opposite-side match yet -> queues, no heat
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: a.account }))
      // second entrant completes the pair -> heats with the validator subset
      await expectations.emit(ctx,
        ctx.coinFlip.write.enterAndMatch([1, subset, locations], { value: stake, account: b.account }),
        ctx.random, 'Start')
    })
  })

  describe('queue tombstone scan cap', () => {
    it('skips up to MAX_QUEUE_SCAN cancelled entries and still matches an active one', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const stake = viem.parseEther('1')
      // fill the queue with cancelled heads entries (tombstones)
      for (let i = 0; i < 5; i++) {
        const signer = ctx.signers[i]!
        await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: signer.account }))
        await testUtils.confirmTx(ctx, ctx.coinFlip.write.cancel([BigInt(i + 1)], { account: signer.account }))
      }
      // add one live heads entry at the end of the queue
      const live = ctx.signers[5]!
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: live.account }))
      // a tails entrant should scan past tombstones and pair with the live one
      const matcher = ctx.signers[6]!
      await expectations.emit(ctx,
        ctx.coinFlip.write.enterAndMatch([1, subset, locations], { value: stake, account: matcher.account }),
        ctx.coinFlip, 'Paired')
    })
  })

  describe('recovery', () => {
    it('lets an unmatched entrant cancel for a refund', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [a] = ctx.signers
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: a.account }))
      const publicClient = await ctx.hre.viem.getPublicClient()
      expect(await publicClient.getBalance({ address: ctx.coinFlip.address })).to.equal(stake)
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.cancel([1n], { account: a.account }))
      expect(await publicClient.getBalance({ address: ctx.coinFlip.address })).to.equal(0n)
    })

    it('rejects cancel from a non-owner', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [a, b] = ctx.signers
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: a.account }))
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.cancel([1n], { account: b.account }),
        'NotEntrant',
      )
    })

    it('refunds both players when a paired flip goes stale', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [, heads, tails] = ctx.signers
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: heads.account }))
      const matchReceipt = await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, subset, locations], { value: stake, account: tails.account }))
      const flipId = (await ctx.coinFlip.getEvents.Paired({}, { blockHash: matchReceipt.blockHash }))[0]!.args.flipId as viem.Hex
      await helpers.mine(201)
      await expectations.changeEtherBalances(ctx, ctx.coinFlip.write.refundStale([flipId]), [heads!.account.address, tails!.account.address], [stake, stake])
    })

    it('rejects refundStale before the timeout window', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [a, b] = ctx.signers
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: a.account }))
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, subset, locations], { value: stake, account: b.account }))
      const [paired] = await ctx.coinFlip.getEvents.Paired()
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.refundStale([paired!.args.flipId!]),
        'TooEarly',
      )
    })
  })

  describe('settlement', () => {
    it('pays the parity-selected winner via onCast after a real cast', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations, secrets } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [, heads, tails] = ctx.signers
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: heads.account }))
      const matchReceipt = await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, subset, locations], { value: stake, account: tails.account }))
      const heated = (await ctx.coinFlip.getEvents.Heated({}, { blockHash: matchReceipt.blockHash }))[0]!
      const key = heated.args.key as viem.Hex
      await testUtils.confirmTx(ctx, ctx.random.write.cast([key, locations, secrets]))
      const settled = await ctx.coinFlip.getEvents.Settled()
      expect(settled.length).to.equal(1)
      const seed = (await ctx.random.read.randomness([key])).seed as viem.Hex
      const expectedWinner = (BigInt(seed) & 1n) === 0n ? heads!.account.address : tails!.account.address
      expect(viem.getAddress(settled[0]!.args.winner as viem.Hex)).to.equal(viem.getAddress(expectedWinner))
    })

    it('pays the whole pot to the winner and leaves no dust', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations, secrets } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [, heads, tails] = ctx.signers
      const caster = ctx.signers[5]!
      const stake = viem.parseEther('1')
      const publicClient = await ctx.hre.viem.getPublicClient()
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: heads.account }))
      const matchReceipt = await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, subset, locations], { value: stake, account: tails.account }))
      expect(await publicClient.getBalance({ address: ctx.coinFlip.address })).to.equal(stake * 2n)
      const heated = (await ctx.coinFlip.getEvents.Heated({}, { blockHash: matchReceipt.blockHash }))[0]!
      const key = heated.args.key as viem.Hex
      const before = {
        heads: await publicClient.getBalance({ address: heads!.account.address }),
        tails: await publicClient.getBalance({ address: tails!.account.address }),
      }
      await testUtils.confirmTx(ctx, ctx.random.write.cast([key, locations, secrets], { account: caster.account }))
      const seed = (await ctx.random.read.randomness([key])).seed as viem.Hex
      const winnerIsHeads = (BigInt(seed) & 1n) === 0n
      const winnerAddr = winnerIsHeads ? heads!.account.address : tails!.account.address
      const after = await publicClient.getBalance({ address: winnerAddr })
      expect(after - (winnerIsHeads ? before.heads : before.tails)).to.equal(stake * 2n)
      // whole pot left, no residue
      expect(await publicClient.getBalance({ address: ctx.coinFlip.address })).to.equal(0n)
    })

    it('refundStale returns both stakes when no cast happens before the timeout', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [, heads, tails] = ctx.signers
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: heads.account }))
      const matchReceipt = await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, subset, locations], { value: stake, account: tails.account }))
      const flipId = (await ctx.coinFlip.getEvents.Paired({}, { blockHash: matchReceipt.blockHash }))[0]!.args.flipId as viem.Hex
      await helpers.mine(201)
      await expectations.changeEtherBalances(ctx, ctx.coinFlip.write.refundStale([flipId]), [heads!.account.address, tails!.account.address], [stake, stake])
    })
  })

  // A flip taken to a finalized seed (cast) and a flip taken to staleness (refundStale) must each
  // be terminal: no second settlement, no double pay. These exercise the shared _settle/claim guard.
  describe('double-resolution guards', () => {
    const settleFlip = async (ctx: testUtils.Context) => {
      const { subset, locations, secrets } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [a, b] = ctx.signers
      const caster = ctx.signers[5]!
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: a.account }))
      const matchReceipt = await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, subset, locations], { value: stake, account: b.account }))
      const heated = (await ctx.coinFlip.getEvents.Heated({}, { blockHash: matchReceipt.blockHash }))[0]!
      const key = heated.args.key as viem.Hex
      const [paired] = await ctx.coinFlip.getEvents.Paired({}, { blockHash: matchReceipt.blockHash })
      const flipId = paired!.args.flipId!
      await testUtils.confirmTx(ctx, ctx.random.write.cast([key, locations, secrets], { account: caster.account }))
      return { flipId, stake, key, locations, secrets }
    }

    it('rejects claim on a flip already settled via onCast', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { flipId } = await settleFlip(ctx)
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.claim([flipId]),
        'AlreadyResolved',
      )
    })

    it('rejects cancel of an entry consumed by a pair', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [a, b] = ctx.signers
      const stake = viem.parseEther('1')
      // entry 1 (heads) queues, entry 2 (tails) completes the pair -> entry 1 is consumed/inactive
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: a.account }))
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, subset, locations], { value: stake, account: b.account }))
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.cancel([1n], { account: a.account }),
        'AlreadyResolved',
      )
    })

    it('rejects refundStale on an already-settled flip', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { flipId } = await settleFlip(ctx)
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.refundStale([flipId]),
        'AlreadyResolved',
      )
    })

    it('rejects claim on a flip already refunded as stale (no double pay)', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [a, b] = ctx.signers
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: a.account }))
      const matchReceipt = await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, subset, locations], { value: stake, account: b.account }))
      const [paired] = await ctx.coinFlip.getEvents.Paired({}, { blockHash: matchReceipt.blockHash })
      const flipId = paired!.args.flipId!
      await helpers.mine(201)
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.refundStale([flipId]))
      // status is Refunded (not Pending) -> claim must revert AlreadyResolved
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.claim([flipId]),
        'AlreadyResolved',
      )
    })
  })

  describe('claim fallback (onCast push failed)', () => {
    it('reverts TooEarly when the seed is not finalized', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [a, b] = ctx.signers
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: a.account }))
      const matchReceipt = await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, subset, locations], { value: stake, account: b.account }))
      const [paired] = await ctx.coinFlip.getEvents.Paired({}, { blockHash: matchReceipt.blockHash })
      // paired but never cast -> seed is zero -> claim must revert TooEarly
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.claim([paired!.args.flipId!]),
        'TooEarly',
      )
    })

    it('pays the winner 2*stake after a failed onCast push, leaving no dust', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations, secrets } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const caster = ctx.signers[5]!
      const funder = ctx.signers[6]!
      const stake = viem.parseEther('1')
      const publicClient = await ctx.hre.viem.getPublicClient()

      // A contract that rejects ETH while reject==true. It enters BOTH sides so it is the winner
      // regardless of seed parity; the onCast push to it then fails -> flip stays Pending with the
      // seed finalized -> after flipping reject off, claim pays it.
      const receiver = await ctx.hre.viem.deployContract(contractName.RejectableReceiver as any, [])
      await testUtils.confirmTx(ctx,
        receiver.write.enter([ctx.coinFlip.address, 0, subset, []], { value: stake, account: funder.account }))
      const matchReceipt = await testUtils.confirmTx(ctx,
        receiver.write.enter([ctx.coinFlip.address, 1, subset, locations], { value: stake, account: funder.account }))

      const heated = (await ctx.coinFlip.getEvents.Heated({}, { blockHash: matchReceipt.blockHash }))[0]!
      const key = heated.args.key as viem.Hex
      const [paired] = await ctx.coinFlip.getEvents.Paired({}, { blockHash: matchReceipt.blockHash })
      const flipId = paired!.args.flipId!

      // cast finalizes the seed; the onCast push to the receiver reverts and Random emits
      // FailedToCall, so the flip is NOT settled and the pot still sits in the contract.
      await expectations.emit(ctx,
        ctx.random.write.cast([key, locations, secrets], { account: caster.account }),
        ctx.random, 'FailedToCall')
      const seed = (await ctx.random.read.randomness([key])).seed
      expect(seed).to.not.equal(viem.zeroHash)
      // flip stayed Pending; the whole pot is still escrowed
      expect(await publicClient.getBalance({ address: ctx.coinFlip.address })).to.equal(stake * 2n)

      // now the receiver accepts ETH; claim pays it the full pot, contract balance returns to 0
      await testUtils.confirmTx(ctx, receiver.write.setReject([false], { account: funder.account }))
      const before = await publicClient.getBalance({ address: receiver.address })
      await expectations.emit(ctx, ctx.coinFlip.write.claim([flipId], { account: caster.account }), ctx.coinFlip, 'Settled')
      const after = await publicClient.getBalance({ address: receiver.address })
      expect(after - before).to.equal(stake * 2n)
      expect(await publicClient.getBalance({ address: ctx.coinFlip.address })).to.equal(0n)
    })
  })

  describe('validator-only entropy', () => {
    it('emits no Ink event from the game during a full flip (the game inks nothing)', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const { subset, locations } = await testUtils.setUpValidators(ctx, ctx.coinFlip, 3)
      const [, heads, tails] = ctx.signers
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, subset, []], { value: stake, account: heads.account }))
      const matchReceipt = await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, subset, locations], { value: stake, account: tails.account }))
      const inkEvents = await ctx.random.getEvents.Ink({}, { blockHash: matchReceipt.blockHash })
      const gameInks = inkEvents.filter((e) => viem.getAddress((e.args as any).provider) === viem.getAddress(ctx.coinFlip.address))
      expect(gameInks.length).to.equal(0)
    })
  })
})
