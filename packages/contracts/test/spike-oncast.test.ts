import * as utils from '../lib/utils'
import * as viem from 'viem'
import _ from 'lodash'
import { expect } from 'chai'
import * as helpers from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import * as expectations from './expectations'
import * as testUtils from './utils'

/**
 * INTEGRATION SPIKE — onCast wiring for the periphery CoinFlip contract.
 *
 * Proves the exact gibsfinance/random call shapes (ink / heat / cast / onCast)
 * that the CoinFlip contract depends on. This is a documenting integration test;
 * it will be retired once the CoinFlip settlement test subsumes it.
 *
 * Vocabulary (per the design): ink = publish a contract-full-of-preimages (commit);
 * heat = select preimages for a request (returns key); cast = reveal secrets -> seed.
 */
describe('spike: onCast integration', () => {
  // The well-known "walk-away" preimage: secret = 32 zero bytes, whose keccak256
  // is publicly computable so any validator can reveal it on a stalled player's behalf.
  const walkAwaySecret = viem.zeroHash
  const walkAwayPreimage = viem.keccak256(viem.zeroHash)

  /**
   * Case A — minimal onCast callback.
   *
   * Drives a price-0 heat OWNED by ctx.consumerEmitter with callAtChange=true,
   * using validator preimages from the fixture pool, then casts and asserts the
   * owner's onCast callback fired and the seed is set.
   */
  it('A: fires onCast on the owner after cast (price-0 pool)', async () => {
    const section = { ...utils.defaultSection, price: 0n }
    // deployWithRandomness(section) re-inks every randomness provider's pool AT THIS
    // section (price 0), so selectPreimages(.., [section]) returns price-0 preimages.
    const ctx = await helpers.loadFixture(async function deployA() {
      return await testUtils.deployWithRandomness(section)
    })
    const receiver = ctx.consumerEmitter

    const { selections } = await testUtils.selectPreimages(ctx, Number(ctx.required), [section])
    expect(selections.length).to.equal(Number(ctx.required))
    // sanity: every selected location is price 0
    expect(selections.every((s) => s.price === 0n)).to.equal(true)

    const secrets = selections.map((s) => ctx.secretByPreimage.get(s.preimage) as viem.Hex)
    expect(secrets.every((s) => !!s)).to.equal(true)

    // settings.provider IS the owner that receives onCast; callAtChange enables the callback.
    const settings = { ...section, provider: receiver.address, callAtChange: true }

    const heatTx = await ctx.random.write.heat([ctx.required, settings, selections, false], { value: 0n })
    const receipt = await testUtils.confirmTx(ctx, heatTx)

    const [start] = await ctx.random.getEvents.Start({}, { blockHash: receipt.blockHash })
    expect(viem.getAddress(start!.args.owner!)).to.equal(viem.getAddress(receiver.address))
    const key = start!.args.key!

    // cast info order MUST match the heated selection order (key = hash of locations in order).
    await expectations.emit(
      ctx,
      ctx.random.write.cast([key, selections, secrets]),
      receiver,
      'Cast',
      { key },
    )

    const seed = (await ctx.random.read.randomness([key])).seed
    expect(seed).to.not.equal(viem.zeroHash)
  })

  /**
   * Case B — THE LOAD-BEARING ONE: fresh dual-ink + combined heat.
   *
   * Mirrors CoinFlip._pairAndHeat: ink TWO player preimages in one batch at price 0
   * under one provider, ink N validator preimages at price 0 under a different
   * provider, then heat all (2 player + 3 validator) in one selection owned by the
   * receiver with callAtChange=true, and cast all 5.
   */
  it('B: dual-ink players + validators, combined heat, cast settles', async () => {
    const ctx = await helpers.loadFixture(testUtils.deploy)
    const receiver = ctx.consumerEmitter

    const rand = await ctx.hre.viem.getContractAt(utils.contractName.Random, ctx.random.address)

    // ---- 1) Ink TWO player preimages in ONE batch, price 0, provider = a signer ----
    // Both player secrets are NON-ZERO managed secrets. (A zeroHash "walk-away" secret
    // does NOT settle through cast — see Case C for the proof of that limitation.)
    const playerSigner = ctx.signers[0]
    const playerProvider = playerSigner.account!.address
    const playerSection = {
      ...utils.defaultSection,
      provider: playerProvider,
      price: 0n,
      offset: 0n,
    }
    const playerBatch = (await utils.createTestPreimages(playerSection, 2n))[0]!
    const playerPreimages: viem.Hex[] = playerBatch.map((s) => s.preimage)

    // ink(info, data): info supplies provider/token/price/offset which place the pointer
    // at _pointers[provider][encodedToken][price][offset]; the index field is ignored on
    // write. data = concat of the 32-byte preimages, in order; they land at indices 0..n-1.
    // price 0 ⇒ value 0.
    await testUtils.confirmTx(
      ctx,
      rand.write.ink([{ ...playerSection, index: 0n }, viem.concatHex(playerPreimages)], {
        account: playerSigner.account!,
        value: 0n,
      }),
    )

    // ---- 2) Ink 3 validator preimages, price 0, DIFFERENT provider (no offset collision) ----
    const validatorSigner = ctx.randomnessProviders[0]
    const validatorProvider = validatorSigner.account!.address
    const validatorSection = {
      ...utils.defaultSection,
      provider: validatorProvider,
      price: 0n,
      offset: 0n,
    }
    const validatorCount = 3n
    const validatorBatch = (await utils.createTestPreimages(validatorSection, validatorCount))[0]!
    const validatorPreimages = validatorBatch.map((s) => s.preimage)

    await testUtils.confirmTx(
      ctx,
      rand.write.ink([{ ...validatorSection, index: 0n }, viem.concatHex(validatorPreimages)], {
        account: validatorSigner.account!,
        value: 0n,
      }),
    )

    // ---- 3) Build the heat selection: 2 player + 3 validator locations ----
    // Each location carries the REAL preimage provider; offset/index address the
    // specific preimage inside that provider's pointer (offset 0, index 0..n-1).
    const playerLocations = [
      { ...playerSection, index: 0n },
      { ...playerSection, index: 1n },
    ]
    const validatorLocations = validatorBatch.map((_s, i) => ({
      ...validatorSection,
      index: BigInt(i),
    }))
    const selection = [...playerLocations, ...validatorLocations]
    expect(selection.length).to.equal(Number(ctx.required))

    // secrets MUST be positionally aligned with `selection` (cast matches revealed[i] -> info[i]).
    const secrets: viem.Hex[] = [
      ...playerBatch.map((s) => s.secret as viem.Hex),
      ...validatorBatch.map((s) => s.secret as viem.Hex),
    ]

    // settings.provider = receiver (owner -> onCast target); callAtChange=true required.
    // settings.token/price/duration must be compatible with the locations: token must
    // match all locations (zeroAddress), and settings.duration must be >= each location's.
    const settings = {
      ...utils.defaultSection,
      provider: receiver.address,
      callAtChange: true,
      price: 0n,
    }

    const heatTx = await ctx.random.write.heat([ctx.required, settings, selection, false], { value: 0n })
    const receipt = await testUtils.confirmTx(ctx, heatTx)

    const [start] = await ctx.random.getEvents.Start({}, { blockHash: receipt.blockHash })
    expect(viem.getAddress(start!.args.owner!)).to.equal(viem.getAddress(receiver.address))
    const key = start!.args.key!

    // ---- 4) Cast all 5 — info order MUST equal the heat selection order ----
    // (key = keccak256 of the location hashes in selection order; cast recomputes the
    // same hash from `info` and reverts NotInCohort if the order/content differs.)
    await expectations.emit(
      ctx,
      ctx.random.write.cast([key, selection, secrets]),
      receiver,
      'Cast',
      { key },
    )

    // ---- 5) onCast fired (asserted above) AND seed set ----
    const seed = (await ctx.random.read.randomness([key])).seed
    expect(seed).to.not.equal(viem.zeroHash)
  })

  /**
   * Case C — documents the walk-away limitation.
   *
   * The well-known walk-away (secret = zeroHash, preimage = keccak256(zeroHash)) CANNOT
   * settle a flip through cast(): cast treats revealed[i] == bytes32(0) as "secret not
   * supplied" and falls back to a stored secret; since the walk-away secret IS zero, that
   * fallback also yields zero, so cast returns MISSING_SECRET and the seed never sets —
   * even after a prior reveal() (the stored revealed secret is itself zero). The CoinFlip
   * design must therefore require every player to commit a NON-ZERO secret (a validator
   * can still cast a publicly-known non-zero secret on a stalled player's behalf).
   */
  it('C: zeroHash walk-away secret does NOT settle (MISSING_SECRET)', async () => {
    const ctx = await helpers.loadFixture(testUtils.deploy)
    const receiver = ctx.consumerEmitter
    const rand = await ctx.hre.viem.getContractAt(utils.contractName.Random, ctx.random.address)

    const playerSigner = ctx.signers[0]
    const playerSection = { ...utils.defaultSection, provider: playerSigner.account!.address, price: 0n, offset: 0n }
    // player[0] managed, player[1] = walk-away (zeroHash secret).
    const playerManaged = (await utils.createTestPreimages(playerSection, 1n))[0]![0]!
    const playerPreimages: viem.Hex[] = [playerManaged.preimage, walkAwayPreimage]
    await testUtils.confirmTx(
      ctx,
      rand.write.ink([{ ...playerSection, index: 0n }, viem.concatHex(playerPreimages)], {
        account: playerSigner.account!,
        value: 0n,
      }),
    )

    const validatorSigner = ctx.randomnessProviders[0]
    const validatorSection = { ...utils.defaultSection, provider: validatorSigner.account!.address, price: 0n, offset: 0n }
    const validatorBatch = (await utils.createTestPreimages(validatorSection, 3n))[0]!
    await testUtils.confirmTx(
      ctx,
      rand.write.ink([{ ...validatorSection, index: 0n }, viem.concatHex(validatorBatch.map((s) => s.preimage))], {
        account: validatorSigner.account!,
        value: 0n,
      }),
    )

    const selection = [
      { ...playerSection, index: 0n },
      { ...playerSection, index: 1n },
      ...validatorBatch.map((_s, i) => ({ ...validatorSection, index: BigInt(i) })),
    ]
    const secrets: viem.Hex[] = [
      playerManaged.secret as viem.Hex,
      walkAwaySecret, // zeroHash — the sentinel collision
      ...validatorBatch.map((s) => s.secret as viem.Hex),
    ]
    const settings = { ...utils.defaultSection, provider: receiver.address, callAtChange: true, price: 0n }

    const receipt = await testUtils.confirmTx(
      ctx,
      ctx.random.write.heat([ctx.required, settings, selection, false], { value: 0n }),
    )
    const [start] = await ctx.random.getEvents.Start({}, { blockHash: receipt.blockHash })
    const key = start!.args.key!

    // Even pre-revealing the zero secret does not help: the stored revealed secret is zero.
    await testUtils.confirmTx(
      ctx,
      rand.write.reveal([{ ...playerSection, index: 1n }, walkAwaySecret], { account: playerSigner.account! }),
    )

    const castReceipt = await testUtils.confirmTx(ctx, ctx.random.write.cast([key, selection, secrets]))
    // cast did NOT emit Cast and the seed remains zero (MISSING_SECRET).
    const casts = await ctx.random.getEvents.Cast({}, { blockHash: castReceipt.blockHash })
    expect(casts.length).to.equal(0)
    const seed = (await ctx.random.read.randomness([key])).seed
    expect(seed).to.equal(viem.zeroHash)
  })
})
