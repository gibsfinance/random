// import * as helpers from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import { describe, it } from 'node:test'
import assert from 'node:assert'

import * as utils from '../lib/utils.js'
import * as testUtils from './utils.js'
import { parseEther, zeroAddress } from 'viem';

describe('slots', async () => {
  const { networkHelpers } = await testUtils.connect()
  await it('should read slot information from active contracts', async () => {
    const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
    const { randomnessProviders, random } = ctx
    const [provider] = randomnessProviders
    const slotKey = utils.slot('count', {
      location: {
        ...utils.defaultSection,
        provider: provider.account!.address,
      },
    })
    const publicClient = await ctx.viem.getPublicClient()
    const value = await publicClient.getStorageAt({
      address: random.address,
      slot: slotKey,
    })
    assert.equal(BigInt(value as string), 767n)
  })
  await it('should read slot regarding the timeline of a randomness request', async () => {
    const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
    const { random, starts, signers } = ctx
    const [signer] = signers
    const [start] = starts
    const key = start.args.key
    const slotKey = utils.slot('timeline', { key })
    const publicClient = await ctx.viem.getPublicClient()
    const value = await publicClient.getStorageAt({
      address: random.address,
      slot: slotKey,
    })
    assert.equal(BigInt(value as string),
      utils.timeline.encode({
        owner: signer.account!.address,
        callAtChange: false,
        duration: 12n,
        usesTimestamp: false,
        start: start.blockNumber,
      }),
    )
  })
  await it('should read slot regarding the latest randomness request', async () => {
    const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
    const { random, starts, signers } = ctx
    const [signer] = signers
    const [start] = starts
    const slotKey = utils.slot('latest', {
      account: signer.account!.address,
    })
    const publicClient = await ctx.viem.getPublicClient()
    const value = await publicClient.getStorageAt({
      address: random.address,
      slot: slotKey,
    })
    assert.equal(value, start.args.key)
  })
  await it('should read slot regarding custodied tokens', async () => {
    const ctx = await networkHelpers.loadFixture(testUtils.deploy)
    const { random, signers } = ctx
    const [signer] = signers
    const slotKey = utils.slot('custodied', {
      account: signer.account!.address,
      token: zeroAddress,
    })
    const deposited = parseEther('100')
    await ctx.random.write.handoff([zeroAddress, zeroAddress, -deposited], {
      account: signer.account!,
      value: deposited,
    })
    const publicClient = await ctx.viem.getPublicClient()
    const value = await publicClient.getStorageAt({
      address: random.address,
      slot: slotKey,
    })
    assert.equal(BigInt(value as string), deposited)
  })
})
