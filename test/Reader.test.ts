import * as utils from '../lib/utils'
import * as viem from 'viem'
import _ from "lodash"
import * as helpers from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import { expect } from 'chai'
import * as expectations from './expectations'
import * as testUtils from './utils'

describe('Reader', () => {
  it('can read single preimages', async () => {
    const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
    const [secrets] = ctx.secretBatches
    const [s] = secrets
    const [provider] = ctx.randomnessProviders

    await expect(ctx.reader.read.at([ctx.random.address, {
      provider: provider.account!.address,
      token: viem.zeroAddress,
      price: utils.defaultPrice,
      offset: 0n,
      index: 0n,
    }])).eventually.to.equal(s.preimage)
  })
  it('cannot read out of bounds', async () => {
    const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
    const [secrets] = ctx.secretBatches
    const [provider] = ctx.randomnessProviders
    await expectations.revertedWithCustomError(ctx.reader, ctx.reader.read.at([ctx.random.address, {
      provider: provider.account!.address,
      token: viem.zeroAddress,
      price: utils.defaultPrice,
      offset: 0n,
      index: BigInt(secrets.length), // an off by 1 error
    }]), 'IndexOutOfBounds')
  })

  describe('#expired', () => {
    it('checks if the randomness is past the expired threshold set at the start', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
      const { randomnessStarts } = ctx
      const [start] = randomnessStarts
      const latest = await helpers.time.latestBlock()
      await helpers.mine(12 - (latest - Number(start.blockNumber))) // the number that was passed in the tx (in last block)
      await expect(ctx.reader.read.expired([ctx.random.address, start.args.key!]))
        .eventually.to.equal(false)
      await helpers.mine(1)
      await expect(ctx.reader.read.expired([ctx.random.address, start.args.key!]))
        .eventually.to.equal(true)
    })
    it('can handle time deltas in addition to block deltas', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
      const { selections } = await testUtils.selectPreimages(ctx)
      const required = 5n
      const heatTx = await ctx.random.write.heat([
        required,
        (120n << 1n) | 1n,
        viem.zeroAddress,
        selections,
      ])
      const receipt = await testUtils.confirmTx(ctx, heatTx)
      const randomnessStarts = await ctx.random.getEvents.RandomnessStart({}, {
        blockHash: receipt.blockHash,
      })
      const provider = await ctx.hre.viem.getPublicClient()
      const block = await provider.getBlock({
        blockHash: receipt.blockHash,
      })
      const [start] = randomnessStarts
      const lastNonExpiredSecond = Number(block.timestamp + 120n)
      await helpers.time.setNextBlockTimestamp(lastNonExpiredSecond) // the number that was passed in the tx (in last block)
      await helpers.mine(1)
      await expect(ctx.reader.read.expired([ctx.random.address, start.args.key!]))
        .eventually.to.equal(false)
      await helpers.time.setNextBlockTimestamp(lastNonExpiredSecond + 1)
      await helpers.mine(1)
      await expect(ctx.reader.read.expired([ctx.random.address, start.args.key!]))
        .eventually.to.equal(true)
    })
  })
})
