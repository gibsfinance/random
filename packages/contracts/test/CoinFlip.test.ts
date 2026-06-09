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

  describe('pairing drives randomness', () => {
    it('inks the players and heats validators, recording a key', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const pool = await testUtils.inkValidatorPool(ctx, 3)
      const [a, b] = ctx.signers
      const stake = viem.parseEther('1')
      // template carries the shared price-0 section; provider/offset/index are advisory — the
      // contract forces provider=address(this) and computes its own offset. The token-defining
      // fields (callAtChange/durationIsTimestamp/duration/token) match the validator pool so the
      // combined heat is well-formed.
      const template = { ...pool.section, provider: ctx.coinFlip.address, price: 0n, offset: 0n, index: 0n }
      // first entrant has no opposite-side match yet -> queues, no heat
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch(
        [0, viem.keccak256(viem.toHex('a')), template, []], { value: stake, account: a.account }))
      // second entrant completes the pair -> inks both players and heats with the validator pool
      await expectations.emit(ctx,
        ctx.coinFlip.write.enterAndMatch([1, viem.keccak256(viem.toHex('b')), template, pool.locations], { value: stake, account: b.account }),
        ctx.random, 'Start')
    })
  })

  describe('recovery', () => {
    it('lets an unmatched entrant cancel for a refund', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const [a] = ctx.signers
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enter([0, viem.keccak256(viem.toHex('a'))], { value: stake, account: a.account }))
      const publicClient = await ctx.hre.viem.getPublicClient()
      const before = await publicClient.getBalance({ address: ctx.coinFlip.address })
      expect(before).to.equal(stake)
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.cancel([1n], { account: a.account }))
      expect(await publicClient.getBalance({ address: ctx.coinFlip.address })).to.equal(0n)
    })

    it('rejects cancel from a non-owner', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const [a, b] = ctx.signers
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enter([0, viem.keccak256(viem.toHex('a'))], { value: stake, account: a.account }))
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.cancel([1n], { account: b.account }),
        'NotEntrant',
      )
    })

    it('refunds both players when a paired flip goes stale', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const pool = await testUtils.inkValidatorPool(ctx, 3)
      const [a, b] = ctx.signers
      const stake = viem.parseEther('1')
      const template = { ...pool.section, provider: ctx.coinFlip.address, price: 0n, offset: 0n, index: 0n }
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, viem.keccak256(viem.toHex('a')), template, []], { value: stake, account: a.account }))
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, viem.keccak256(viem.toHex('b')), template, pool.locations], { value: stake, account: b.account }))
      const [paired] = await ctx.coinFlip.getEvents.Paired()
      await helpers.mine(201)
      const publicClient = await ctx.hre.viem.getPublicClient()
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.refundStale([paired.args.flipId!]))
      expect(await publicClient.getBalance({ address: ctx.coinFlip.address })).to.equal(0n)
    })

    it('rejects refundStale before the timeout window', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const pool = await testUtils.inkValidatorPool(ctx, 3)
      const [a, b] = ctx.signers
      const stake = viem.parseEther('1')
      const template = { ...pool.section, provider: ctx.coinFlip.address, price: 0n, offset: 0n, index: 0n }
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, viem.keccak256(viem.toHex('a')), template, []], { value: stake, account: a.account }))
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, viem.keccak256(viem.toHex('b')), template, pool.locations], { value: stake, account: b.account }))
      const [paired] = await ctx.coinFlip.getEvents.Paired()
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.refundStale([paired.args.flipId!]),
        'TooEarly',
      )
    })
  })

  describe('settlement', () => {
    it('pays the whole pot to the parity-selected winner on cast', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const pool = await testUtils.inkValidatorPool(ctx, 3)
      const [a, b] = ctx.signers
      const caster = ctx.signers[5]
      const stake = viem.parseEther('1')
      const template = { ...pool.section, provider: ctx.coinFlip.address, price: 0n, offset: 0n, index: 0n }
      // both players use hash(1) walk-away preimages so the public secret (1) is revealable by anyone
      const walkAwaySecret = viem.padHex('0x01', { size: 32 }) // bytes32(uint256(1))
      const walkAwayPre = viem.keccak256(walkAwaySecret)
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, walkAwayPre, template, []], { value: stake, account: a.account }))
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, walkAwayPre, template, pool.locations], { value: stake, account: b.account }))
      const [start] = await ctx.random.getEvents.Start()
      const key = start.args.key!
      // replay the heat selection EXACTLY: [player@index0, player@index1, ...validatorLocations]
      const playerLocs = [{ ...template, index: 0n }, { ...template, index: 1n }]
      const selections = [...playerLocs, ...pool.locations]
      const secrets = [walkAwaySecret, walkAwaySecret, ...pool.secrets.map((s) => s.secret)]
      const publicClient = await ctx.hre.viem.getPublicClient()
      const before = { heads: await publicClient.getBalance({ address: a.account!.address }), tails: await publicClient.getBalance({ address: b.account!.address }) }
      await expectations.emit(ctx, ctx.random.write.cast([key, selections, secrets], { account: caster.account }), ctx.coinFlip, 'Settled')
      const seed = (await ctx.random.read.randomness([key])).seed
      const winnerIsHeads = (BigInt(seed) & 1n) === 0n
      const winnerAddr = winnerIsHeads ? a.account!.address : b.account!.address
      const after = await publicClient.getBalance({ address: winnerAddr })
      expect(after - (winnerIsHeads ? before.heads : before.tails)).to.equal(stake * 2n)
    })
  })
})
