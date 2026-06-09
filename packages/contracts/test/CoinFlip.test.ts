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
      const hash = await ctx.coinFlip.write.enterAndMatch([0, preimage, []], { value: stake, account: player.account })
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
        ctx.coinFlip.write.enterAndMatch([0, viem.zeroHash, []], { value: 0n }),
        'ZeroStake',
      )
    })

    it('rejects an invalid side', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const stake = viem.parseEther('1')
      await expectations.revertedWithCustomError(
        ctx.coinFlip,
        ctx.coinFlip.write.enterAndMatch([2, viem.zeroHash, []], { value: stake }),
        'WrongSide',
      )
    })
  })

  describe('matching', () => {
    it('queues same-side entrants and pairs the first opposite-side entrant', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const pool = await testUtils.inkValidatorPool(ctx, 3)
      const [a, b, c] = ctx.signers
      const stake = viem.parseEther('1')
      // two heads, no tails -> both queue, none paired
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, viem.keccak256(viem.toHex('a')), []], { value: stake, account: a.account }))
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, viem.keccak256(viem.toHex('b')), []], { value: stake, account: b.account }))
      const noPair = await ctx.coinFlip.getEvents.Paired()
      expect(noPair.length).to.equal(0)
      // first tails pairs with the oldest heads (entry 1 = a); the completing call drives heat,
      // so it carries the validator pool
      await expectations.emit(ctx,
        ctx.coinFlip.write.enterAndMatch([1, viem.keccak256(viem.toHex('c')), pool.locations], { value: stake, account: c.account }),
        ctx.coinFlip, 'Paired', { heads: viem.getAddress(a.account!.address) })
    })

    it('does not match across different stakes', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const [a, b] = ctx.signers
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, viem.keccak256(viem.toHex('a')), []], { value: viem.parseEther('1'), account: a.account }))
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, viem.keccak256(viem.toHex('b')), []], { value: viem.parseEther('2'), account: b.account }))
      expect((await ctx.coinFlip.getEvents.Paired()).length).to.equal(0)
    })
  })

  describe('pairing drives randomness', () => {
    it('inks the players and heats validators, recording a key', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const pool = await testUtils.inkValidatorPool(ctx, 3)
      const [a, b] = ctx.signers
      const stake = viem.parseEther('1')
      // first entrant has no opposite-side match yet -> queues, no heat
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch(
        [0, viem.keccak256(viem.toHex('a')), []], { value: stake, account: a.account }))
      // second entrant completes the pair -> inks both players and heats with the validator pool
      await expectations.emit(ctx,
        ctx.coinFlip.write.enterAndMatch([1, viem.keccak256(viem.toHex('b')), pool.locations], { value: stake, account: b.account }),
        ctx.random, 'Start')
    })
  })

  describe('recovery', () => {
    it('lets an unmatched entrant cancel for a refund', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const [a] = ctx.signers
      const stake = viem.parseEther('1')
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, viem.keccak256(viem.toHex('a')), []], { value: stake, account: a.account }))
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
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, viem.keccak256(viem.toHex('a')), []], { value: stake, account: a.account }))
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
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, viem.keccak256(viem.toHex('a')), []], { value: stake, account: a.account }))
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, viem.keccak256(viem.toHex('b')), pool.locations], { value: stake, account: b.account }))
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
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, viem.keccak256(viem.toHex('a')), []], { value: stake, account: a.account }))
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, viem.keccak256(viem.toHex('b')), pool.locations], { value: stake, account: b.account }))
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
      // both players use hash(1) walk-away preimages so the public secret (1) is revealable by anyone
      const walkAwaySecret = viem.padHex('0x01', { size: 32 }) // bytes32(uint256(1))
      const walkAwayPre = viem.keccak256(walkAwaySecret)
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, walkAwayPre, []], { value: stake, account: a.account }))
      await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, walkAwayPre, pool.locations], { value: stake, account: b.account }))
      const [start] = await ctx.random.getEvents.Start()
      const key = start.args.key!
      // replay the heat selection EXACTLY: [player@index0, player@index1, ...validatorLocations].
      // The player locations come straight from the contract's canonical section (offset 0 = first flip).
      const playerLocs = [
        await ctx.coinFlip.read.playerSection([0n, 0n]),
        await ctx.coinFlip.read.playerSection([0n, 1n]),
      ]
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

    it('runs two flips back-to-back, proving the player offset advances', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      // six validator preimages: first three feed flip 1, last three feed flip 2 (consumed per heat)
      const pool = await testUtils.inkValidatorPool(ctx, 6)
      const flip1Validators = pool.locations.slice(0, 3)
      const flip2Validators = pool.locations.slice(3, 6)
      const flip1Secrets = pool.secrets.slice(0, 3)
      const flip2Secrets = pool.secrets.slice(3, 6)
      const caster = ctx.signers[5]
      const stake = viem.parseEther('1')
      const walkAwaySecret = viem.padHex('0x01', { size: 32 })
      const walkAwayPre = viem.keccak256(walkAwaySecret)
      const publicClient = await ctx.hre.viem.getPublicClient()

      // A flip is two enterAndMatch calls (one per side); the completing call drives heat at the
      // given player offset. `secrets`/validators are sliced per flip so each heat consumes fresh
      // validator preimages.
      const runFlip = async (
        headsAccount: typeof ctx.signers[number],
        tailsAccount: typeof ctx.signers[number],
        offset: bigint,
        validators: typeof pool.locations,
        validatorSecrets: typeof pool.secrets,
      ) => {
        const startsBefore = (await ctx.random.getEvents.Start()).length
        await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([0, walkAwayPre, []], { value: stake, account: headsAccount.account }))
        await testUtils.confirmTx(ctx, ctx.coinFlip.write.enterAndMatch([1, walkAwayPre, validators], { value: stake, account: tailsAccount.account }))
        const starts = await ctx.random.getEvents.Start()
        expect(starts.length).to.equal(startsBefore + 1)
        const key = starts[starts.length - 1].args.key!
        const playerLocs = [
          await ctx.coinFlip.read.playerSection([offset, 0n]),
          await ctx.coinFlip.read.playerSection([offset, 1n]),
        ]
        const selections = [...playerLocs, ...validators]
        const secrets = [walkAwaySecret, walkAwaySecret, ...validatorSecrets.map((s) => s.secret)]
        const before = {
          heads: await publicClient.getBalance({ address: headsAccount.account!.address }),
          tails: await publicClient.getBalance({ address: tailsAccount.account!.address }),
        }
        await expectations.emit(ctx, ctx.random.write.cast([key, selections, secrets], { account: caster.account }), ctx.coinFlip, 'Settled')
        const seed = (await ctx.random.read.randomness([key])).seed
        const winnerIsHeads = (BigInt(seed) & 1n) === 0n
        const winnerAddr = winnerIsHeads ? headsAccount.account!.address : tailsAccount.account!.address
        const after = await publicClient.getBalance({ address: winnerAddr })
        expect(after - (winnerIsHeads ? before.heads : before.tails)).to.equal(stake * 2n)
      }

      const [a, b, c, d] = ctx.signers
      // flip 1 players ink at offset 0; flip 2 players must ink at offset 2 — if _playerInkOffset
      // failed to advance, flip 2's heat or cast would revert / mis-address.
      await runFlip(a, b, 0n, flip1Validators, flip1Secrets)
      await runFlip(c, d, 2n, flip2Validators, flip2Secrets)
    })
  })
})
