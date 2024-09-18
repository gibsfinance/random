import promiseLimit from 'promise-limit'
import { indexer } from "./indexer"
import * as viem from 'viem'
import config from '../config'
import { chain, name, publicClient } from "./chain"
import * as threads from './threads'
import { contracts, getLatestBaseFee } from "./contracts"
import { signers } from "./signers"
import * as randomUtils from '@gibs/random/lib/utils'
import { log } from "./logger"
import _ from "lodash"
import { status } from './utils'

const limit = promiseLimit<viem.Hex>(4)

const lock = promiseLimit(1)

const consumeRandomness = async () => {
  const conf = config.randomness.get(chain.id)!
  if (!(await status())) {
    return
  }
  const { consumer } = await signers()
  const lastBaseFee = await getLatestBaseFee()
  await lock(async () => {
    let pendingNonce = await publicClient.getTransactionCount({
      address: consumer.account!.address,
      blockTag: 'pending',
    })
    const heatTxs = await Promise.all(conf.streams.map(async (randomConfig) => {
      const rand = Math.floor(Math.random() * 16)
      const required = 3
      const decimals = 18
      const price = viem.parseUnits(randomConfig.info.price, decimals)
      const { pointers } = await indexer.pointersOrderedBySelf({
        pointerLimit: 100,
        pointerFilter: {
          token: randomConfig.info.token,
          price_lte: price.toString(),
          remaining_gt: 0,
          duration_lte: randomConfig.info.duration,
          durationIsTimestamp: randomConfig.info.durationIsTimestamp,
        },
        preimageLimit: required,
        preimageFilter: {
          data_gte: viem.padHex(`0x${rand.toString(16)}0`, { dir: 'right', size: 32 }),
          heatId: null,
        },
      })
      const locations = _(pointers.items).sortBy([
        (a) => +a.ink.transaction.block.number,
        (a) => +a.ink.transaction.index,
      ]).flatMap((pointer) => (
        pointer.preimages!.items.map((preimage) => {
          return {
            provider: pointer.provider as viem.Hex,
            token: pointer.token as viem.Hex,
            price: BigInt(pointer.price),
            duration: BigInt(pointer.duration),
            durationIsTimestamp: pointer.durationIsTimestamp,
            offset: BigInt(pointer.offset),
            index: BigInt(preimage.index),
          }
        })
      )).slice(0, required).value()
      if (locations.length > 3) {
        log('locations.length', locations.length)
        return
      }
      if (locations.length < required) {
        log('ran out of locations required=%o location=%o', required, locations)
        return
      }
      const nonce = pendingNonce
      pendingNonce++
      const overrides = {
        account: consumer.account!,
        maxFeePerGas: lastBaseFee * 2n,
        maxPriorityFeePerGas: lastBaseFee > 10n ? lastBaseFee / 10n : 1n,
        type: 'eip1559',
        gas: 10_000_000n,
        nonce,
      } as const
      const heatTx = await contracts().random.write.heat([BigInt(required), {
        ...randomConfig.info,
        price,
        duration: BigInt(randomConfig.info.duration) * 2n,
        provider: consumer.account!.address,
        offset: 0n,
        index: 0n,
      }, locations], {
        ...overrides,
        value: randomUtils.sum(locations),
      })
      log('consuming %o locations @ %o', locations.length, heatTx)
      return heatTx
    }))
    await Promise.all(_.compact(heatTxs).map(async (heatTx) => {
      await publicClient.waitForTransactionReceipt({
        hash: heatTx,
      })
    }))
  })
}

const detectSecrets = async () => {
  if (!(await status())) {
    return
  }
  const { consumer } = await signers()
  const { preimages } = await indexer.unlinkedSecrets({
    secret_not: null,
    castId: null,
  })
  const preimageHashes = preimages.items.map((preimage) => (
    preimage.data
  )) as viem.Hex[]
  const startKeyToPreimages = _.groupBy(preimages.items, 'start.key')
  const checked = new Set<viem.Hex>()
  await lock(async () => {
    let pendingNonce = await publicClient.getTransactionCount({
      address: consumer.account!.address,
      blockTag: 'pending',
    })
    await limit.map(preimageHashes, async (preimage) => {
      const { preimages } = await indexer.unfinishedStarts({
        data: preimage
      })
      const start = preimages.items?.[0]?.heat?.start
      if (start?.chopped || start?.castId) {
        // log('chopped, or casted')
        return
      }
      const heats = start?.heat?.items
      if (!heats) {
        // log('no heats')
        return
      }
      const key = start.key as viem.Hex
      if (checked.has(key)) {
        // log('checked %o', key)
        return
      }
      checked.add(key)
      const orderedPreimages = _.sortBy(startKeyToPreimages[key], 'heat.index')
      const secrets = orderedPreimages.map<viem.Hex>((p) => (
        p.secret as viem.Hex
      ))
      if (_.compact(secrets).length !== heats.length) {
        // log('no secrets')
        return
      }
      const lastBaseFee = await getLatestBaseFee()
      const nonce = pendingNonce
      pendingNonce++
      const overrides = {
        account: consumer.account!,
        maxFeePerGas: lastBaseFee * 2n,
        maxPriorityFeePerGas: lastBaseFee > 10n ? lastBaseFee / 10n : 1n,
        type: 'eip1559',
        gas: 10_000_000n,
        nonce,
      } as const
      const pointerLocations = heats.map<randomUtils.PreimageInfo>(({
        preimage: { pointer, index }
      }) => ({
        provider: pointer.provider as viem.Hex,
        token: pointer.token as viem.Hex,
        price: BigInt(pointer.price),
        durationIsTimestamp: pointer.durationIsTimestamp,
        duration: BigInt(pointer.duration),
        offset: BigInt(pointer.offset),
        index: BigInt(index),
      }))
      const txHash = await contracts().random.write.cast(
        [start.key as viem.Hex, pointerLocations, secrets], overrides)
      log('sending cast %o', txHash)
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
      })
    })
  })
}

const intervals = new Map<threads.Runner, number>([
  [detectSecrets, 10_000],
  [consumeRandomness, 60_000],
])

export const main = async () => {
  await threads.main(intervals)
}
