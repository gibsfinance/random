import * as viem from 'viem'
import { Config, RandomnessConfig } from './src/types'
import { pulsechainV4 } from 'viem/chains'
import * as deployedAddresses943 from '@gibs/random/ignition/deployments/chain-943/deployed_addresses.json'

const addresses943 = deployedAddresses943 as {
  [k in keyof typeof deployedAddresses943]: viem.Hex;
}

const { env } = process

const indexer = {
  url: env.INDEXER_URL,
}
const chainId = Number(env.CHAIN_ID)

const database = {
  url: env.DATABASE_URL || 'postgres://gibrandom:password@localhost:9182/gibrandom',
  schema: env.DATABASE_SCHEMA || 'public',
  ssl: env.DATABASE_SSL === 'true',
  name: 'gibrandom',
}

console.log(database)

const randomness = new Map<number, RandomnessConfig>([
  [pulsechainV4.id, {
    addresses: {
      random: addresses943['RandomModule#Random'],
      reader: addresses943['ReaderModule#Reader'],
    },
    streams: [{
      provider: 0,
      consumer: 9,
      funder: [0, 1],
      minCoolPreimages: 256,
      maxCoolPreimages: 1024,
      perPreimageCostThreshold: '1',
      preimagesPerInk: 'max', // use max
      jitSendValue: true,
      info: {
        token: viem.zeroAddress,
        duration: 12,
        durationIsTimestamp: false,
        price: '100',
      },
    }],
  }]
])

export default {
  indexer,
  chainId,
  randomness,
  database,
} as Config
