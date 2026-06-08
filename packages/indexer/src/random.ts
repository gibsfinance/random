import { ponder } from 'ponder:registry'
import * as schema from 'ponder:schema'
import { and, eq, lt } from 'ponder'
import * as viem from 'viem'
import * as randomUtils from '@gibs/random/lib/utils'
import { abi as randomAbi } from '@gibs/random/artifacts/contracts/Random.sol/Random.json'
import { scopedId, upsertBlock, upsertTransaction } from './utils'

/** The decoded shape of an `ink(info, data)` call's first argument. */
type InkSectionInput = {
  provider: viem.Hex
  callAtChange: boolean
  usesTimestamp: boolean
  duration: bigint
  token: viem.Hex
  price: bigint
  offset: bigint
  index: bigint
}

// Index provider preimage commitments from the Ink event. The event carries
// {sender, provider, section, offset, pointer}; the section parameters (token, price,
// duration, ...) and the raw preimage bytes are NOT in the event — but they are in the
// transaction's calldata, `ink(info, data)`. Decoding event.transaction.input recovers
// everything the original call-trace handler did, with no call traces and no trace-capable
// RPC, so it indexes full history on an ordinary archive endpoint.
//
// On chain 943 every ink is a direct top-level ink() call. If ink is ever invoked
// indirectly (e.g. wrapped in a multicaller aggregate), event.transaction.input decodes to
// the wrapper instead; such inks are skipped with a warning rather than mis-indexed.
ponder.on('Random:Ink', async ({ event, context }) => {
  const { sender, provider, section, offset: packedOffset, pointer } = event.args

  const decoded = (() => {
    try {
      return viem.decodeFunctionData({ abi: randomAbi as viem.Abi, data: event.transaction.input })
    } catch {
      return null
    }
  })()
  if (!decoded) {
    console.warn(`Random:Ink ${section}: transaction input did not decode; skipping`)
    return
  }
  if (decoded.functionName !== 'ink') {
    console.warn(`Random:Ink ${section}: ink invoked via ${decoded.functionName}, not a direct call; skipping`)
    return
  }
  const [sectionInput, data] = decoded.args as unknown as [InkSectionInput, viem.Hex]

  // The contract assigns the real storage offset: the high 128 bits of the packed event
  // offset hold `start`, the low 128 bits hold `start + count`.
  const offset = BigInt.asUintN(128, packedOffset >> 128n)
  const info = { ...sectionInput, provider, offset }
  // The section we reconstruct from the call inputs must match the one the contract emitted.
  if (randomUtils.section(info) !== section) {
    console.warn(`Random:Ink ${section}: reconstructed section mismatch; skipping`)
    return
  }

  const preimages = randomUtils.dataToPreimages(data)
  const template = randomUtils.template(info)
  const pointerId = scopedId.pointer(context, section)
  const inkId = scopedId.ink(context, section)

  await upsertBlock(context, event)
  const tx = await upsertTransaction(context, event)

  await context.db.insert(schema.Pointer).values({
    orderId: pointerId,
    section,
    template,
    remaining: BigInt(preimages.length),
    count: BigInt(preimages.length),
    storage: pointer,
    lastOkTransactionId: tx.orderId,
    provider,
    token: sectionInput.token,
    price: sectionInput.price,
    duration: sectionInput.duration,
    usesTimestamp: sectionInput.usesTimestamp,
    callAtChange: sectionInput.callAtChange,
    offset,
    chainId: BigInt(context.chain.id),
    address: context.contracts.Random.address,
    inkId,
  })

  await context.db.insert(schema.Preimage).values(
    preimages.map((preimage, index) => ({
      orderId: scopedId.preimage(context, randomUtils.location(section, index)),
      pointerId,
      index: BigInt(index),
      template,
      section,
      accessed: false,
      data: preimage,
    })),
  )

  await context.db.insert(schema.Ink).values({
    orderId: inkId,
    transactionId: tx.orderId,
    pointerId,
    section,
    sender,
    index: BigInt(event.transaction.transactionIndex),
  })
})

ponder.on('Random:Heat', async ({ event, context }) => {
  const {
    // unused outside of indexers scoping their
    // get logs queries to the provider
    // provider,
    section,
    index,
  } = event.args
  const pointerId = scopedId.pointer(context, section)

  const pointer = await context.db.find(schema.Pointer, {
    orderId: pointerId,
  })
  const localIndex = index - pointer!.offset
  const heatId = scopedId.heat(context, randomUtils.location(section, localIndex))
  const preimageId = scopedId.preimage(context, randomUtils.location(section, localIndex))
  await upsertBlock(context, event)
  const tx = await upsertTransaction(context, event)
  const preimage = await context.db.find(schema.Preimage, {
    orderId: preimageId,
  })
  if (!preimage) {
    console.log(preimageId, event.block, event.transaction, event.transactionReceipt)
  }
  await context.db
    .update(schema.Preimage, {
      orderId: preimageId,
    })
    .set({
      accessed: true,
      heatId,
      timestamp: event.block.timestamp,
    })
  await context.db
    .update(schema.Pointer, {
      orderId: pointerId,
    })
    .set(({ remaining, ...current }) => ({
      ...current,
      remaining: remaining - 1n,
    }))
  await context.db.insert(schema.Heat).values({
    transactionId: tx.orderId,
    index: BigInt(event.log.logIndex),
    startId: undefined,
    preimageId,
    orderId: heatId,
  })
})

