import * as helpers from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import * as viem from 'viem'
import * as utils from '../lib/utils'
import { expect } from 'chai'
import * as testUtils from './utils'

describe('slots', () => {
  it('should read slot information from active contracts', async () => {
    const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
    const { randomnessProviders, random } = ctx
    const [provider] = randomnessProviders
    const slotKey = utils.slot('count', {
      location: {
        ...utils.defaultSection,
        provider: provider.account!.address,
      },
    })
    const publicClient = await ctx.hre.viem.getPublicClient()
    const value = await publicClient.getStorageAt({
      address: random.address,
      slot: slotKey,
    })
    expect(BigInt(value as string)).to.equal(767n)
  })
  it('should read slot regarding the timeline of a randomness request', async () => {
    const ctx = await helpers.loadFixture(testUtils.deployWithRandomnessAndStart)
    const { random, starts, signers } = ctx
    const [signer] = signers
    const [start] = starts
    const key = start.args.key
    const slotKey = utils.slot('timeline', { key })
    const publicClient = await ctx.hre.viem.getPublicClient()
    const value = await publicClient.getStorageAt({
      address: random.address,
      slot: slotKey,
    })
    expect(BigInt(value as string)).to.equal(
      utils.encodeTimeline({
        owner: signer.account!.address,
        duration: 12n,
        durationIsTimestamp: false,
        start: start.blockNumber,
      })
    )
  })
  it('should read slot regarding the latest randomness request', async () => {
    const ctx = await helpers.loadFixture(testUtils.deployWithRandomnessAndStart)
    const { random, starts, signers } = ctx
    const [signer] = signers
    const [start] = starts
    const slotKey = utils.slot('latest', {
      account: signer.account!.address,
    })
    const publicClient = await ctx.hre.viem.getPublicClient()
    const value = await publicClient.getStorageAt({
      address: random.address,
      slot: slotKey,
    })
    expect(value).to.equal(start.args.key)
  })
  it('should read slot regarding custodied tokens', async () => {
    const ctx = await helpers.loadFixture(testUtils.deploy)
    const { random, signers } = ctx
    const [signer] = signers
    const slotKey = utils.slot('custodied', {
      account: signer.account!.address,
      token: viem.zeroAddress,
    })
    const deposited = viem.parseEther('100')
    await ctx.random.write.handoff([viem.zeroAddress, viem.zeroAddress, -deposited], {
      account: signer.account!,
      value: deposited,
    })
    const publicClient = await ctx.hre.viem.getPublicClient()
    const value = await publicClient.getStorageAt({
      address: random.address,
      slot: slotKey,
    })
    expect(BigInt(value as string)).to.equal(deposited)
  })
})
