import * as utils from '../lib/utils'
import * as viem from 'viem'
import _ from "lodash"
import * as helpers from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import * as expectations from './expectations'
import * as testUtils from './utils'

describe('Consumer', () => {
  describe('telling of secrets', () => {
    it('happens through the tell call', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { signers } = ctx
      const [, signer2] = signers
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      const [start] = await ctx.random.getEvents.Start()
      await expectations.emit(ctx,
        ctx.consumer.write.chainTo([signer2.account!.address, false, s.preimage, start.args.key!]),
        ctx.consumer, 'Chain',
        {
          owner: viem.padHex(signer2.account!.address, { size: 32 }),
        },
      )
      const latestId = await ctx.consumer.read.latestId()
      const targets = [
        ctx.random.address,
        ctx.consumer.address,
      ]
      const preimageLocations = ctx.selections.filter((possible) => (
        !!ctx.heatEvents.find((evnt) => {
          return (
            evnt.args.provider === viem.getAddress(possible.provider)
            && evnt.args.index === possible.index
          )
        })
      ))
      const secrets: viem.Hex[] = preimageLocations.map((loc) => (
        ctx.secretByPreimage.get(loc.preimage) as viem.Hex
      ))
      const data = [
        viem.encodeFunctionData({
          abi: ctx.random.abi,
          functionName: 'cast',
          args: [
            start.args.key!,
            preimageLocations,
            secrets,
          ],
        }),
        viem.encodeFunctionData({
          abi: ctx.consumer.abi,
          functionName: 'tell',
          args: [
            latestId,
            s.secret,
          ],
        }),
      ]
      const values = (new Array(targets.length)).fill(0n)
      const multicallTx = ctx.multicallerWithSender.write.aggregateWithSender([
        targets,
        data,
        values,
      ])
      await expectations.emit(ctx,
        multicallTx, ctx.random,
        'Cast',
        {
          key: start.args.key!,
        },
      )
    })
    it('fails if the wrong secret is provided', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { signers } = ctx
      const [, signer2] = signers
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      const [start] = await ctx.random.getEvents.Start()
      await expectations.emit(ctx,
        ctx.consumer.write.chainTo([signer2.account!.address, false, s.preimage, start.args.key!]),
        ctx.consumer, 'Chain',
        {
          owner: viem.padHex(signer2.account!.address, { size: 32 }),
        },
      )
      const latestId = await ctx.consumer.read.latestId()
      const targets = [
        ctx.random.address,
        ctx.consumer.address,
      ]
      const preimageLocations = ctx.selections.filter((possible) => (
        !!ctx.heatEvents.find((evnt) => {
          return (
            evnt.args.provider === viem.getAddress(possible.provider)
            && evnt.args.index === possible.index
          )
        })
      ))
      const secrets: viem.Hex[] = preimageLocations.map((loc) => (
        ctx.secretByPreimage.get(loc.preimage) as viem.Hex
      ))
      const data = [
        viem.encodeFunctionData({
          abi: ctx.random.abi,
          functionName: 'cast',
          args: [
            start.args.key!,
            preimageLocations,
            secrets,
          ],
        }),
        viem.encodeFunctionData({
          abi: ctx.consumer.abi,
          functionName: 'tell',
          args: [
            latestId,
            viem.numberToHex(BigInt(s.secret) + 1n, { size: 32 }),
          ],
        }),
      ]
      const values = (new Array(targets.length)).fill(0n)
      const multicallTx = ctx.multicallerWithSender.write.aggregateWithSender([
        targets,
        data,
        values,
      ])
      await expectations.revertedWithCustomError(ctx.consumer,
        multicallTx,
        'SecretMismatch',
      )
    })
    it('skips if secret has already been revealed', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { signers } = ctx
      const [, signer2] = signers
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      const [start] = await ctx.random.getEvents.Start()
      await expectations.emit(ctx,
        ctx.consumer.write.chainTo([signer2.account!.address, false, s.preimage, start.args.key!]),
        ctx.consumer, 'Chain',
        {
          owner: viem.padHex(signer2.account!.address, { size: 32 }),
        },
      )
      const latestId = await ctx.consumer.read.latestId()
      const targets = [
        ctx.random.address,
        ctx.consumer.address,
      ]
      const preimageLocations = ctx.selections.filter((possible) => (
        !!ctx.heatEvents.find((evnt) => {
          return (
            evnt.args.provider === viem.getAddress(possible.provider)
            && evnt.args.index === possible.index
          )
        })
      ))
      const secrets: viem.Hex[] = preimageLocations.map((loc) => (
        ctx.secretByPreimage.get(loc.preimage) as viem.Hex
      ))
      const data = [
        viem.encodeFunctionData({
          abi: ctx.random.abi,
          functionName: 'cast',
          args: [
            start.args.key!,
            preimageLocations,
            secrets,
          ],
        }),
        viem.encodeFunctionData({
          abi: ctx.consumer.abi,
          functionName: 'tell',
          args: [
            latestId,
            s.secret,
          ],
        }),
      ]
      const values = (new Array(targets.length)).fill(0n)
      const multicallTx = ctx.multicallerWithSender.write.aggregateWithSender([
        targets,
        data,
        values,
      ])
      await expectations.emit(ctx,
        multicallTx, ctx.consumer,
        'ConsumerReveal',
        {
          id: latestId,
          formerSecret: s.secret,
        },
      )
      const duplicateMulticallTx = ctx.multicallerWithSender.write.aggregateWithSender([
        [ctx.consumer.address],
        [data[1]],
        [0n],
      ])
      await expectations.not.emit(ctx,
        duplicateMulticallTx, ctx.consumer,
        'ConsumerReveal',
      )
    })
    it('can reveal after expiry', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { signers } = ctx
      const [, signer2] = signers
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      const [start] = await ctx.random.getEvents.Start()
      await expectations.emit(ctx,
        ctx.consumer.write.chainTo([signer2.account!.address, false, s.preimage, start.args.key!]),
        ctx.consumer, 'Chain',
        {
          owner: viem.padHex(signer2.account!.address, { size: 32 }),
        },
      )
      const latestId = await ctx.consumer.read.latestId()
      const targets = [
        ctx.random.address,
        ctx.consumer.address,
      ]
      const preimageLocations = ctx.selections.filter((possible) => (
        !!ctx.heatEvents.find((evnt) => {
          return (
            evnt.args.provider === viem.getAddress(possible.provider)
            && evnt.args.index === possible.index
          )
        })
      ))
      const secrets: viem.Hex[] = preimageLocations.map((loc) => (
        ctx.secretByPreimage.get(loc.preimage) as viem.Hex
      ))
      const data = [
        viem.encodeFunctionData({
          abi: ctx.random.abi,
          functionName: 'cast',
          args: [
            start.args.key!,
            preimageLocations,
            secrets,
          ],
        }),
        viem.encodeFunctionData({
          abi: ctx.consumer.abi,
          functionName: 'tell',
          args: [
            latestId,
            s.secret,
          ],
        }),
      ]
      const values = (new Array(targets.length)).fill(0n)
      const multicallTx = ctx.multicallerWithSender.write.aggregateWithSender([
        targets,
        data,
        values,
      ])
      await helpers.mine(12)
      await expectations.emit(ctx,
        multicallTx, ctx.consumer,
        'ConsumerReveal',
        {
          id: latestId,
          formerSecret: s.secret,
        },
      )
    })
    it('can reveal before generation (bad idea if you want secret to be secret)', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { signers } = ctx
      const [, signer2] = signers
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      const [start] = await ctx.random.getEvents.Start()
      await expectations.emit(ctx,
        ctx.consumer.write.chainTo([signer2.account!.address, false, s.preimage, start.args.key!]),
        ctx.consumer, 'Chain',
        {
          owner: viem.padHex(signer2.account!.address, { size: 32 }),
        },
      )
      const latestId = await ctx.consumer.read.latestId()
      await helpers.mine(12)
      await expectations.emit(ctx,
        ctx.consumer.write.tell([latestId, s.secret]),
        ctx.consumer,
        'ConsumerReveal',
        {
          id: latestId,
          formerSecret: s.secret,
        },
      )
    })
    it('can be told to disallow undermining', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { signers } = ctx
      const [, signer2] = signers
      const [[s, altS]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      const [start] = await ctx.random.getEvents.Start()
      await expectations.emit(ctx,
        ctx.consumer.write.chainTo([signer2.account!.address, false, s.preimage, start.args.key!]),
        ctx.consumer, 'Chain',
        {
          owner: viem.padHex(signer2.account!.address, { size: 32 }),
        },
      )
      const latestId = await ctx.consumer.read.latestId()
      const targets = [
        ctx.random.address,
        ctx.consumer.address,
      ]
      const preimageLocations = ctx.selections.filter((possible) => (
        !!ctx.heatEvents.find((evnt) => {
          return (
            evnt.args.provider === viem.getAddress(possible.provider)
            && evnt.args.index === possible.index
          )
        })
      ))
      const secrets: viem.Hex[] = preimageLocations.map((loc) => (
        ctx.secretByPreimage.get(loc.preimage) as viem.Hex
      ))
      const data = [
        viem.encodeFunctionData({
          abi: ctx.random.abi,
          functionName: 'cast',
          args: [
            start.args.key!,
            preimageLocations,
            secrets,
          ],
        }),
        viem.encodeFunctionData({
          abi: ctx.consumer.abi,
          functionName: 'tell',
          args: [
            latestId,
            altS.secret,
          ],
        }),
      ]
      const values = (new Array(targets.length)).fill(0n)
      await helpers.mine(12)
      const multicallTx = ctx.multicallerWithSender.write.aggregateWithSender([
        targets,
        data,
        values,
      ])
      await expectations.revertedWithCustomError(ctx.consumer,
        multicallTx, 'Misconfigured',
      )
    })
    it('can undermine the original preimage', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { signers } = ctx
      const [, signer2] = signers
      const [[s, altS]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      const [start] = await ctx.random.getEvents.Start()
      await expectations.emit(ctx,
        ctx.consumer.write.chainTo([signer2.account!.address, true, s.preimage, start.args.key!]),
        ctx.consumer, 'Chain',
        {
          owner: viem.numberToHex(BigInt(signer2.account!.address) | (1n << 160n), { size: 32 }),
        },
      )
      const latestId = await ctx.consumer.read.latestId()
      const targets = [
        ctx.random.address,
        ctx.consumer.address,
      ]
      const preimageLocations = ctx.selections.filter((possible) => (
        !!ctx.heatEvents.find((evnt) => {
          return (
            evnt.args.provider === viem.getAddress(possible.provider)
            && evnt.args.index === possible.index
          )
        })
      ))
      const secrets: viem.Hex[] = preimageLocations.map((loc) => (
        ctx.secretByPreimage.get(loc.preimage) as viem.Hex
      ))
      const data = [
        viem.encodeFunctionData({
          abi: ctx.random.abi,
          functionName: 'cast',
          args: [
            start.args.key!,
            preimageLocations,
            secrets,
          ],
        }),
        viem.encodeFunctionData({
          abi: ctx.consumer.abi,
          functionName: 'tell',
          args: [
            latestId,
            altS.secret,
          ],
        }),
      ]
      const values = (new Array(targets.length)).fill(0n)
      await helpers.mine(12)
      const multicallTx = ctx.multicallerWithSender.write.aggregateWithSender([
        targets,
        data,
        values,
      ])
      await expectations.emit(ctx,
        multicallTx, ctx.consumer,
        'Undermine',
        {
          id: latestId,
          preimage: altS.preimage,
        },
      )
    })
  })
})
