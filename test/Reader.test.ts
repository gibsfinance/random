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

    await expect(ctx.reader.read.at([{
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
    await expectations.revertedWithCustomError(ctx.reader, ctx.reader.read.at([{
      provider: provider.account!.address,
      token: viem.zeroAddress,
      price: utils.defaultPrice,
      offset: 0n,
      index: BigInt(secrets.length), // an off by 1 error
    }]), 'IndexOutOfBounds')
  })
})
