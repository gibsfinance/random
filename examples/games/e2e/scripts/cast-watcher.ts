/**
 * The minimal always-on validator service for a live chain: polls for outstanding request keys
 * (CoinFlip `Heated` + Raffle `Armed` since the deployment block, with no finalized seed) and
 * casts the matching seeds0-derived secrets inside the 12-block heat window.
 *
 * Preimage index convention (shared with the web app's nextHeatLocations): heats are ordered
 * chronologically from `deployBlock`; the k-th heat consumed pool index k of every validator's
 * pool. Validator i's secret for index k re-derives from seeds0 at HD account i*1000 + k —
 * nothing is stored (see ink-pools.ts).
 *
 * Env: MNEMONIC (funded caster), SEEDS0, CHAIN (default 943), RPC,
 *      CONFIG (path to <chain>-deployment.json with coinFlip/raffle/random/canonicalSubset/
 *      poolOffsets/deployBlock/poolSize; default scripts/<chain>-deployment.json),
 *      INTERVAL_MS (default 5000), ONCE=true for a single pass.
 *
 * Run from examples/games/e2e:  MNEMONIC=… SEEDS0=… pnpm cast-watcher
 */
import * as viem from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import {
  chains,
  defaultRpc,
  makePublicClient,
  coinFlipAbi,
  raffleAbi,
  randomAbi,
  type GamesChainId,
  type Info,
} from '@gibs/games-core'
import { seeds0Secret, SECRET_STRIDE } from './seeds0'

const env = process.env
const CHAIN = (env.CHAIN ? Number(env.CHAIN) : 943) as GamesChainId
const INTERVAL_MS = env.INTERVAL_MS ? Number(env.INTERVAL_MS) : 5_000
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const ZERO32 = viem.padHex('0x0', { size: 32 })

type Deployment = {
  coinFlip: viem.Hex
  raffle: viem.Hex
  random: viem.Hex
  canonicalSubset: viem.Hex[]
  poolOffsets: Record<string, string>
  deployBlock: string
  poolSize: number
}

const main = async () => {
  if (!env.MNEMONIC) throw new Error('MNEMONIC (funded caster) required')
  if (!env.SEEDS0) throw new Error('SEEDS0 required')
  const configPath = env.CONFIG ?? path.join(scriptDir, `${CHAIN}-deployment.json`)
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Deployment
  if (!config.coinFlip || !config.raffle) throw new Error(`${configPath} is missing the game addresses`)

  const account = mnemonicToAccount(env.MNEMONIC)
  const rpc = env.RPC || defaultRpc[CHAIN]
  const publicClient = makePublicClient(CHAIN, rpc)
  const wallet = viem.createWalletClient({ account, chain: chains[CHAIN], transport: viem.http(rpc) })
  const from = BigInt(config.deployBlock)
  console.log(`cast watcher on chain ${CHAIN} as ${account.address}; heats counted from block ${from}`)

  const pass = async () => {
    const [heated, armed] = await Promise.all([
      publicClient.getContractEvents({ address: config.coinFlip, abi: coinFlipAbi, eventName: 'Heated', fromBlock: from }),
      publicClient.getContractEvents({ address: config.raffle, abi: raffleAbi, eventName: 'Armed', fromBlock: from }),
    ])
    const heats = [...heated, ...armed]
      .map((log) => ({ key: (log.args as { key: viem.Hex }).key, blockNumber: log.blockNumber, logIndex: log.logIndex }))
      .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1))

    for (const [index, heat] of heats.entries()) {
      if (index >= config.poolSize) {
        console.error(`pool exhausted (heat ${index} >= pool size ${config.poolSize}) — ink new pools!`)
        continue
      }
      const randomness = (await publicClient.readContract({
        address: config.random,
        abi: randomAbi,
        functionName: 'randomness',
        args: [heat.key],
      })) as { seed: viem.Hex }
      if (randomness.seed !== ZERO32) continue
      const locations: Info[] = config.canonicalSubset.map((provider) => ({
        provider,
        callAtChange: false,
        durationIsTimestamp: false,
        duration: 12n,
        token: viem.zeroAddress,
        price: 0n,
        offset: BigInt(config.poolOffsets[provider.toLowerCase()] ?? '0'),
        index: BigInt(index),
      }))
      const secrets = config.canonicalSubset.map((_v, i) => seeds0Secret(env.SEEDS0!, i * SECRET_STRIDE + index))
      try {
        const gasPrice = await publicClient.getGasPrice()
        const fees = { maxFeePerGas: gasPrice * 2n + gasPrice / 10n, maxPriorityFeePerGas: gasPrice / 10n || 1n }
        const { request } = await publicClient.simulateContract({
          address: config.random,
          abi: randomAbi,
          functionName: 'cast',
          args: [heat.key, locations, secrets],
          account,
          ...fees,
        })
        const receipt = await publicClient.waitForTransactionReceipt({ hash: await wallet.writeContract(request) })
        console.log(`cast key ${heat.key} (index ${index}) in block ${receipt.blockNumber}: ${receipt.status}`)
      } catch (error) {
        // expired window, raced by another caster, etc. — log and keep watching
        console.error(`cast ${heat.key} failed: ${(error as Error).message?.split('\n')[0]}`)
      }
    }
  }

  if (env.ONCE === 'true') {
    await pass()
    return
  }
  for (;;) {
    try {
      await pass()
    } catch (error) {
      console.error(`pass failed: ${(error as Error).message?.split('\n')[0]}`)
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
