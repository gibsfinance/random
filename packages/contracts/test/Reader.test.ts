import _ from 'lodash'
import assert from 'node:assert/strict';

import * as utils from '../lib/utils.js'
import * as expectations from './expectations.js'
import * as testUtils from './utils.js'
import { describe, it } from 'node:test'

describe('Reader', async () => {
  const { networkHelpers } = await testUtils.connect()
  await it('can read single preimages', async () => {
    const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
    const [secrets] = ctx.secretBatches
    const [s] = secrets
    const [provider] = ctx.randomnessProviders

    assert.equal(
      await ctx.reader.read.at([
        {
          ...utils.defaultSection,
          provider: provider.account!.address,
          index: 0n,
        },
      ]),
      s.preimage,
    )
  })
  await it('cannot read out of bounds', async () => {
    const ctx = await networkHelpers.loadFixture(testUtils.deployWithRandomness)
    const [secrets] = ctx.secretBatches
    const [provider] = ctx.randomnessProviders
    await expectations.revertedWithCustomError(
      ctx.reader,
      ctx.reader.read.at([
        {
          ...utils.defaultSection,
          provider: provider.account!.address,
          index: BigInt(secrets.length), // an off by 1 error
        },
      ]),
      'IndexOutOfBounds',
    )
  })
})
