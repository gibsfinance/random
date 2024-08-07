import * as utils from '../lib/utils'
import * as viem from 'viem'
import _ from "lodash"
import * as helpers from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import { expect } from 'chai'
import * as expectations from './expectations'
import * as testUtils from './utils'

declare module "hardhat/types/runtime" {
  interface HardhatRuntimeEnvironment {
    __SOLIDITY_COVERAGE_RUNNING: boolean;
  }
}

const oneEther = viem.parseEther('1')

describe("Random", () => {
  describe('writing preimages', () => {
    it('fails if read occurs before write', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      await expectations.revertedWithCustomError(ctx.errors,
        testUtils.readPreimages(ctx),
        'Misconfigured',
      )
    })
    it('will not err if an index that is presented is out of bounds on random contract', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      await expect(ctx.random.read.pointer([utils.defaultPreImageInfo]))
        .eventually.to.equal(viem.zeroAddress)
    })
    it('cannot write if data is missing', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      await expectations.revertedWithCustomError(ctx.errors,
        ctx.random.write.ink([viem.zeroAddress, utils.defaultPrice, '0x']),
        'Misconfigured',
      )
    })
    it('cannot write if data is uneven must write full words (32 bytes)', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      await expectations.revertedWithCustomError(ctx.errors,
        ctx.random.write.ink([viem.zeroAddress, utils.defaultPrice, '0x00']),
        'Misconfigured',
      )
    })
    it('cannot write if data is too large', async function () {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      if (ctx.hre.__SOLIDITY_COVERAGE_RUNNING) {
        // the reason we have to check this is because
        // 1) we use an implicit failure inside of sstore2 to check the length of the contract being used as storage
        // 2) that length is not enforced by hardhat while coverage is on because of the extra opcodes needed for coverage
        return this.skip()
      }
      await expectations.revertedWithCustomError(ctx.errors,
        ctx.random.write.ink([viem.zeroAddress, utils.defaultPrice, `0x${'00'.repeat(Number(utils.maxContractSize))}`]),
        'DeploymentFailed',
      )
    })
    it('writes them to a known location', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
      const [secrets] = ctx.secretBatches
      const [readBatches] = await testUtils.readPreimages(ctx)
      const preimages = _.map(secrets, 'preimage')
      expect(preimages).to.deep.equal(readBatches)
    })
  })
  describe('requesting secrets', () => {
    it('emits a Heat event', async function () {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
      const { selections } = await testUtils.selectPreimages(ctx)
      const required = 5n
      const expectedUsed = selections.slice(0, Number(required))
      const expectedEmitArgs = expectedUsed.map((parts) => ({
        provider: viem.getAddress(parts.provider),
        section: utils.section(parts),
        index: parts.index,
      }))
      await expectations.emit(ctx,
        ctx.random.write.heat([required, 12n << 9n, viem.zeroAddress, selections], { value: utils.sum(selections) }),
        ctx.random, 'Heat',
        expectedEmitArgs,
      )
    })
    it('skips payment check if preimages are free', async function () {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      const written = await testUtils.writePreimages(ctx, 0n, viem.zeroAddress, 0n)
      const preimageLocations = _.map(written, 'preimageLocations')
      const required = 5n
      const selections = _(preimageLocations).flattenDeep().sampleSize(8).value()
      const expectedUsed = selections.slice(0, Number(required))
      const expectedEmitArgs = expectedUsed.map((parts) => ({
        provider: viem.getAddress(parts.provider),
        section: utils.section(parts),
        index: parts.index,
      }))
      await expectations.emit(ctx,
        ctx.random.write.heat(
          [required, 12n << 9n, viem.zeroAddress, selections],
          /* { value: utils.sum(selections) }, */
        ),
        ctx.random, 'Heat',
        expectedEmitArgs,
      )
    })
    it('enforces payment requirement', async function () {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
      const { selections } = await testUtils.selectPreimages(ctx)
      const required = 5n
      await expectations.revertedWithCustomError(ctx.errors,
        ctx.random.write.heat(
          [required, 12n << 9n, viem.zeroAddress, selections],
          { value: utils.sum(selections) - 1n },
        ),
        'MissingPayment',
      )
    })
    it('does not allow secrets to be requested twice', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
      await expectations.revertedWithCustomError(ctx.errors, ctx.random.write.heat(
        [ctx.required, 12n << 9n, viem.zeroAddress, ctx.selections],
        { value: utils.sum(ctx.selections) },
      ), 'UnableToService')
    })
    describe('the required parameter must be', () => {
      it('greater than 0', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
        await expectations.revertedWithCustomError(ctx.errors,
          ctx.random.write.heat([0n, 12n << 9n, viem.zeroAddress, []]),
          'UnableToService',
        )
      })
      it('no more than 254', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
        const { selections } = await testUtils.selectPreimages(ctx)
        await expectations.revertedWithCustomError(ctx.errors,
          ctx.random.write.heat(
            [256n, 12n << 9n, viem.zeroAddress, selections],
            { value: utils.sum(selections) },
          ),
          'UnableToService',
        )
      })
      it('greater than or equal to the potential locations', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
        const { selections } = await testUtils.selectPreimages(ctx)
        await expectations.revertedWithCustomError(ctx.errors,
          ctx.random.write.heat(
            [BigInt(selections.length + 1), 12n << 9n, viem.zeroAddress, selections],
            { value: utils.sum(selections) },
          ),
          'UnableToService',
        )
      })
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
      it('deposit native token at the same time', async () => {
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
        await testUtils.confirmTx(ctx, ctx.random.write.dig([start.args.key!, selections], {
          value: oneEther, // the important line
        }))
      })
      it('reverts if a non existant pointer is encountered', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { signers, selections, randomnessStarts, secretByPreimage } = ctx
        const [start] = randomnessStarts
        const [, signer2] = signers
        const [selection] = selections
        await expectations.revertedWithCustomError(ctx.errors,
          ctx.random.write.flick([
            start.args.key!,
            selection,
            viem.zeroHash,
          ]),
          'ZeroSecret',
        )
      })
      it('deposit native token during flick', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { signers, selections, randomnessStarts, secretByPreimage } = ctx
        const [start] = randomnessStarts
        const [, signer2] = signers
        const duplicatedAndShuffled = _.shuffle(selections.concat(selections))
        for (const selection of duplicatedAndShuffled) {
          // duplicated flicks should not make a difference
          await expectations.changeEtherBalances(ctx,
            ctx.random.write.flick([
              start.args.key!,
              selection,
              secretByPreimage.get(selection.preimage) as viem.Hex,
            ], {
              account: signer2.account!,
              value: oneEther,
            }),
            [signer2.account!.address, ctx.random.address],
            [-oneEther, oneEther],
          )
        }
        await testUtils.confirmTx(ctx, ctx.random.write.dig([start.args.key!, selections]))
      })
      it('will return if not all secrets have been written', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { signers, selections, randomnessStarts, secretByPreimage } = ctx
        const [start] = randomnessStarts
        const [, signer2] = signers
        const subset = selections.slice(1)
        for (const selection of subset) {
          // duplicated flicks should not make a difference
          await testUtils.confirmTx(ctx, ctx.random.write.flick([
            start.args.key!,
            selection,
            secretByPreimage.get(selection.preimage) as viem.Hex,
          ], {
            account: signer2.account!,
          }))
        }
        // even if you have all of them, if you have not written them with .flick(
        // then it will simply not call cast
        await expectations.not.emit(ctx, ctx.random.write.dig([start.args.key!, selections]), ctx.random, 'Cast')
      })
      it('can be written and provided via calldata but will fail if out of order', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { selections, randomnessStarts, secretByPreimage } = ctx
        const [start] = randomnessStarts
        const secrets = selections.map((selection) => (
          secretByPreimage.get(selection.preimage) as viem.Hex
        ))
        await expectations.revertedWithCustomError(ctx.errors, ctx.random.write.cast([start.args.key!, selections, _.shuffle(secrets)]), 'SecretMismatch')
      })
      it('can be written and provided via calldata on chain by anyone', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { selections, randomnessStarts, secretByPreimage } = ctx
        const [start] = randomnessStarts
        const secrets = selections.map((selection) => (
          secretByPreimage.get(selection.preimage) as viem.Hex
        ))
        await expectations.emit(ctx, ctx.random.write.cast([start.args.key!, selections, secrets]), ctx.random, 'Cast')
      })
      it('does not allow cast to return true twice', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { selections, randomnessStarts, secretByPreimage } = ctx
        const [start] = randomnessStarts
        const secrets = selections.map((selection) => (
          secretByPreimage.get(selection.preimage) as viem.Hex
        ))
        await expectations.emit(ctx, ctx.random.write.cast([start.args.key!, selections, secrets]), ctx.random, 'Cast')
        await expectations.not.emit(ctx, ctx.random.write.cast([start.args.key!, selections, secrets]), ctx.random, 'Cast')
      })
      it('fails if the data pointer is set to a zero address', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { selections, randomnessStarts, secretByPreimage } = ctx
        const [start] = randomnessStarts
        const secrets = selections.map((selection) => (
          secretByPreimage.get(selection.preimage) as viem.Hex
        ))
        const preimages = _.map(selections, 'preimage')
        const inkTx = ctx.random.write.ink([viem.zeroAddress, utils.defaultPrice, viem.concatHex(preimages)])
        const inkReceipt = await testUtils.confirmTx(ctx, inkTx)
        const [ink] = await ctx.random.getEvents.Ink({}, {
          blockHash: inkReceipt.blockHash,
        })
        const wrongLocationSelections = selections.map((selection) => ({
          ...selection,
          offset: ink.args.offset!,
        }))
        await expectations.revertedWithCustomError(ctx.errors,
          ctx.random.write.cast([start.args.key!, wrongLocationSelections, secrets]),
          'Misconfigured',
        )
      })

      it('fails if the location list is different', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { randomnessProviders, selections, randomnessStarts, secretByPreimage } = ctx
        const [start] = randomnessStarts
        const secrets = selections.map((selection) => (
          secretByPreimage.get(selection.preimage) as viem.Hex
        ))
        const preimages = _.map(selections, 'preimage')
        const inkTx = ctx.random.write.ink([viem.zeroAddress, utils.defaultPrice, viem.concatHex(preimages)], {
          account: randomnessProviders[0].account!,
        })
        const inkReceipt = await testUtils.confirmTx(ctx, inkTx)
        const inkEvents = await ctx.random.getEvents.Ink({}, {
          blockHash: inkReceipt.blockHash,
        })
        const [ink] = inkEvents
        const startOffset = ink.args.offset! >> 128n
        const wrongLocationSelections = selections.map((selection, index) => {
          return {
            ...selection,
            provider: randomnessProviders[0].account!.address,
            offset: startOffset,
            index: BigInt(index),
          }
        })
        await expectations.revertedWithCustomError(ctx.errors,
          ctx.random.write.cast([start.args.key!, wrongLocationSelections, secrets]),
          'NotInCohort',
        )
      })
      it('can collect native token at the same time', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { selections, signers, randomnessStarts, secretByPreimage } = ctx
        const [start] = randomnessStarts
        const secrets = selections.map((selection) => (
          secretByPreimage.get(selection.preimage) as viem.Hex
        ))
        await expectations.changeEtherBalances(ctx,
          ctx.random.write.cast([start.args.key!, selections, secrets], { value: oneEther }),
          [signers[0].account!.address, ctx.random.address],
          [-oneEther, oneEther],
        )
      })
    })
    describe('secrets provided too late', async () => {
      it('can collect native token at the same time', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { selections, signers, randomnessStarts } = ctx
        const [start] = randomnessStarts
        await helpers.mine(12)
        const chopResult = ctx.random.write.chop([start.args.key!, selections], { value: oneEther })
        await expectations.changeEtherBalances(ctx,
          chopResult,
          [signers[0].account!.address, ctx.random.address],
          [-oneEther, oneEther],
        )
        await expectations.emit(ctx, chopResult, ctx.random, 'Chop', {
          key: start.args.key!,
        })
      })
      it('cannot collect refund if signer does not match', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { selections, signers, randomnessStarts } = ctx
        const [start] = randomnessStarts
        const [, signer2] = signers
        await helpers.mine(12)
        await expectations.revertedWithCustomError(ctx.errors, ctx.random.write.chop([start.args.key!, selections], {
          account: signer2.account,
        }), 'SignerMismatch')
      })
      it('will not refund if chop is after a valid cast', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { selections, signers, randomnessStarts, secretByPreimage } = ctx
        const [signer, signer2] = signers
        const [start] = randomnessStarts
        await helpers.mine(12)
        for (const selection of selections) {
          // duplicated flicks should not make a difference
          await testUtils.confirmTx(ctx, ctx.random.write.flick([
            start.args.key!,
            selection,
            secretByPreimage.get(selection.preimage) as viem.Hex,
          ], {
            account: signer2.account!,
          }))
        }
        const secrets = selections.map((selection) => (
          secretByPreimage.get(selection.preimage) as viem.Hex
        ))
        await expectations.emit(ctx, ctx.random.write.cast([start.args.key!, selections, secrets]), ctx.random, 'Cast')
        const value = utils.sum(selections)
        const chopResult = ctx.random.write.chop(
          [start.args.key!, selections],
          { value }, // just because we can
        )
        await expectations.changeEtherBalances(ctx,
          chopResult,
          [signer.account!.address, ctx.random.address],
          [-value, value],
        )
        await expectations.not.emit(ctx, chopResult, ctx.random, 'Chop')
      })
      it('will only give providers half of their winnings', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { selections, signers, randomnessStarts, secretByPreimage } = ctx
        const [, signer2] = signers
        const [start] = randomnessStarts
        await helpers.mine(13)
        for (const selection of selections) {
          // duplicated flicks should not make a difference
          await testUtils.confirmTx(ctx, ctx.random.write.flick([
            start.args.key!,
            selection,
            secretByPreimage.get(selection.preimage) as viem.Hex,
          ], {
            account: signer2.account!,
          }))
        }
        const secrets = selections.map((selection) => (
          secretByPreimage.get(selection.preimage) as viem.Hex
        ))
        const castTx = ctx.random.write.cast(
          [start.args.key!, selections, secrets],
          { account: signer2.account! },
        )
        await expectations.emit(ctx, castTx, ctx.random, 'Cast')
        await expectations.emit(ctx, castTx, ctx.random, 'CampaignExpired', {
          ender: viem.getAddress(signer2.account!.address),
          key: start.args.key!,
        })
      })
    })
  })
  describe('public signals to indicate the efficacy/health of preimages', () => {
    it('can call ok to signal continued efficacy', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
      const [selection] = ctx.selections
      await expectations.emit(ctx, ctx.random.write.ok([[selection]], {
        account: ctx.randomnessProviders.find((provider) => provider.account!.address == selection.provider)!.account,
      }), ctx.random, 'Ok')
    })
    it('can call bleach to shut down a whole section of preimages', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
      const [provider] = ctx.randomnessProviders
      await expectations.emit(ctx, ctx.random.write.bleach([{
        ...utils.defaultPreImageInfo,
        provider: provider.account!.address,
      }], {
        account: provider.account!,
      }), ctx.random, 'Bleach')
    })
    it('can call bleach on a pointer that does not exist, but will revert', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
      const [randomnessProvider] = ctx.randomnessProviders
      const existing = _(ctx.generatedPreimages).map('preimageLocations').flattenDeep().reduce((highest, location) => {
        const globalIndex = location.offset + BigInt(location.index)
        return highest > globalIndex ? highest : globalIndex
      }, 0n)
      await expect(ctx.random.read.pointer([{
        ...utils.defaultPreImageInfo,
        provider: randomnessProvider.account!.address,
        offset: existing,
      }])).eventually.to.equal(viem.zeroAddress)
      await expectations.revertedWithCustomError(ctx.errors, ctx.random.write.bleach([{
        ...utils.defaultPreImageInfo,
        provider: randomnessProvider.account!.address,
        offset: existing,
      }], {
        account: randomnessProvider.account!,
      }), 'Misconfigured')
    })
    it('cannot call bleach for other providers', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
      const [randomnessProvider, rp2] = ctx.randomnessProviders
      const existing = _(ctx.generatedPreimages).map('preimageLocations').flattenDeep().reduce((highest, location) => {
        const globalIndex = location.offset + BigInt(location.index)
        return highest > globalIndex ? highest : globalIndex
      }, 0n)
      await expect(ctx.random.read.pointer([{
        ...utils.defaultPreImageInfo,
        provider: randomnessProvider.account!.address,
      }])).eventually.not.to.equal(viem.zeroAddress)
      await expectations.revertedWithCustomError(ctx.errors, ctx.random.write.bleach([{
        ...utils.defaultPreImageInfo,
        provider: randomnessProvider.account!.address,
        offset: existing,
      }], {
        account: rp2.account!,
      }), 'SignerMismatch')
    })
  })
  describe('token custody', () => {
    it('must pass the value as a parameter', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
      await expectations.revertedWithCustomError(ctx.errors,
        ctx.random.write.handoff([viem.zeroAddress, viem.zeroAddress, -oneEther], {
          value: oneEther - 1n,
        }),
        'MissingPayment',
      )
    })
    it('custodies tokens in the contract', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
      await expectations.changeEtherBalances(ctx,
        ctx.random.write.handoff([viem.zeroAddress, viem.zeroAddress, -oneEther], {
          value: oneEther,
        }),
        [ctx.signers[0].account!.address, ctx.random.address],
        [-oneEther, oneEther]
      )
      // tries to remove 1 ether, succeeds
      await expectations.changeEtherBalances(ctx,
        ctx.random.write.handoff([viem.zeroAddress, viem.zeroAddress, oneEther]),
        [ctx.signers[0].account!.address, ctx.random.address],
        [oneEther, -oneEther],
      )
    })
    it('cannot remove more tokens than allotted', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
      // tries to remove 1 ether, fails
      await expectations.changeEtherBalances(ctx,
        ctx.random.write.handoff([viem.zeroAddress, viem.zeroAddress, oneEther]),
        [ctx.signers[0].account!.address],
        [0n],
      )
    })
  })
  describe('view functions', () => {
    describe('#expired', () => {
      it('checks if the randomness is past the expired threshold set at the start', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { randomnessStarts } = ctx
        const [start] = randomnessStarts
        const latest = await helpers.time.latestBlock()
        await helpers.mine(12 - (latest - Number(start.blockNumber))) // the number that was passed in the tx (in last block)
        const r = await ctx.random.read.randomness([start.args.key!])
        await expect(ctx.random.read.expired([r.timeline]))
          .eventually.to.equal(false)
        await helpers.mine(1)
        await expect(ctx.random.read.expired([r.timeline]))
          .eventually.to.equal(true)
      })
      it('can handle time deltas in addition to block deltas', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { selections } = await testUtils.selectPreimages(ctx)
        const required = 5n
        const heatTx = await ctx.random.write.heat([
          required,
          (120n << 9n) | 1n,
          viem.zeroAddress,
          selections,
        ], { value: utils.sum(selections) })
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
        const r = await ctx.random.read.randomness([start.args.key!])
        await expect(ctx.random.read.expired([r.timeline]))
          .eventually.to.equal(false)
        await helpers.time.setNextBlockTimestamp(lastNonExpiredSecond + 1)
        await helpers.mine(1)
        await expect(ctx.random.read.expired([r.timeline]))
          .eventually.to.equal(true)
      })
    })
    describe('#consumed', () => {
      it('checks if a preimage at a particular location has been consumed', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { all, selections } = await testUtils.selectPreimages(ctx)
        await expect(ctx.random.read.consumed([ctx.selections[0]]))
          .eventually.to.equal(true)
        const notConsumed = all.find((item) => !selections.includes(item))!
        await expect(ctx.random.read.consumed([notConsumed]))
          .eventually.to.equal(false)
      })
      it('fails if the index is outside of the section size', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const { selections } = await testUtils.selectPreimages(ctx)
        const [selection] = selections
        await expect(ctx.random.read.consumed([{
          ...selection,
          index: 766n,
        }]))
          .eventually.to.equal(false)
        await expectations.revertedWithCustomError(ctx.errors,
          ctx.random.read.consumed([{
            ...selection,
            index: 767n,
          }]),
          'Misconfigured',
        )
      })
    })
    describe('#randomness', () => {
      it('returns randomness struct', async () => {
        const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
        const [start] = ctx.randomnessStarts
        const latest = await helpers.time.latestBlock()
        await expect(ctx.random.read.randomness([start.args.key!]))
          .eventually.to.deep.equal({
            timeline: ((BigInt(start.args.owner!) << 96n) | BigInt(latest) << 48n | 12n << 9n),
            seed: viem.zeroHash,
          })
      })
    })
  })
  describe('tokens', () => {
    it('can take tokens as payment', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
      const { selections } = await testUtils.selectPreimages(ctx)
      const required = 5n
      const expectedUsed = selections.slice(0, Number(required))
      const expectedEmitArgs = expectedUsed.map((parts) => ({
        provider: viem.getAddress(parts.provider),
        section: utils.section(parts),
        index: parts.index,
      }))
      await expectations.emit(ctx,
        ctx.random.write.heat([required, 12n << 9n, viem.zeroAddress, selections], { value: utils.sum(selections) }),
        ctx.random, 'Heat',
        expectedEmitArgs,
      )
    })
    it('can deposit and withdraw tokens', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
      const [signer] = ctx.signers
      await expectations.changeTokenBalances(ctx, ctx.ERC20,
        ctx.random.write.handoff([ctx.ERC20.address, signer.account!.address, -oneEther]),
        [signer.account!.address, ctx.random.address],
        [-oneEther, oneEther],
      )
      await expectations.changeTokenBalances(ctx, ctx.ERC20,
        ctx.random.write.handoff([ctx.ERC20.address, viem.zeroAddress, oneEther]),
        [signer.account!.address, ctx.random.address],
        [oneEther, -oneEther],
      )
    })
    it('passing zero is equivalent to using the whole balance', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
      const [signer] = ctx.signers
      await expectations.changeTokenBalances(ctx, ctx.ERC20,
        ctx.random.write.handoff([ctx.ERC20.address, signer.account!.address, -oneEther]),
        [signer.account!.address, ctx.random.address],
        [-oneEther, oneEther],
      )
      await expectations.changeTokenBalances(ctx, ctx.ERC20,
        ctx.random.write.handoff([ctx.ERC20.address, viem.zeroAddress, oneEther]),
        [signer.account!.address, ctx.random.address],
        [oneEther, -oneEther],
      )
    })
    it('can deposit and withdraw tax tokens', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithAndConsumeRandomness)
      const [signer] = ctx.signers
      const taxRatio = await ctx.TAXERC20.read.taxRatio()
      const tax = (amount: bigint) => amount * taxRatio / oneEther
      let amountIn = oneEther
      let afterTax = tax(amountIn)
      await expectations.changeTokenBalances(ctx, ctx.taxERC20,
        ctx.random.write.handoff([ctx.taxERC20.address, signer.account!.address, -amountIn]),
        [signer.account!.address, ctx.random.address],
        [-amountIn, afterTax],
      )
      amountIn = afterTax
      afterTax = tax(amountIn)
      await expectations.changeTokenBalances(ctx, ctx.taxERC20,
        ctx.random.write.handoff([ctx.taxERC20.address, viem.zeroAddress, amountIn]),
        [signer.account!.address, ctx.random.address],
        [afterTax, -amountIn],
      )
    })
  })
})