ponder.on('Random:Start', async ({ event, context }) => {
  const { owner, key } = event.args
  await upsertBlock(context, event)
  const tx = await upsertTransaction(context, event)
  const startId = scopedId.start(context, key)
  await context.db.insert(schema.Start).values({
    orderId: startId,
    chopped: false,
    transactionId: tx.orderId,
    owner,
    key,
    index: BigInt(event.log.logIndex),
  })
  const heats = await context.db.sql
    .select()
    .from(schema.Heat)
    .where(and(eq(schema.Heat.transactionId, tx.orderId), lt(schema.Heat.index, BigInt(event.log.logIndex))))
    .execute()
  // .where('index', '<', BigInt(event.log.logIndex)).execute()
  // const heats = await context.db.findMany(schema.Heat, {
  //   where: {
  //     transactionId: tx.orderId,
  //     index: { lt: BigInt(event.log.logIndex) },
  //     // startId: { equals: undefined },
  //   },
  // })
  const heatIds = heats.filter((item) => !item.startId).map((item) => item.orderId)
  if (!heatIds.length) {
    return
  }
  const preimageIds = heats.map((item) => item.preimageId)
  for (const preimageId of preimageIds) {
    await context.db
      .update(schema.Preimage, {
        orderId: preimageId,
      })
      .set({
        startId,
      })
  }
  for (const heatId of heatIds) {
    await context.db
      .update(schema.Heat, {
        orderId: heatId,
      })
      .set({
        startId,
      })
  }
})

ponder.on('Random:Link', async ({ event, context }) => {
  const { location, formerSecret } = event.args
  const linkId = scopedId.link(context, location)
  const preimageId = scopedId.preimage(context, location)
  await upsertBlock(context, event)
  const tx = await upsertTransaction(context, event)
  const preimage = await context.db
    .update(schema.Preimage, {
      orderId: preimageId,
    })
    .set({
      secret: formerSecret,
      linkId,
    })
  await context.db
    .update(schema.Pointer, {
      orderId: preimage.pointerId,
    })
    .set({
      lastOkTransactionId: tx.orderId,
    })
  await context.db.insert(schema.Link).values({
    orderId: linkId,
    index: BigInt(event.log.logIndex),
    preimageId,
    transactionId: tx.orderId,
  })
})

ponder.on('Random:Cast', async ({ event, context }) => {
  const { key, seed } = event.args
  const castId = scopedId.cast(context, key)
  const startId = scopedId.start(context, key)
  await upsertBlock(context, event)
  const tx = await upsertTransaction(context, event)
  const preimageIdsUnderStart = await context.db.sql
    .select()
    .from(schema.Preimage)
    .where(eq(schema.Preimage.startId, startId))
    .execute()
  const preimageIds = preimageIdsUnderStart.map((i) => i.orderId)
  if (!preimageIds.length) {
    throw new Error('no preimages found!')
  }
  for (const preimageId of preimageIds) {
    await context.db
      .update(schema.Preimage, {
        orderId: preimageId,
      })
      .set({
        castId,
      })
  }
  await context.db
    .update(schema.Start, {
      orderId: startId,
    })
    .set({
      castId,
    })
  await context.db.insert(schema.Cast).values({
    orderId: castId,
    index: BigInt(event.log.logIndex),
    transactionId: tx.orderId,
    key,
    startId,
    seed,
  })
})

ponder.on('Random:Reveal', async ({ event, context }) => {
  await upsertBlock(context, event)
  const tx = await upsertTransaction(context, event)
  const preimageId = scopedId.preimage(context, event.args.location)
  const revealId = scopedId.reveal(context, event.args.location)
  await context.db.insert(schema.Reveal).values({
    index: BigInt(event.log.logIndex),
    transactionId: tx.orderId,
    preimageId,
    orderId: revealId,
  })
  const preimage = await context.db
    .update(schema.Preimage, {
      orderId: preimageId,
    })
    .set({
      secret: event.args.formerSecret,
      revealId,
    })
  await context.db
    .update(schema.Pointer, {
      orderId: preimage.pointerId,
    })
    .set({
      lastOkTransactionId: tx.orderId,
    })
})

ponder.on('Random:Expired', async ({ event, context }) => {
  const { key } = event.args
  const startId = scopedId.start(context, key)
  const castId = scopedId.cast(context, key)
  const expiredId = scopedId.expired(context, key)
  await upsertBlock(context, event)
  const tx = await upsertTransaction(context, event)
  await context.db.insert(schema.Expired).values({
    orderId: expiredId,
    index: BigInt(event.log.logIndex),
    transactionId: tx.orderId,
    startId,
    castId,
  })
  await context.db
    .update(schema.Cast, {
      orderId: castId,
    })
    .set({
      expiredId,
    })
})

ponder.on('Random:Bleach', async ({ event, context }) => {
  const { section } = event.args
  const bleachId = scopedId.bleach(context, section)
  const pointerId = scopedId.pointer(context, section)
  await upsertBlock(context, event)
  const tx = await upsertTransaction(context, event)
  await context.db.insert(schema.Bleach).values({
    orderId: bleachId,
    index: BigInt(event.log.logIndex),
    transactionId: tx.orderId,
    pointerId,
  })
  await context.db
    .update(schema.Pointer, {
      orderId: pointerId,
    })
    .set({
      bleachId,
    })
})
