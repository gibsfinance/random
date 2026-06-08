import { padHex, getAddress, encodeFunctionData, numberToHex, type Hex } from 'viem'
import _ from 'lodash'
import { describe, it } from 'node:test'

import * as utils from '../lib/utils.js'
import * as expectations from './expectations.js'
import * as testUtils from './utils.js'

describe('Consumer', async () => {
  const { networkHelpers } = await testUtils.connect()
  await describe('telling of secrets', async () => {
    await it('happens through the tell call', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { signers, starts } = ctx
      const [start] = starts
      const [, signer2] = signers
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      await expectations.emit(
        ctx,
        ctx.consumer.write.chainTo([signer2.account!.address, false, s.preimage, start.args.key!]),
        ctx.consumer,
        'Chain',
        {
          owner: padHex(signer2.account!.address, { size: 32 }),
        },
      )
      const latestId = await ctx.consumer.read.latestId()
      const targets = [ctx.random.address, ctx.consumer.address]
      const preimageLocations = ctx.selections.filter(
        (possible) =>
          !!ctx.heatEvents.find((evnt) => {
            return evnt.args.provider === getAddress(possible.provider) && evnt.args.index === possible.index
          }),
      )
      const secrets: Hex[] = preimageLocations.map((loc) => ctx.secretByPreimage.get(loc.preimage) as Hex)
      const data = [
        encodeFunctionData({
          abi: ctx.random.abi,
          functionName: 'cast',
          args: [start.args.key!, preimageLocations, secrets],
        }),
        encodeFunctionData({
          abi: ctx.consumer.abi,
          functionName: 'tell',
          args: [latestId, s.secret],
        }),
      ]
      const values = new Array(targets.length).fill(0n)
      const multicallTx = ctx.multicallerWithSender.write.aggregateWithSender([targets, data, values])
      await expectations.emit(ctx, multicallTx, ctx.random, 'Cast', {
        key: start.args.key!,
      })
    })
    await it('fails if the wrong secret is provided', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { signers, starts } = ctx
      const [start] = starts
      const [, signer2] = signers
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      await expectations.emit(
        ctx,
        ctx.consumer.write.chainTo([getAddress(signer2.account!.address), false, s.preimage, start.args.key!]),
        ctx.consumer,
        'Chain',
        {
          owner: padHex(signer2.account!.address, { size: 32 }),
        },
      )
      const latestId = await ctx.consumer.read.latestId()
      const targets = [ctx.random.address, ctx.consumer.address]
      const preimageLocations = ctx.selections.filter(
        (possible) =>
          !!ctx.heatEvents.find((evnt) => {
            return evnt.args.provider === getAddress(possible.provider) && evnt.args.index === possible.index
          }),
      )
      const secrets: Hex[] = preimageLocations.map((loc) => ctx.secretByPreimage.get(loc.preimage) as Hex)
      const data = [
        encodeFunctionData({
          abi: ctx.random.abi,
          functionName: 'cast',
          args: [start.args.key!, preimageLocations, secrets],
        }),
        encodeFunctionData({
          abi: ctx.consumer.abi,
          functionName: 'tell',
          args: [latestId, numberToHex(BigInt(s.secret) + 1n, { size: 32 })],
        }),
      ]
      const values = new Array(targets.length).fill(0n)
      const multicallTx = ctx.multicallerWithSender.write.aggregateWithSender([targets, data, values])
      await expectations.revertedWithCustomError(ctx.consumer, multicallTx, 'SecretMismatch')
    })
    await it('skips if secret has already been revealed', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const [start] = await ctx.random.getEvents.Start()
      const { signers } = ctx
      const [, signer2] = signers
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      await expectations.emit(
        ctx,
        ctx.consumer.write.chainTo([getAddress(signer2.account!.address), false, s.preimage, start.args.key!]),
        ctx.consumer,
        'Chain',
        {
          owner: padHex(signer2.account!.address, { size: 32 }),
        },
      )
      const latestId = await ctx.consumer.read.latestId()
      const targets = [ctx.random.address, ctx.consumer.address]
      const preimageLocations = ctx.selections.filter(
        (possible) =>
          !!ctx.heatEvents.find((evnt) => {
            return evnt.args.provider === getAddress(possible.provider) && evnt.args.index === possible.index
          }),
      )
      const secrets: Hex[] = preimageLocations.map((loc) => ctx.secretByPreimage.get(loc.preimage) as Hex)
      const data = [
        encodeFunctionData({
          abi: ctx.random.abi,
          functionName: 'cast',
          args: [start.args.key!, preimageLocations, secrets],
        }),
        encodeFunctionData({
          abi: ctx.consumer.abi,
          functionName: 'tell',
          args: [latestId, s.secret],
        }),
      ]
      const values = new Array(targets.length).fill(0n)
      const multicallTx = ctx.multicallerWithSender.write.aggregateWithSender([targets, data, values])
      await expectations.emit(ctx, multicallTx, ctx.consumer, 'ConsumerReveal', {
        id: latestId,
        formerSecret: s.secret,
      })
      const duplicateMulticallTx = ctx.multicallerWithSender.write.aggregateWithSender([
        [ctx.consumer.address],
        [data[1]],
        [0n],
      ])
      await expectations.not.emit(ctx, duplicateMulticallTx, ctx.consumer, 'ConsumerReveal')
    })
    await it('can reveal after expiry', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const [start] = await ctx.random.getEvents.Start()
      const { signers } = ctx
      const [, signer2] = signers
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      await expectations.emit(
        ctx,
        ctx.consumer.write.chainTo([signer2.account!.address, false, s.preimage, start.args.key!]),
        ctx.consumer,
        'Chain',
        {
          owner: padHex(signer2.account!.address, { size: 32 }),
        },
      )
      const latestId = await ctx.consumer.read.latestId()
      const targets = [ctx.random.address, ctx.consumer.address]
      const preimageLocations = ctx.selections.filter(
        (possible) =>
          !!ctx.heatEvents.find((evnt) => {
            return evnt.args.provider === getAddress(possible.provider) && evnt.args.index === possible.index
          }),
      )
      const secrets: Hex[] = preimageLocations.map((loc) => ctx.secretByPreimage.get(loc.preimage) as Hex)
      const data = [
        encodeFunctionData({
          abi: ctx.random.abi,
          functionName: 'cast',
          args: [start.args.key!, preimageLocations, secrets],
        }),
        encodeFunctionData({
          abi: ctx.consumer.abi,
          functionName: 'tell',
          args: [latestId, s.secret],
        }),
      ]
      const values = new Array(targets.length).fill(0n)
      const multicallTx = ctx.multicallerWithSender.write.aggregateWithSender([targets, data, values])
      await networkHelpers.mine(12)
      await expectations.emit(ctx, multicallTx, ctx.consumer, 'ConsumerReveal', {
        id: latestId,
        formerSecret: s.secret,
      })
    })
    await it('can reveal before generation (bad idea if you want secret to be secret)', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const [start] = await ctx.random.getEvents.Start()
      const { signers } = ctx
      const [, signer2] = signers
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      await expectations.emit(
        ctx,
        ctx.consumer.write.chainTo([getAddress(signer2.account!.address), false, s.preimage, start.args.key!]),
        ctx.consumer,
        'Chain',
        {
          owner: padHex(signer2.account!.address, { size: 32 }),
        },
      )
      const latestId = await ctx.consumer.read.latestId()
      await networkHelpers.mine(12)
      await expectations.emit(ctx, ctx.consumer.write.tell([latestId, s.secret]), ctx.consumer, 'ConsumerReveal', {
        id: latestId,
        formerSecret: s.secret,
      })
    })
    await it('can be told to disallow undermining', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const [start] = await ctx.random.getEvents.Start()
      const { signers } = ctx
      const [, signer2] = signers
      const [[s, altS]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      await expectations.emit(
        ctx,
        ctx.consumer.write.chainTo([getAddress(signer2.account!.address), false, s.preimage, start.args.key!]),
        ctx.consumer,
        'Chain',
        {
          owner: padHex(signer2.account!.address, { size: 32 }),
        },
      )
      const latestId = await ctx.consumer.read.latestId()
      const targets = [ctx.random.address, ctx.consumer.address]
      const preimageLocations = ctx.selections.filter(
        (possible) =>
          !!ctx.heatEvents.find((evnt) => {
            return evnt.args.provider === getAddress(possible.provider) && evnt.args.index === possible.index
          }),
      )
      const secrets: Hex[] = preimageLocations.map((loc) => ctx.secretByPreimage.get(loc.preimage) as Hex)
      const data = [
        encodeFunctionData({
          abi: ctx.random.abi,
          functionName: 'cast',
          args: [start.args.key!, preimageLocations, secrets],
        }),
        encodeFunctionData({
          abi: ctx.consumer.abi,
          functionName: 'tell',
          args: [latestId, altS.secret],
        }),
      ]
      const values = new Array(targets.length).fill(0n)
      await networkHelpers.mine(12)
      const multicallTx = ctx.multicallerWithSender.write.aggregateWithSender([targets, data, values])
      await expectations.revertedWithCustomError(ctx.consumer, multicallTx, 'Misconfigured')
    })
    await it('can undermine the original preimage', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const [start] = await ctx.random.getEvents.Start()
      const { signers } = ctx
      const [, signer2] = signers
      const [[s, altS]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      await expectations.emit(
        ctx,
        ctx.consumer.write.chainTo([getAddress(signer2.account!.address), true, s.preimage, start.args.key!]),
        ctx.consumer,
        'Chain',
        {
          owner: numberToHex(BigInt(signer2.account!.address) | (1n << 160n), { size: 32 }),
        },
      )
      const latestId = await ctx.consumer.read.latestId()
      const targets = [ctx.random.address, ctx.consumer.address]
      const preimageLocations = ctx.selections.filter(
        (possible) =>
          !!ctx.heatEvents.find((evnt) => {
            return evnt.args.provider === getAddress(possible.provider) && evnt.args.index === possible.index
          }),
      )
      const secrets: Hex[] = preimageLocations.map((loc) => ctx.secretByPreimage.get(loc.preimage) as Hex)
      const data = [
        encodeFunctionData({
          abi: ctx.random.abi,
          functionName: 'cast',
          args: [start.args.key!, preimageLocations, secrets],
        }),
        encodeFunctionData({
          abi: ctx.consumer.abi,
          functionName: 'tell',
          args: [latestId, altS.secret],
        }),
      ]
      const values = new Array(targets.length).fill(0n)
      await networkHelpers.mine(12)
      const multicallTx = ctx.multicallerWithSender.write.aggregateWithSender([targets, data, values])
      await expectations.emit(ctx, multicallTx, ctx.consumer, 'Undermine', {
        id: latestId,
        preimage: altS.preimage,
      })
    })
  })
})
