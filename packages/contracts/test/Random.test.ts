import { concatHex, encodeFunctionData, getAddress, Hex, keccak256, padHex, parseEther, zeroAddress, zeroHash } from 'viem'
import _ from 'lodash'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as utils from '../lib/utils.js'
import * as expectations from './expectations.js'
import * as testUtils from './utils.js'
import { selectPreimages } from './utils.js';

// declare module 'hardhat/types/runtime' {
//   interface HardhatRuntimeEnvironment {
//     __SOLIDITY_COVERAGE_RUNNING: boolean
//   }
// }

const oneEther = parseEther('1')

describe('Random', async () => {
  const { networkHelpers } = await testUtils.connect()
  await describe('writing preimages', async () => {
    await it('fails if read occurs before write', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deploy)
      await expectations.revertedWithCustomError(ctx.errors, testUtils.readPreimages(ctx), 'Misconfigured')
    })
    await it('will not err if an index that is presented is out of bounds on random contract', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deploy)
      assert.equal(await ctx.random.read.pointer([utils.defaultSection]), zeroAddress)
    })
    await it('if not enough funds are presented, failure occurs', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deploy)
      const [signer] = ctx.signers
      const section = {
        ...utils.defaultSection,
        provider: signer.account!.address,
      }
      const [secrets] = await utils.createTestPreimages(section)
      const preimages = _.map(secrets, 'preimage')
      const data = concatHex(preimages)
      await expectations.revertedWithCustomError(
        ctx.errors,
        ctx.random.write.ink([section, data], {
          value: section.price * BigInt(secrets.length) - 1n,
        }),
        'MissingPayment',
      )
      await testUtils.confirmTx(
        ctx,
        ctx.random.write.ink([section, data], {
          value: section.price * BigInt(secrets.length),
        }),
      )
    })
    await it('cannot write if data is missing', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deploy)
      await expectations.revertedWithCustomError(
        ctx.errors,
        ctx.random.write.ink([utils.defaultSection, '0x']),
        'Misconfigured',
      )
    })
    await it('cannot make owner zero address', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deploy)
      const section = utils.defaultSection
      const [secrets] = await utils.createTestPreimages(section)
      const preimages = _.map(secrets, 'preimage')
      const data = concatHex(preimages)
      await expectations.revertedWithCustomError(
        ctx.errors,
        ctx.random.write.ink([section, data], {
          value: section.price * BigInt(secrets.length),
        }),
        'UnableToService',
      )
    })
    await it('cannot write if data is uneven must write full words (32 bytes)', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deploy)
      await expectations.revertedWithCustomError(
        ctx.errors,
        ctx.random.write.ink([utils.defaultSection, '0x00']),
        'Misconfigured',
      )
    })
    await it('cannot write if data is too large', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deploy)
      // if (ctx.hre.__SOLIDITY_COVERAGE_RUNNING) {
      //   // the reason we have to check this is because
      //   // 1) we use an implicit failure inside of sstore2 to check the length of the contract being used as storage
      //   // 2) that length is not enforced by hardhat while coverage is on because of the extra opcodes needed for coverage
      //   return this.skip()
      // }
      const [signer] = ctx.signers
      await expectations.revertedWithCustomError(
        ctx.errors,
        ctx.random.write.ink([
          {
            ...utils.defaultSection,
            provider: signer.account!.address,
            price: 0n,
          },
          `0x${'00'.repeat(Number(utils.maxContractSize))}`,
        ]),
        'DeploymentFailed',
      )
    })
    await it('writes them to a known location', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
      const [secrets] = ctx.secretBatches
      const [readBatches] = await testUtils.readPreimages(ctx)
      const preimages = _.map(secrets, 'preimage')
      assert.deepEqual(preimages, readBatches)
    })
  })
  await describe('requesting secrets', async () => {
    await it('emits a Heat event', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
      const { selections } = await testUtils.selectPreimages(ctx)
      const required = 5n
      const expectedUsed = selections.slice(0, Number(required))
      const expectedEmitArgs = expectedUsed.map((parts) => ({
        provider: getAddress(parts.provider),
        section: utils.section(parts),
        index: parts.index,
      }))
      const section = {
        ...utils.defaultSection,
        provider: ctx.signers[0].account!.address,
      }
      await expectations.emit(
        ctx,
        ctx.random.write.heat([required, section, selections, true], { value: utils.sum(selections) }),
        ctx.random,
        'Heat',
        expectedEmitArgs,
      )
    })
    await it('skips payment check if preimages are free', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deploy)
      const written = await testUtils.writePreimages(ctx, {
        ...utils.defaultSection,
        price: 0n,
      })
      const preimageLocations = _.map(written, 'preimageLocations')
      const required = 5n
      const selections = _(preimageLocations).flattenDeep().sampleSize(8).value()
      const expectedUsed = selections.slice(0, Number(required))
      const expectedEmitArgs = expectedUsed.map((parts) => ({
        provider: getAddress(parts.provider),
        section: utils.section(parts),
        index: parts.index,
      }))
      const section = {
        ...utils.defaultSection,
        provider: ctx.signers[0].account!.address,
      }
      await expectations.emit(
        ctx,
        ctx.random.write.heat(
          [required, section, selections, true],
          /* { value: utils.sum(selections) }, */
        ),
        ctx.random,
        'Heat',
        expectedEmitArgs,
      )
    })
    await it('enforces payment requirement', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
      const { selections } = await testUtils.selectPreimages(ctx)
      const required = 5n
      const section = {
        ...utils.defaultSection,
        provider: ctx.signers[0].account!.address,
      }
      await expectations.revertedWithCustomError(
        ctx.errors,
        ctx.random.write.heat([required, section, selections, true], { value: utils.sum(selections) - 1n }),
        'MissingPayment',
      )
    })
    await it('does not allow secrets to be requested twice', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
      const section = {
        ...utils.defaultSection,
        provider: ctx.signers[0].account!.address,
      }
      await expectations.revertedWithCustomError(
        ctx.errors,
        ctx.random.write.heat([ctx.required, section, ctx.selections, true], { value: utils.sum(ctx.selections) }),
        'UnableToService',
      )
    })
    await describe('the required parameter must be', async () => {
      await it('greater than 0', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
        const section = {
          ...utils.defaultSection,
          provider: ctx.signers[0].account!.address,
        }
        await expectations.revertedWithCustomError(
          ctx.errors,
          ctx.random.write.heat([0n, section, [], true]),
          'UnableToService',
        )
      })
      await it('must have a non zero address', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
        const { selections } = await testUtils.selectPreimages(ctx)
        const section = {
          ...utils.defaultSection,
        }
        assert.equal(section.provider, zeroAddress)
        await expectations.revertedWithCustomError(
          ctx.errors,
          ctx.random.write.heat([5n, section, selections, true], { value: utils.sum(selections) }),
          'UnableToService',
        )
      })
      await it('no more than 255', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
        const { selections } = await testUtils.selectPreimages(ctx)
        const section = {
          ...utils.defaultSection,
          provider: ctx.signers[0].account!.address,
        }
        await expectations.revertedWithCustomError(
          ctx.errors,
          ctx.random.write.heat([256n, section, selections, true], { value: utils.sum(selections) }),
          'UnableToService',
        )
      })
      await it('greater than or equal to the potential locations', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
        const { selections } = await testUtils.selectPreimages(ctx)
        const section = {
          ...utils.defaultSection,
          provider: ctx.signers[0].account!.address,
        }
        await expectations.revertedWithCustomError(
          ctx.errors,
          ctx.random.write.heat([BigInt(selections.length + 1), section, selections, true], {
            value: utils.sum(selections),
          }),
          'UnableToService',
        )
      })
    })
    await describe('the duration parameters', async () => {
      await it('must equal the preimages being requested', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
        const { selections } = await testUtils.selectPreimages(ctx)
        const section = {
          ...utils.defaultSection,
          provider: ctx.signers[0].account!.address,
          duration: 1n << 39n,
        }
        await expectations.revertedWithCustomError(
          ctx.errors,
          ctx.random.write.heat([BigInt(selections.length), section, selections, true], {
            value: utils.sum(selections),
          }),
          'Misconfigured',
        )
      })
      await it('must equal the preimages being requested', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
        const { selections } = await testUtils.selectPreimages(ctx)
        const section = {
          ...utils.defaultSection,
          provider: ctx.signers[0].account!.address,
          duration: 120n,
          usesTimestamp: true,
        }
        await expectations.revertedWithCustomError(
          ctx.errors,
          ctx.random.write.heat([BigInt(selections.length), section, selections, true], {
            value: utils.sum(selections),
          }),
          'Misconfigured',
        )
      })
    })
  })
  await describe('submitting secrets', async () => {
    await describe('when to send', async () => {
      await it('can detect by checking a section via the reader', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deploy)
        const [signer] = ctx.signers
        const [provider] = ctx.randomnessProviders
        const section = {
          ...utils.defaultSection,
          provider: provider.account!.address,
        }
        const sec = {
          ...utils.defaultSection,
          provider: signer.account!.address,
        }
        const [secrets] = await utils.createTestPreimages(section)
        const subset = secrets.slice(0, 100)
        const preimages = _.map(subset, 'preimage')
        const data = concatHex(preimages)
        await testUtils.confirmTx(
          ctx,
          ctx.random.write.ink([section, data], {
            value: section.price * 100n,
          }),
        )
        await testUtils.confirmTx(
          ctx,
          ctx.random.write.heat(
            [
              2n,
              sec,
              [{ ...section }, { ...section, index: 9n }], // 0th location
              true,
            ],
            {
              value: section.price * 2n,
            },
          ),
        )
        const [len, bitmask] = await ctx.reader.read.consumed([section])
        const offset = len % 8n
        // globally shift so that our target ends up at the right most bit
        const adjusted = len - 1n + offset
        const bitList = _.range(0, Number(len)).map(
          (idx) => BigInt.asUintN(1, BigInt(bitmask) >> (adjusted - BigInt(idx))) === 1n,
        )
        const unusedCompact = _(bitList)
          .map((consumed, index) => ({
            ...section,
            index,
            consumed,
          }))
          .reject({
            consumed: true,
          })
          .value()
        assert.equal(unusedCompact.length + 2, bitList.length)
      })
      await it('can detect by checking the event', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const [selection] = ctx.selections
        const provider = await ctx.viem.getPublicClient()
        const latest = await provider.getBlock({
          blockTag: 'latest',
        })
        const events = await ctx.random.getEvents.Heat(
          {
            provider: selection.signer.account!.address,
          },
          {
            fromBlock: ctx.blockBeforeHeat.number,
            toBlock: latest.number,
          },
        )
        assert.equal(events.length >= 1, true)
      })
    })
    await describe('how to use secrets once received', async () => {
      await it('can run cast as a loop for revealing secrets', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, starts, secretByPreimage } = ctx
        const [start] = starts
        const partialSecrets = selections.map(({ preimage }, index) =>
          index === 2 ? zeroHash : (secretByPreimage.get(preimage) as Hex),
        )
        await expectations.not.emit(
          ctx,
          ctx.random.write.cast([start.args.key!, selections, partialSecrets]),
          ctx.random,
          'Cast',
        )
      })
      await it('can be written and provided via calldata but will fail if out of order', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, starts, secretByPreimage } = ctx
        const [start] = starts
        const secrets = selections.map((selection) => secretByPreimage.get(selection.preimage) as Hex)
        let shuffled = secrets
        while (_.isEqual(shuffled, secrets)) {
          shuffled = _.shuffle(shuffled)
        }
        await expectations.revertedWithCustomError(
          ctx.errors,
          ctx.random.write.cast([start.args.key!, selections, shuffled]),
          'SecretMismatch',
        )
      })
      await it('can be written and provided via calldata on chain by anyone', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, starts, secretByPreimage } = ctx
        const [start] = starts
        const secrets = selections.map((selection) => secretByPreimage.get(selection.preimage) as Hex)
        await expectations.emit(ctx, ctx.random.write.cast([start.args.key!, selections, secrets]), ctx.random, 'Cast')
      })
      await it('does not allow cast to return true twice', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, starts, secretByPreimage } = ctx
        const [start] = starts
        const secrets = selections.map((selection) => secretByPreimage.get(selection.preimage) as Hex)
        await expectations.emit(ctx, ctx.random.write.cast([start.args.key!, selections, secrets]), ctx.random, 'Cast')
        await expectations.not.emit(
          ctx,
          ctx.random.write.cast([start.args.key!, selections, secrets]),
          ctx.random,
          'Cast',
        )
      })
      await it('does allow cast to be submitted with partial secret set', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, starts, secretByPreimage } = ctx
        const [start] = starts
        const secrets = selections.map((selection) => secretByPreimage.get(selection.preimage) as Hex)
        const partialSecrets = secrets.slice(0, secrets.length - 2)
        partialSecrets.push(zeroHash, zeroHash)
        const partialTx = ctx.random.write.cast([start.args.key!, selections, partialSecrets])
        await expectations.not.emit(ctx, partialTx, ctx.random, 'Cast')
        const results = await Promise.all(
          selections.map(async (selection, index) => {
            if (partialSecrets[index] === zeroHash) return
            const section = utils.section(selection)
            await expectations.emit(ctx, partialTx, ctx.random, 'Link', {
              provider: getAddress(selection.provider),
              location: utils.location(section, selection.index),
              formerSecret: secretByPreimage.get(selection.preimage),
            })
            return true
          }),
        )
        assert.notEqual(_.compact(results).length, 0)
        await expectations.emit(ctx, ctx.random.write.cast([start.args.key!, selections, secrets]), ctx.random, 'Cast')
      })
      await it('allows you to reveal secrets without getting staked funds back', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
        const { secretBatches, preimageLocations, random } = ctx
        const [secrets] = secretBatches
        const [locations] = preimageLocations
        const [secret] = secrets
        const [location] = locations
        await expectations.not.emit(ctx, random.write.reveal([location, zeroHash]), random, 'Reveal')
        await expectations.emit(ctx, random.write.reveal([location, secret.secret]), random, 'Reveal')
      })
      await it('fails if the data pointer is set to a zero address', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, starts, secretByPreimage } = ctx
        const [start] = starts
        const secrets = selections.map((selection) => secretByPreimage.get(selection.preimage) as Hex)
        const preimages = _.map(selections, 'preimage')
        const inkTx = ctx.random.write.ink([selections[0], concatHex(preimages)], {
          value: utils.sum(selections),
        })
        const inkReceipt = await testUtils.confirmTx(ctx, inkTx)
        const [ink] = await ctx.random.getEvents.Ink(
          {},
          {
            blockHash: inkReceipt.blockHash,
          },
        )
        const wrongLocationSelections = selections.map((selection) => ({
          ...selection,
          offset: ink.args.offset!,
        }))
        await expectations.revertedWithCustomError(
          ctx.errors,
          ctx.random.write.cast([start.args.key!, wrongLocationSelections, secrets]),
          'Misconfigured',
        )
      })

      await it('fails if the location list is different', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { randomnessProviders, selections, starts, secretByPreimage } = ctx
        const [start] = starts
        const secrets = selections.map((selection) => secretByPreimage.get(selection.preimage) as Hex)
        const preimages = _.map(selections, 'preimage')
        const [firstProvider] = randomnessProviders
        const inkTx = ctx.random.write.ink(
          [
            {
              ...selections[0],
              // override here to maintain preimages under single provider
              provider: firstProvider.account!.address,
            },
            concatHex(preimages),
          ],
          {
            account: firstProvider.account!,
            value: utils.sum(selections),
          },
        )
        const inkReceipt = await testUtils.confirmTx(ctx, inkTx)
        const inkEvents = await ctx.random.getEvents.Ink(
          {},
          {
            blockHash: inkReceipt.blockHash,
          },
        )
        const [ink] = inkEvents
        const startOffset = ink.args.offset! >> 128n
        const wrongLocationSelections = selections.map((selection, index) => {
          return {
            ...selection,
            provider: firstProvider.account!.address,
            offset: startOffset,
            index: BigInt(index),
          }
        })
        await expectations.revertedWithCustomError(
          ctx.errors,
          ctx.random.write.cast([start.args.key!, wrongLocationSelections, secrets]),
          'NotInCohort',
        )
      })
      await it('can collect native token at the same time', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, signers, starts, secretByPreimage } = ctx
        const [start] = starts
        const secrets = selections.map((selection) => secretByPreimage.get(selection.preimage) as Hex)
        await expectations.changeEtherBalances(
          ctx,
          ctx.random.write.cast([start.args.key!, selections, secrets], { value: oneEther }),
          [signers[0].account!.address, ctx.random.address],
          [-oneEther, oneEther],
        )
      })
    })
    await describe('secrets provided too late', async () => {
      await it('can collect native token at the same time', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, signers, starts } = ctx
        const [start] = starts
        await networkHelpers.mine(12)
        const chopResult = ctx.random.write.chop([start.args.key!, selections], { value: oneEther })
        await expectations.changeEtherBalances(
          ctx,
          chopResult,
          [signers[0].account!.address, ctx.random.address],
          [-oneEther, oneEther],
        )
        await expectations.emit(ctx, chopResult, ctx.random, 'Chop', {
          key: start.args.key!,
        })
      })
      await it('can handle failure during reversal', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const consumer = await ctx.viem.deployContract('contracts/test/ConsumerReceiver.sol:ConsumerReceiver')
        await consumer.write.setShouldRevert([3n])
        const { selections } = await selectPreimages(ctx, Number(ctx.required), [utils.defaultSection])
        const heatTx = await ctx.random.write.heat(
          [
            ctx.required,
            { ...utils.defaultSection, provider: consumer!.address, callAtChange: true },
            selections,
            true,
          ],
          {
            value: utils.sum(selections),
          },
        )
        const receipt = await testUtils.confirmTx(ctx, heatTx)
        await networkHelpers.mine(12)
        const [start] = await ctx.random.getEvents.Start(
          {},
          {
            blockHash: receipt.blockHash,
          },
        )
        const chopResult = ctx.random.write.chop([start.args.key!, selections], { value: oneEther })
        await expectations.changeResults(
          ctx,
          chopResult,
          [consumer!.address, ctx.random.address],
          [100n * oneEther * 2n * BigInt(selections.length), 0n],
          async (opts) => {
            return await ctx.random.read.balanceOf([opts.address, zeroAddress], {
              blockNumber: opts.blockNumber,
            })
          },
        )
        await expectations.emit(ctx, chopResult, ctx.random, 'FailedToCall', {
          key: start.args.key!,
        })
        await expectations.emit(ctx, chopResult, ctx.random, 'Chop', {
          key: start.args.key!,
        })
      })
      await it('cannot call chop twice', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, signers, starts } = ctx
        const [start] = starts
        await networkHelpers.mine(12)
        const chopResult = ctx.random.write.chop([start.args.key!, selections], { value: oneEther })
        await expectations.changeEtherBalances(
          ctx,
          chopResult,
          [signers[0].account!.address, ctx.random.address],
          [-oneEther, oneEther],
        )
        await expectations.emit(ctx, chopResult, ctx.random, 'Chop', {
          key: start.args.key!,
        })
        await expectations.revertedWithCustomError(
          ctx.random,
          ctx.random.write.chop([start.args.key!, selections]),
          'UnableToService',
        )
      })
      await it('cannot call cast after chop', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, signers, starts } = ctx
        const [start] = starts
        await networkHelpers.mine(12)
        const chopResult = ctx.random.write.chop([start.args.key!, selections], { value: oneEther })
        await expectations.changeEtherBalances(
          ctx,
          chopResult,
          [signers[0].account!.address, ctx.random.address],
          [-oneEther, oneEther],
        )
        await expectations.emit(ctx, chopResult, ctx.random, 'Chop', {
          key: start.args.key!,
        })
        await expectations.revertedWithCustomError(
          ctx.random,
          ctx.random.write.cast([start.args.key!, selections, new Array(selections.length).fill(zeroHash)]),
          'UnableToService',
        )
      })
      await it('refunded tokens go back to randomness owner', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, signers, starts } = ctx
        const [provider] = ctx.randomnessProviders
        const [start] = starts
        const [signer1, signer2] = signers
        await networkHelpers.mine(12)
        await expectations.changeResults(
          ctx,
          ctx.random.write.chop([start.args.key!, selections], {
            account: signer2.account,
          }),
          [signer1, signer2, provider],
          [utils.sum(selections) * 2n, 0n, 0n],
          (opts: expectations.CheckResultOpts) =>
            ctx.random.read.balanceOf([opts.address, zeroAddress], {
              blockNumber: opts.blockNumber,
            }),
        )
      })
      await it('notification will occur when reverse is called', async () => {
        const ctx = await networkHelpers.loadFixture(async function _deployWithRandomnessAndStartReverse() {
          return await testUtils.deployWithRandomnessAndStart(
            {
              ...utils.defaultSection,
              callAtChange: true,
            },
            'consumerEmitter',
          )
        })
        const { selections, signers, starts, randomnessProviders } = ctx
        const [provider] = randomnessProviders
        const [start] = starts
        const [, signer2] = signers
        await networkHelpers.mine(12)
        const chopResult = ctx.random.write.chop([start.args.key!, selections], {
          account: signer2.account,
        })
        const amountReversed = utils.sum(selections) * 2n
        await expectations.changeResults(
          ctx,
          chopResult,
          [ctx.consumerEmitter.address, signer2, provider],
          [amountReversed, 0n, 0n],
          (opts: expectations.CheckResultOpts) =>
            ctx.random.read.balanceOf([opts.address, zeroAddress], {
              blockNumber: opts.blockNumber,
            }),
        )
        await expectations.emit(ctx, chopResult, ctx.consumerEmitter, 'Reverse', {
          key: start.args.key!,
          token: zeroAddress,
          amount: amountReversed,
        })
      })
      await it('will fail if key cannot be reconstructed', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, starts } = ctx
        const [start] = starts
        await networkHelpers.mine(12)
        let reorderedSelections = selections
        while (_.isEqual(reorderedSelections, selections)) {
          reorderedSelections = _.shuffle(reorderedSelections)
        }
        await expectations.revertedWithCustomError(
          ctx.random,
          ctx.random.write.chop([start.args.key!, reorderedSelections]),
          'NotInCohort',
        )
      })
      await it('will not refund is called before randomness has expired', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, signers, starts } = ctx
        const [signer] = signers
        const [start] = starts
        await networkHelpers.mine(11)
        const value = utils.sum(selections)
        await expectations.revertedWithCustomError(
          ctx.random,
          ctx.random.write.chop([start.args.key!, selections]),
          'UnableToService',
        )
        await networkHelpers.mine(1)
        // the revert above moved the block count forward by 1
        const chopResult = await ctx.random.write.chop([start.args.key!, selections])
        await expectations.changeResults(
          ctx,
          chopResult,
          [signer.account!.address],
          [value * 2n], // value of randomness * 2 attributed to owner
          (opts) =>
            ctx.random.read.balanceOf([opts.address, zeroAddress], {
              blockNumber: opts.blockNumber,
            }),
        )
        await expectations.emit(ctx, chopResult, ctx.random, 'Chop')
      })
      await it('will not refund if chop is after a valid cast', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, signers, starts, secretByPreimage } = ctx
        const [signer] = signers
        const [start] = starts
        await networkHelpers.mine(12)
        const secrets = selections.map((selection) => secretByPreimage.get(selection.preimage) as Hex)
        await expectations.emit(ctx, ctx.random.write.cast([start.args.key!, selections, secrets]), ctx.random, 'Cast')
        const value = utils.sum(selections)
        const chopResult = ctx.random.write.chop(
          [start.args.key!, selections],
          { value }, // just because we can
        )
        await expectations.changeEtherBalances(
          ctx,
          chopResult,
          [signer.account!.address, ctx.random.address],
          [-value, value],
        )
        await expectations.not.emit(ctx, chopResult, ctx.random, 'Chop')
      })
      await it('will only give providers half of their winnings', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections, signers, starts, secretByPreimage } = ctx
        const [, signer2] = signers
        const [start] = starts
        await networkHelpers.mine(13)
        const secrets = selections.map((selection) => secretByPreimage.get(selection.preimage) as Hex)
        const castTx = ctx.random.write.cast([start.args.key!, selections, secrets], { account: signer2.account! })
        await expectations.emit(ctx, castTx, ctx.random, 'Cast')
        await expectations.emit(ctx, castTx, ctx.random, 'Expired', {
          key: start.args.key!,
        })
      })
      await it('will still call the appropriate handler', async () => {
        const ctx = await networkHelpers.loadFixture(function deployWithRandomnessThatCallsAndStart() {
          return testUtils.deployWithRandomnessAndStart(
            {
              ...utils.defaultSection,
              callAtChange: true,
            },
            'consumerEmitter',
          )
        })
        const { selections, signers, starts, secretByPreimage } = ctx
        const [, signer2] = signers
        const [start] = starts
        await networkHelpers.mine(13)
        const secrets = selections.map((selection) => secretByPreimage.get(selection.preimage) as Hex)
        const castTx = ctx.random.write.cast([start.args.key!, selections, secrets], { account: signer2.account! })
        await expectations.emit(ctx, castTx, ctx.random, 'Cast')
        await expectations.emit(ctx, castTx, ctx.random, 'Expired', {
          key: start.args.key!,
        })
        await expectations.emit(ctx, castTx, ctx.consumerEmitter, 'Cast', {
          key: start.args.key!,
          seed: utils.toSeed(secrets),
        })
      })
    })
  })
  await describe('public signals to indicate the efficacy/health of preimages', async () => {
    await it('can call ok to signal continued efficacy', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
      const [selection] = ctx.selections
      await expectations.emit(
        ctx,
        ctx.reader.write.ok([[selection]], {
          account: ctx.randomnessProviders.find((provider) => provider.account!.address == selection.provider)!.account,
        }),
        ctx.reader,
        'Ok',
      )
    })
    await it('can only call ok for its own sections', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
      const [selection] = ctx.selections
      const [[signer], [notsigner]] = _.partition(
        ctx.randomnessProviders,
        (provider) => provider.account!.address == selection.provider,
      )
      await expectations.revertedWithCustomError(
        ctx.reader,
        ctx.reader.write.ok(
          [
            [
              selection,
              {
                ...selection,
                provider: notsigner.account!.address,
              },
            ],
          ],
          {
            account: signer!.account,
          },
        ),
        'SignerMismatch',
      )
    })
    await it('can call bleach to shut down a whole section of preimages', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
      const { randomnessProviders, selections, all } = ctx
      const [provider] = randomnessProviders
      const consumedUnder = selections.filter(
        (selection) => selection.signer.account!.address === provider.account!.address,
      )
      const allUnder = _.filter(all, { provider: provider.account!.address })
      const unused = allUnder.length - consumedUnder.length
      const bleachTx = ctx.random.write.bleach(
        [
          {
            ...utils.defaultSection,
            provider: provider.account!.address,
          },
        ],
        {
          account: provider.account!,
          value: 1n,
        },
      )
      await expectations.emit(ctx, bleachTx, ctx.random, 'Bleach')
      await expectations.changeResults(
        ctx,
        bleachTx,
        [provider.account!.address],
        [1n + BigInt(unused) * utils.defaultSection.price],
        (opts) =>
          ctx.random.read.balanceOf([opts.address, zeroAddress], {
            blockNumber: opts.blockNumber,
          }),
      )
      await expectations.changeEtherBalances(ctx, bleachTx, [provider.account!.address, ctx.random.address], [-1n, 1n])
    })
    await it('can call bleach on a pointer that does not exist, but will revert', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
      const [randomnessProvider] = ctx.randomnessProviders
      const existing = _(ctx.generatedPreimages)
        .map('preimageLocations')
        .flattenDeep()
        .reduce((highest, location) => {
          const globalIndex = location.offset + BigInt(location.index)
          return highest > globalIndex ? highest : globalIndex
        }, 0n)
      assert.equal(
        await ctx.random.read.pointer([
          {
            ...utils.defaultSection,
            provider: randomnessProvider.account!.address,
            offset: existing,
          },
        ]),
        zeroAddress,
      )
      await expectations.revertedWithCustomError(
        ctx.errors,
        ctx.random.write.bleach(
          [
            {
              ...utils.defaultSection,
              provider: randomnessProvider.account!.address,
              offset: existing,
            },
          ],
          {
            account: randomnessProvider.account!,
          },
        ),
        'Misconfigured',
      )
    })
    await it('cannot call bleach for other providers', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
      const [randomnessProvider, rp2] = ctx.randomnessProviders
      const existing = _(ctx.generatedPreimages)
        .map('preimageLocations')
        .flattenDeep()
        .reduce((highest, location) => {
          const globalIndex = location.offset + BigInt(location.index)
          return highest > globalIndex ? highest : globalIndex
        }, 0n)
      assert.notEqual(
        await ctx.random.read.pointer([
          {
            ...utils.defaultSection,
            provider: randomnessProvider.account!.address,
          },
        ]),
        zeroAddress,
      )
      await expectations.revertedWithCustomError(
        ctx.errors,
        ctx.random.write.bleach(
          [
            {
              ...utils.defaultSection,
              provider: randomnessProvider.account!.address,
              offset: existing,
            },
          ],
          {
            account: rp2.account!,
          },
        ),
        'SignerMismatch',
      )
    })
    await it('can call bleach for a partialy consumed section', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deploy)
      const { randomnessProviders } = ctx
      const section = utils.defaultSection
      const [secretGroup] = await utils.createTestPreimages(section)

      const baselineRequired = 5
      const maxSecretSet = 32
      const secrets = secretGroup.slice(0, maxSecretSet)
      const iterations = _.range(0, maxSecretSet - baselineRequired)
      const preimages = _.map(secrets, 'preimage')
      const [provider] = randomnessProviders
      const bytecode = concatHex(preimages)
      const template = {
        ...utils.defaultSection,
        provider: provider.account!.address,
      }
      // ink the same series of preimages over multiple pointers (bad)
      await utils.limiters.range.map(iterations, async () => {
        await ctx.random.write.ink([template, bytecode], {
          account: provider.account!,
          value: utils.defaultSection.price * BigInt(preimages.length),
        })
      })
      // const used = new Map<number, utils.PreimageInfo>()
      await utils.limiters.range.map(iterations, async (i) => {
        const required = baselineRequired + i
        const offset = BigInt(preimages.length) * BigInt(i)
        const shuffled = _.shuffle(secrets).slice(0, required)
        const locations = shuffled.map((sec) => ({
          ...template,
          offset,
          index: sec.index,
        }))
        // console.log(locations.map((l) => l.index))
        // locations.forEach((location) => {
        //   const globalIdx = location.offset + location.index
        //   if (used.has(Number(globalIdx))) {
        //     console.log(location, used.get(Number(globalIdx)))
        //     throw new Error("duplicate")
        //   }
        //   console.log(globalIdx)
        //   used.set(Number(globalIdx), location)
        // })
        await ctx.random.write.heat([BigInt(required), template, locations, true], {
          value: utils.defaultSection.price * BigInt(required),
        })
      })
      await utils.limiters.range.map(iterations, async (i) => {
        const required = BigInt(baselineRequired) + BigInt(i)
        const offset = BigInt(preimages.length) * BigInt(i)
        const section = {
          ...template,
          offset,
          index: 0n,
        }
        const bleach = ctx.random.write.bleach([section], {
          account: provider.account!,
        })
        await expectations.emit(ctx, bleach, ctx.random, 'Bleach', {
          provider: getAddress(template.provider),
          section: utils.section(section),
        })
        await expectations.changeResults(
          ctx,
          bleach,
          [provider],
          [(BigInt(preimages.length) - required) * template.price],
          (opts) =>
            ctx.random.read.balanceOf([opts.address, template.token], {
              blockNumber: opts.blockNumber,
            }),
        )
        if (!i) {
          await expectations.not.emit(
            ctx,
            ctx.random.write.bleach([section], {
              account: provider.account!,
            }),
            ctx.random,
            'Bleach',
          )
        }
      })
      // await promiseLimit<number>(1).map(iterations, async () => {
      //   const bleachTx = ctx.random.write.bleach([{
      //     ...utils.defaultSection,
      //     provider: provider.account!.address,
      //   }], {
      //     account: provider.account!,
      //     value: 1n,
      //   })
      //   await expectations.emit(ctx, bleachTx, ctx.random, 'Bleach')
      //   await expectations.changeResults(ctx, bleachTx,
      //     [provider.account!.address],
      //     [1n + (BigInt(unused) * utils.defaultSection.price)],
      //     (opts) => ctx.random.read.balanceOf([opts.address, zeroAddress], {
      //       blockNumber: opts.blockNumber,
      //     })
      //   )
      //   await expectations.changeEtherBalances(ctx, bleachTx,
      //     [provider.account!.address, ctx.random.address],
      //     [-1n, 1n],
      //   )
      // })
      // const consumedCount = selections.filter((selection) => (
      //   selection.signer.account!.address === provider.account!.address
      // )).length
      // const unused = _.filter(all, { provider: provider.account!.address }).length - consumedCount
    })
  })
  await describe('token custody', async () => {
    await it('must pass the value as a parameter', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
      await expectations.revertedWithCustomError(
        ctx.errors,
        ctx.random.write.handoff([zeroAddress, zeroAddress, -oneEther], {
          value: oneEther - 1n,
        }),
        'MissingPayment',
      )
    })
    await it('custodies tokens in the contract', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
      await expectations.changeEtherBalances(
        ctx,
        ctx.random.write.handoff([zeroAddress, zeroAddress, -oneEther], {
          value: oneEther,
        }),
        [ctx.signers[0].account!.address, ctx.random.address],
        [-oneEther, oneEther],
      )
      // tries to remove 1 ether, succeeds
      await expectations.changeEtherBalances(
        ctx,
        ctx.random.write.handoff([zeroAddress, zeroAddress, oneEther]),
        [ctx.signers[0].account!.address, ctx.random.address],
        [oneEther, -oneEther],
      )
    })
    await it('cannot remove more tokens than allotted', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
      // tries to remove 1 ether, fails
      await expectations.changeEtherBalances(
        ctx,
        ctx.random.write.handoff([zeroAddress, zeroAddress, oneEther]),
        [ctx.signers[0].account!.address],
        [0n],
      )
    })
  })
  await describe('view functions', async () => {
    await describe('#balanceOf', async () => {
      await it('checks the balance of an account and the tokens held in that account', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
        const { selections } = await testUtils.selectPreimages(ctx)
        const [signer] = ctx.signers
        const section = {
          ...utils.defaultSection,
          provider: signer.account!.address,
        }
        await expectations.emit(
          ctx,
          ctx.random.write.heat([5n, section, selections, true], {
            value: utils.sum(selections) + oneEther,
          }),
          ctx.random,
          'Heat',
        )
        assert.equal(await ctx.random.read.balanceOf([signer.account!.address, zeroAddress]), oneEther)
      })
    })
    await describe('#expired', async () => {
      await it('checks if the randomness is past the expired threshold set at the start', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { starts } = ctx
        const [start] = starts
        const latest = await networkHelpers.time.latestBlock()
        await networkHelpers.mine(12 - (latest - Number(start.blockNumber))) // the number that was passed in the tx (in last block)
        const r = await ctx.random.read.randomness([start.args.key!])
        assert.equal(await ctx.random.read.expired([r.timeline]), false)
        await networkHelpers.mine(1)
        assert.equal(await ctx.random.read.expired([r.timeline]), true)
      })
      await it('can handle time deltas in addition to block deltas', async () => {
        const ctx = await networkHelpers.loadFixture(async function deployWithRandomnessAndStartOneOff() {
          // one-off to modify the randomness values
          return await testUtils.deployWithRandomnessAndStart({
            ...utils.defaultSection,
            usesTimestamp: true,
            duration: 120n,
          })
        })
        const { signers } = ctx
        const [signer] = signers
        const { selections } = await testUtils.selectPreimages(ctx, 5, [
          {
            ...utils.defaultSection,
            usesTimestamp: true,
            duration: 120n,
          },
        ])
        const required = 5n
        const section = {
          ...utils.defaultSection,
          usesTimestamp: true,
          duration: 120n,
          provider: signer.account!.address,
        }
        const heatTx = await ctx.random.write.heat([required, section, selections, true], {
          value: utils.sum(selections),
        })
        const receipt = await testUtils.confirmTx(ctx, heatTx)
        const starts = await ctx.random.getEvents.Start(
          {},
          {
            blockHash: receipt.blockHash,
          },
        )
        const provider = await ctx.viem.getPublicClient()
        const block = await provider.getBlock({
          blockHash: receipt.blockHash,
        })
        const [start] = starts
        const lastNonExpiredSecond = Number(block.timestamp + 120n)
        await networkHelpers.time.setNextBlockTimestamp(lastNonExpiredSecond) // the number that was passed in the tx (in last block)
        await networkHelpers.mine(1)
        const r = await ctx.random.read.randomness([start.args.key!])
        assert.equal(await ctx.random.read.expired([r.timeline]), false)
        await networkHelpers.time.setNextBlockTimestamp(lastNonExpiredSecond + 1)
        await networkHelpers.mine(1)
        assert.equal(await ctx.random.read.expired([r.timeline]), true)
      })
    })
    await describe('#consumed', async () => {
      await it('checks if a preimage at a particular location has been consumed', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { all, selections } = await testUtils.selectPreimages(ctx)
        assert.equal(await ctx.random.read.consumed([ctx.selections[0]]), true)
        const notConsumed = all.find((item) => !selections.includes(item))!
        assert.equal(await ctx.random.read.consumed([notConsumed]), false)
      })
      await it('fails if the index is outside of the section size', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { selections } = await testUtils.selectPreimages(ctx)
        const [selection] = selections
        assert.equal(
          await ctx.random.read.consumed([
            {
              ...selection,
              index: 766n, // uses index, so length - 1
            },
          ]),
          false,
        )
        await expectations.revertedWithCustomError(
          ctx.errors,
          ctx.random.read.consumed([
            {
              ...selection,
              index: 767n,
            },
          ]),
          'Misconfigured',
        )
      })
    })
    await describe('#randomness', async () => {
      await it('returns randomness struct', async () => {
        const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
        const { starts } = ctx
        const [start] = starts
        const latest = await networkHelpers.time.latestBlock()
        const timeline = utils.timeline.encode({
          owner: start.args.owner!,
          callAtChange: false,
          usesTimestamp: false,
          duration: 12n,
          start: BigInt(latest),
        })
        // const timeline = (BigInt(start.args.owner!) << 96n) | (BigInt(latest) << 48n) | (12n << 9n)
        assert.deepEqual(await ctx.random.read.randomness([start.args.key!]), {
          ...utils.timeline.parse(BigInt(timeline)),
          timeline: BigInt(timeline),
          seed: zeroHash,
        })
      })
    })
  })
  await describe('tokens', async () => {
    await it('can take tokens as payment', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
      const { signers } = ctx
      const { selections } = await testUtils.selectPreimages(ctx)
      const [signer] = signers
      const required = 5n
      const expectedUsed = selections.slice(0, Number(required))
      const expectedEmitArgs = expectedUsed.map((parts) => ({
        provider: getAddress(parts.provider),
        section: utils.section(parts),
        index: parts.index,
      }))
      const section = {
        ...utils.defaultSection,
        provider: signer.account!.address,
      }
      await expectations.emit(
        ctx,
        ctx.random.write.heat([required, section, selections, true], { value: utils.sum(selections) }),
        ctx.random,
        'Heat',
        expectedEmitArgs,
      )
    })
    await it('can deposit and withdraw tokens', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
      const [signer] = ctx.signers
      await expectations.changeTokenBalances(
        ctx,
        ctx.ERC20,
        ctx.random.write.handoff([signer.account!.address, ctx.ERC20.address, -oneEther]),
        [signer.account!.address, ctx.random.address],
        [-oneEther, oneEther],
      )
      await expectations.changeTokenBalances(
        ctx,
        ctx.ERC20,
        ctx.random.write.handoff([zeroAddress, ctx.ERC20.address, oneEther]),
        [signer.account!.address, ctx.random.address],
        [oneEther, -oneEther],
      )
    })
    await it('passing zero is equivalent to using the whole balance', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
      const [signer] = ctx.signers
      await expectations.changeTokenBalances(
        ctx,
        ctx.ERC20,
        ctx.random.write.handoff([signer.account!.address, ctx.ERC20.address, -oneEther]),
        [signer.account!.address, ctx.random.address],
        [-oneEther, oneEther],
      )
      await expectations.changeTokenBalances(
        ctx,
        ctx.ERC20,
        ctx.random.write.handoff([zeroAddress, ctx.ERC20.address, oneEther]),
        [signer.account!.address, ctx.random.address],
        [oneEther, -oneEther],
      )
    })
    await it('can deposit and withdraw tax tokens', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndStart)
      const [signer] = ctx.signers
      const taxRatio = await ctx.TAXERC20.read.taxRatio()
      const tax = (amount: bigint) => (amount * taxRatio) / oneEther
      let amountIn = oneEther
      let afterTax = tax(amountIn)
      await expectations.changeTokenBalances(
        ctx,
        ctx.taxERC20,
        ctx.random.write.handoff([signer.account!.address, ctx.taxERC20.address, -amountIn]),
        [signer.account!.address, ctx.random.address],
        [-amountIn, afterTax],
      )
      amountIn = afterTax
      afterTax = tax(amountIn)
      await expectations.changeTokenBalances(
        ctx,
        ctx.taxERC20,
        ctx.random.write.handoff([zeroAddress, ctx.taxERC20.address, amountIn]),
        [signer.account!.address, ctx.random.address],
        [afterTax, -amountIn],
      )
    })
  })
  await describe('multicalling', async () => {
    await it('starts with id of zero', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
      assert.equal(await ctx.consumer.read.latestId(), 0n)
    })
    await it('can understand multicaller with sender calls', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { multicallTx, handoffValue, signer } = ctx
      await expectations.changeEtherBalances(
        ctx,
        multicallTx,
        [signer.account!.address, ctx.multicallerWithSender.address, ctx.random.address],
        [-handoffValue, 0n, handoffValue],
      )
      await expectations.emit(ctx, multicallTx, ctx.random, 'Heat', ctx.expectedEmitArgs)
      await expectations.emit(ctx, multicallTx, ctx.consumer, 'Chain', {
        owner: padHex(signer.account!.address, { size: 32 }),
      })
    })
    await it('will fail if sameTx flag is passed', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { multicallTx, signers } = ctx
      const [, signer2] = signers
      await testUtils.confirmTx(ctx, multicallTx)
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      await expectations.revertedWithCustomError(
        ctx.random,
        ctx.consumer.write.chain([signer2.account!.address, true, true, false, s.preimage]),
        'UnableToService',
      )
    })
    await it('will pass if same tx flag is passed and a transaction was previously used', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
      const { signers } = ctx
      const [, signer2] = signers

      const { selections } = await selectPreimages(ctx, Number(ctx.required), [utils.defaultSection])
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      await ctx.multicallerWithSender.write.aggregateWithSender(
        [
          [ctx.random.address, ctx.consumer.address],
          [
            encodeFunctionData({
              abi: ctx.random.abi,
              functionName: 'heat',
              args: [5n, { ...utils.defaultSection, provider: signer2.account!.address }, selections, false],
            }),
            encodeFunctionData({
              abi: ctx.consumer.abi,
              functionName: 'chain',
              args: [signer2.account!.address, true, false, false, s.preimage],
            }),
          ],
          [utils.sum(selections), 0n],
        ],
        {
          value: utils.sum(selections),
        },
      )
    })
    await it('will pass if false is passed for sameTx flag', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { multicallTx, signers, multicallSecret } = ctx
      const [signer, signer2] = signers
      await testUtils.confirmTx(ctx, multicallTx)
      const starts = await ctx.random.getEvents.Start()
      const [start] = starts
      const latestId = await ctx.consumer.read.latestId()
      await expectations.emit(
        ctx,
        ctx.consumer.write.chain([signer.account!.address, false, true, false, multicallSecret.preimage], {
          account: signer2.account!,
        }),
        ctx.consumer,
        'Chain',
        {
          owner: padHex(signer2.account!.address, { size: 32 }),
          id: latestId + 1n,
          key: start.args.key!,
        },
      )
    })
    await it('will pass if only latest is desired (security implications due to possibility of secret reveals)', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { multicallTx, signers } = ctx
      const [signer, signer2] = signers
      await testUtils.confirmTx(ctx, multicallTx)
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      const latestId = await ctx.consumer.read.latestId()
      await expectations.emit(
        ctx,
        ctx.consumer.write.chain([signer.account!.address, false, true, false, s.preimage], {
          account: signer2.account!,
        }),
        ctx.consumer,
        'Chain',
        {
          owner: padHex(signer2.account!.address, { size: 32 }),
          id: latestId + 1n,
        },
      )
    })
    await it('can chain onto other keys', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { multicallTx, signers } = ctx
      const [, signer2] = signers
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      const [start] = await ctx.random.getEvents.Start()
      const latestId = await ctx.consumer.read.latestId()
      await testUtils.confirmTx(ctx, multicallTx)
      await expectations.emit(
        ctx,
        ctx.consumer.write.chainTo([signer2.account!.address, false, s.preimage, start.args.key!]),
        ctx.consumer,
        'Chain',
        {
          owner: padHex(signer2.account!.address, { size: 32 }),
          id: latestId + 1n,
        },
      )
    })
    await it('errs if zero preimage is provided', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
      await expectations.revertedWithCustomError(
        ctx.consumer,
        ctx.consumer.write.chainTo([zeroAddress, false, zeroHash, zeroHash]),
        'Misconfigured',
      )
    })
    await it('errs if zero key is provided', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
      await expectations.revertedWithCustomError(
        ctx.consumer,
        ctx.consumer.write.chain([zeroAddress, false, true, false, zeroHash]),
        'Misconfigured',
      )
    })
    await it('errs if zero secret is provided', async () => {
          const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
      await expectations.revertedWithCustomError(
        ctx.consumer,
        ctx.consumer.write.chainTo([zeroAddress, false, keccak256(zeroHash), zeroHash]),
        'Misconfigured',
      )
    })
    await it('errs if zero secret is provided', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
      await expectations.revertedWithCustomError(
        ctx.consumer,
        ctx.consumer.write.chainTo([zeroAddress, false, keccak256(zeroHash), zeroHash]),
        'Misconfigured',
      )
    })
    await it('gets the "link" info created by the chain methods', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { multicallTx, signers } = ctx
      const [, signer2] = signers
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      const [start] = await ctx.random.getEvents.Start()
      await testUtils.confirmTx(ctx, multicallTx)
      const latestId = (await ctx.consumer.read.latestId()) + 1n
      assert.deepEqual(await ctx.consumer.read.link([latestId]), {
        id: 0n,
        key: zeroHash,
        owner: zeroAddress,
        preimage: zeroHash,
        revealed: zeroHash,
        underminable: false,
      })
      await expectations.emit(
        ctx,
        ctx.consumer.write.chainTo([signer2.account!.address, false, s.preimage, start.args.key!]),
        ctx.consumer,
        'Chain',
        {
          owner: padHex(signer2.account!.address, { size: 32 }),
          id: latestId,
        },
      )
      assert.deepEqual(await ctx.consumer.read.link([latestId]), {
        id: latestId,
        key: start.args.key!,
        owner: getAddress(signer2.account!.address),
        preimage: s.preimage,
        revealed: zeroHash,
        underminable: false,
      })
    })
    await it('duplicate inputs for the same owner and preimage', async () => {
      const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomnessAndConsume)
      const { signers } = ctx
      const [, signer2] = signers
      const [[s]] = await utils.createTestPreimages({
        ...utils.defaultSection,
        provider: signer2.account!.address,
      })
      const [start] = await ctx.random.getEvents.Start()
      const latestId = await ctx.consumer.read.latestId()
      await expectations.emit(
        ctx,
        ctx.consumer.write.chainTo([signer2.account!.address, false, s.preimage, start.args.key!]),
        ctx.consumer,
        'Chain',
        {
          owner: padHex(signer2.account!.address, { size: 32 }),
          id: latestId + 1n,
        },
      )
      await expectations.not.emit(
        ctx,
        ctx.consumer.write.chainTo([signer2.account!.address, false, s.preimage, start.args.key!]),
        ctx.consumer,
        'Chain',
        {
          owner: padHex(signer2.account!.address, { size: 32 }),
        },
      )
    })
  })
})
