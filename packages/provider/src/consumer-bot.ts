import { indexer } from "./indexer"
import * as viem from 'viem'
import config from '../config'
import { chain, publicClient } from "./chain"
import * as threads from './threads'
import { contracts, getLatestBaseFee } from "./contracts"
import { signers } from "./signers"
import * as randomUtils from '@gibs/random/lib/utils'
import { msgBoard } from "./msgboard"
import { db } from "./db"
import { tableNames } from "./db/tables"
import { generateSeed } from "./randomenss"
import { Message } from "@pulsechain/msgboard"
import { log } from "./logger"

const getOutstanding = async (template: viem.Hex) => {
  const [count] = await db.count('*')
    .from(tableNames.secret)
    .where('exposed', true)
    .where('template', template)
  if (!count) {
    return 0n
  }
  return BigInt(count.count)
}

const consumeRandomness = async () => {
  const conf = config.randomness.get(chain.id)!
  const { provider } = await signers()
  await Promise.all(conf.streams.map(async (randomConfig) => {
    const rand = Math.floor(Math.random() * 256)
    const required = 3
    const decimals = 18
    const price = viem.parseUnits(randomConfig.info.price, decimals)
    // const outstanding = await getOutstanding(randomUtils.template({
    //   provider: provider.account!.address,
    //   token: randomConfig.info.token,
    //   price,
    //   duration: BigInt(randomConfig.info.duration),
    //   durationIsTimestamp: randomConfig.info.durationIsTimestamp,
    // }))
    // if (outstanding > 3n) {
    //   return
    // }
    const { pointers } = await indexer.pointersOrderedBySelf({
      pointerLimit: 100,
      pointerFilter: {
        token: randomConfig.info.token,
        price_lte: price.toString(),
        duration_lte: randomConfig.info.duration,
        durationIsTimestamp: randomConfig.info.durationIsTimestamp,
      },
      preimageLimit: required,
      preimageFilter: {
        data_gte: viem.bytesToHex(Uint8Array.from([rand]), { size: 32 }),
        heatId: null,
      },
    })
    const locations = pointers.items.flatMap((pointer) => (
      pointer.preimages!.items.map((preimage) => ({
        provider: pointer.provider as viem.Hex,
        token: pointer.token as viem.Hex,
        price: BigInt(pointer.price),
        duration: BigInt(pointer.duration),
        durationIsTimestamp: pointer.durationIsTimestamp,
        offset: BigInt(pointer.offset),
        index: BigInt(preimage.index),
      }))
    ))
    if (locations.length > 3) {
      return
    }
    if (locations.length < required) {
      log('required=%o location=%o', required, locations)
      throw new Error('ran out of locations!')
    }
    const { consumer } = await signers()
    const lastBaseFee = await getLatestBaseFee()
    log('consuming %o locations', locations.length)
    await contracts().random.write.heat([BigInt(required), {
      ...randomConfig.info,
      price,
      duration: BigInt(randomConfig.info.duration) * 2n,
      provider: consumer.account!.address,
      offset: 0n,
      index: 0n,
    }, locations], {
      account: consumer.account!,
      value: randomUtils.sum(locations),
      maxFeePerGas: lastBaseFee * 2n,
      maxPriorityFeePerGas: lastBaseFee / 5n,
      type: 'eip1559',
      gas: 10_000_000n,
    })
    // log(locations)
  }))
}

const detectSecrets = async () => {
  const { consumer } = await signers()
  const msgboard = msgBoard()
  const content = await msgboard.content()
  const keys = Object.keys(content)
  const { id, key } = generateSeed()
  const existing = await db.select('*')
    .from(tableNames.secret)
    .whereIn('preimage', keys)
    .where('seedId', id)
  // log(existing)
  for (const secret of existing) {
    const { preimages } = await indexer.unfinishedStarts({
      data: secret.preimage
    })
    const start = preimages.items?.[0]?.heat?.start
    if (start?.chopped || start?.castId) continue
    const heats = start?.heat?.items
    if (!heats) continue
    const secrets: viem.Hex[] = []
    for (const heat of heats) {
      const preimage = heat.preimage
      const known = Object.values(content[preimage.data as viem.Hex] as Record<viem.Hex, Message> || {}).find(({ data }) => (
        viem.keccak256(data) === preimage.data
      ))?.data
      if (known) {
        secrets.push(known as viem.Hex)
      }
    }
    if (secrets.length !== heats.length) {
      continue
    }
    const pointerLocations = heats.map<randomUtils.PreimageInfo>(({ preimage }) => ({
      provider: preimage.pointer.provider as viem.Hex,
      token: preimage.pointer.token as viem.Hex,
      price: BigInt(preimage.pointer.price),
      durationIsTimestamp: preimage.pointer.durationIsTimestamp,
      duration: BigInt(preimage.pointer.duration),
      offset: BigInt(preimage.pointer.offset),
      index: BigInt(preimage.index),
    }))
    const txHash = await contracts().random.write.cast([start.key as viem.Hex, pointerLocations, secrets], {
      account: consumer.account!,
    })
    log('sending cast %o', txHash)
    await publicClient.waitForTransactionReceipt({
      hash: txHash,
    })
    // const known = await db.select('*')
    //   .from(tableNames.secret)
    //   .whereIn('preimage', images)
    // log(heats)
    // const s = generateSecret(key, Number(secret.index))
  }
  // log('finished loop')
}

const intervals = new Map<threads.Runner, number>([
  [consumeRandomness, 60_000 * 30],
  [detectSecrets, 20_000],
])

export const main = async () => {
  await threads.main(intervals)
}
