import * as utils from '../lib/utils'
import * as viem from 'viem'
import _ from "lodash"
import * as helpers from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import { expect } from 'chai'
import * as expectations from './expectations'
import * as testUtils from './utils'

describe("Random", () => {
  describe('writing preimages', () => {
    it('fails if read occurs before write', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      await expectations.revertedWithCustomError(ctx.reader, testUtils.readPreimages(ctx), 'Misconfigured')
    })
    it('will not err if an index that is presented is out of bounds on random contract', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      await expect(ctx.random.read.pointer([utils.defaultPreImageInfo]))
        .eventually.to.equal(viem.zeroAddress)
    })
    it('writes them to a known location', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
      const [secrets] = ctx.secretGroups
      const [readBatches] = await testUtils.readPreimages(ctx)
      const preimages = _.map(secrets, 'preimage')
      expect(preimages).to.deep.equal(readBatches)
    })
  })
  describe('requesting secrets', () => {
    it('emits a Heat event', async function () {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
      const [signer] = await ctx.hre.viem.getWalletClients()
      const [[s]] = await utils.createPreimages(signer.account!.address)
      const selections = await testUtils.selectPreimages(ctx)
      const required = 5n
      const heatHash = await testUtils.confirmTx(ctx, ctx.random.write.heat([required, 12n << 1n, viem.zeroAddress, s.preimage, selections]))
      const emitArgs = [ctx, heatHash, ctx.random, 'Heat'] as const
      const expectedUsed = selections.slice(0, Number(required))
      if (Number(required) > expectedUsed.length) {
        return this.skip()
      }
      await Promise.all(expectedUsed.map(async (parts) => {
        await expectations.emit(...emitArgs, {
          provider: viem.getAddress(parts.provider),
          section: utils.section(parts),
          index: parts.index,
        })
      }))
    })
    it('does not allow secrets to be requested twice', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
      await expectations.revertedWithCustomError(ctx.random, ctx.random.write.heat(
        [ctx.required, 12n << 1n, viem.zeroAddress, ctx.heat.preimage, ctx.selections]
      ), 'UnableToService')
    })
  })
  describe('submitting secrets', () => {
    describe('when to send', async () => {
      it('can detect by checking a section via the reader', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)

        const [selection] = ctx.selections
        const provider = selection.signer
        const unused = await ctx.reader.read.unused([
          ctx.random.address!,
          {
            ...utils.defaultPreImageInfo,
            provider: provider.account!.address,
          },
        ])
        const unusedCompact = _.reject(unused, {
          provider: viem.zeroAddress,
        })
        expect(unusedCompact.length).to.be.lessThan(unused.length)
      })
      it('can detect by checking the event', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const [selection] = ctx.selections
        const provider = await ctx.hre.viem.getPublicClient()
        const latest = await provider.getBlock({
          blockTag: 'latest',
        })
        const events = await ctx.random.getEvents.Heat({
          provider: selection.signer.account!.address,
        }, {
          fromBlock: ctx.blockBeforeHeat.number,
          toBlock: latest.number,
        })
        expect(events.length).to.be.greaterThanOrEqual(1)
      })
    })
    describe('how to use secrets once received', async () => {
      it('can be written and read on chain by anyone', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { signers, selections, randomnessStarts, secretByPreimage } = ctx
        const [start] = randomnessStarts
        const [, signer2] = signers
        const duplicatedAndShuffled = _.shuffle(selections.concat(selections))
        for (const selection of duplicatedAndShuffled) {
          // duplicated flicks should not make a difference
          await testUtils.confirmTx(ctx, ctx.random.write.flick([
            start.args.key!,
            selection,
            secretByPreimage.get(selection.preimage) as viem.Hex,
          ], {
            account: signer2.account!,
          }))
        }
        await testUtils.confirmTx(ctx, ctx.random.write.dig([start.args.key!, selections]))
      })
      it('can be written and provided via calldata but will fail if out of order', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { selections, randomnessStarts, secretByPreimage } = ctx
        const [start] = randomnessStarts
        const secrets = selections.map((selection) => (
          secretByPreimage.get(selection.preimage) as viem.Hex
        ))
        await expectations.revertedWithCustomError(ctx.random, ctx.random.write.cast([start.args.key!, selections, _.shuffle(secrets)]), 'SecretMismatch')
      })
      it('can be written and provided via calldata on chain by anyone', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { selections, randomnessStarts, secretByPreimage } = ctx
        const [start] = randomnessStarts
        const secrets = selections.map((selection) => (
          secretByPreimage.get(selection.preimage) as viem.Hex
        ))
        await testUtils.confirmTx(ctx, ctx.random.write.cast([start.args.key!, selections, secrets]))
      })
    })
  })
})
