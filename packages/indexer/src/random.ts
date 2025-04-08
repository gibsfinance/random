import { ponder } from 'ponder:registry'
import * as schema from 'ponder:schema'
import { and, eq, lt } from 'ponder'
import * as viem from 'viem'
import * as randomUtils from '@gibs/random/lib/utils'
import { abi as randomAbi } from '@gibs/random/artifacts/contracts/Random.sol/Random.json'
import { Random$Type } from '@gibs/random/artifacts/contracts/Random.sol/Random'
import { scopedId, upsertBlock, upsertTransaction } from './utils'

ponder.on('Random.ink()', async ({ event, context }) => {
  const [sectionInput, bytecode] = event.args
  const preimages = randomUtils.dataToPreimages(bytecode)
  const transactionReceipt = await context.client.getTransactionReceipt({
    hash: event.transaction.hash,
  })
  const events = viem.parseEventLogs({
    abi: randomAbi as Random$Type['abi'],
    logs: transactionReceipt.logs,
    eventName: 'Ink',
  })
  await upsertBlock(context, event)
  const tx = await upsertTransaction(context, event)
  await Promise.all(
    events.map(async (inkEvent) => {
      const offset = BigInt.asUintN(128, inkEvent.args.offset >> 128n)
      const info = {
        ...sectionInput,
        provider: inkEvent.args.provider,
        offset,
      }
      const section = randomUtils.section(info)
      if (section !== inkEvent.args.section) {
        return
      }
      const template = randomUtils.template(info)
      // pointer id uses section because it is a readily available
      // abstraction. pointer storage is a reference to an
      // on chain contract holding preimages in bytecode data
      const pointerId = scopedId.pointer(context, section)
      const preimageEntities = preimages.map((preimage, index) => ({
        index: BigInt(index),
        pointerId,
        data: preimage,
        template,
        section,
        accessed: false,
        orderId: scopedId.preimage(context, randomUtils.location(section, index)),
      }))
      const inkId = scopedId.ink(context, section)
      await context.db.insert(schema.Pointer).values({
        orderId: pointerId,
        remaining: BigInt(preimages.length),
        inkId,
        section,
        count: BigInt(preimages.length),
        storage: inkEvent.args.pointer,
        lastOkTransactionId: tx.orderId,
        provider: inkEvent.args.provider,
        template,
        callAtChange: sectionInput.callAtChange,
        token: sectionInput.token,
        price: sectionInput.price,
        duration: sectionInput.duration,
        usesTimestamp: sectionInput.usesTimestamp,
        offset,
        chainId: BigInt(context.network.chainId),
        address: context.contracts.Random.address,
      })
      await context.db.insert(schema.Preimage).values(preimageEntities)
      await context.db.insert(schema.Ink).values({
        section,
        index: BigInt(event.transaction.transactionIndex),
        pointerId: pointerId,
        sender: inkEvent.args.sender,
        transactionId: tx.orderId,
        orderId: inkId,
      })
    }),
  )
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
    .select(schema.Heat._.columns)
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
    .select(schema.Preimage._.columns)
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
  const { provider, section } = event.args
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
