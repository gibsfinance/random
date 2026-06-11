/**
 * The minimal always-on validator service for a live chain. Each pass:
 *   1. casts every outstanding request key (CoinFlip `Heated` + Raffle `Armed` since the
 *      deployment origin, with no finalized seed) — the k-th heat chronologically maps to
 *      pool slot k via the rotation arithmetic (core poolLocationFor), and validator i's
 *      secret re-derives from seeds0 at HD account i*STRIDE + k (nothing stored);
 *   2. keeps the NEXT pool inked: when the heat count nears the current pool's boundary, it
 *      inks pool n+1 at the predicted offset (idempotent — Random.pointer is nonzero once a
 *      pool exists).
 *
 * Env: MNEMONIC (funded caster/payer), SEEDS0, CHAIN (default 943), RPC, CONFIG (path to
 *      <chain>-deployment.json), INTERVAL_MS (default 5000), ONCE=true for a single pass.
 *
 * Run from examples/games/e2e:  MNEMONIC=… SEEDS0=… pnpm cast-watcher
 */
import * as viem from 'viem'
import { randomAbi, poolLocationFor, type GamesChainId, type Info } from '@gibs/games-core'
import { seeds0Secret, SECRET_STRIDE } from './seeds0'
import { loadDeployment, makeActor, sendAs, heatsSince } from './actor-common'

const env = process.env
const CHAIN = (env.CHAIN ? Number(env.CHAIN) : 943) as GamesChainId
const INTERVAL_MS = env.INTERVAL_MS ? Number(env.INTERVAL_MS) : 5_000
const ZERO32 = viem.padHex('0x0', { size: 32 })
/** Ink pool n+1 once fewer than this many slots remain in pool n. */
const INK_AHEAD = 8n

const main = async () => {
  if (!env.MNEMONIC) throw new Error('MNEMONIC (funded caster) required')
  if (!env.SEEDS0) throw new Error('SEEDS0 required')
  const config = loadDeployment(CHAIN, env.CONFIG)
  const { account, publicClient, wallet } = makeActor(CHAIN, env.MNEMONIC, 0, env.RPC)
  const poolSize = BigInt(config.poolSize)
  console.log(`cast watcher on chain ${CHAIN} as ${account.address}; origin block ${config.deployBlock}, pool size ${poolSize}`)

  const locationsAt = (k: bigint): Info[] =>
    config.canonicalSubset.map((provider) => {
      const { offset, index } = poolLocationFor(k, BigInt(config.poolOffsets[provider.toLowerCase()] ?? '0'), poolSize)
      return {
        provider,
        callAtChange: false,
        durationIsTimestamp: false,
        duration: 12n,
        token: viem.zeroAddress,
        price: 0n,
        offset,
        index,
      }
    })

  /** Ink pool n+1 for every validator when the live pool is nearly spent. */
  const maintainPools = async (heatCount: bigint) => {
    const remaining = poolSize - (heatCount % poolSize)
    if (remaining > INK_AHEAD) return
    for (const [i, provider] of config.canonicalSubset.entries()) {
      const base = BigInt(config.poolOffsets[provider.toLowerCase()] ?? '0')
      const nextPool = poolLocationFor(((heatCount / poolSize) + 1n) * poolSize, base, poolSize)
      const probe: Info = {
        provider,
        callAtChange: false,
        durationIsTimestamp: false,
        duration: 12n,
        token: viem.zeroAddress,
        price: 0n,
        offset: nextPool.offset,
        index: 0n,
      }
      const pointer = (await publicClient.readContract({
        address: config.random,
        abi: randomAbi,
        functionName: 'pointer',
        args: [probe],
      })) as viem.Hex
      if (pointer !== viem.zeroAddress) continue // next pool already inked
      const firstSecretIndex = Number(((heatCount / poolSize) + 1n) * poolSize)
      const preimages = Array.from({ length: config.poolSize }, (_p, j) =>
        viem.keccak256(seeds0Secret(env.SEEDS0!, i * SECRET_STRIDE + firstSecretIndex + j)),
      )
      await sendAs(publicClient, wallet, {
        address: config.random,
        abi: randomAbi,
        functionName: 'ink',
        args: [{ ...probe, offset: 0n }, viem.concatHex(preimages)],
      })
      console.log(`inked next pool for validator ${i} (${provider}) at offset ${nextPool.offset}`)
    }
  }

  const pass = async () => {
    const heats = await heatsSince(publicClient, config)
    await maintainPools(BigInt(heats.length))
    for (const [index, heat] of heats.entries()) {
      const k = BigInt(index)
      const randomness = (await publicClient.readContract({
        address: config.random,
        abi: randomAbi,
        functionName: 'randomness',
        args: [heat.key],
      })) as { seed: viem.Hex }
      if (randomness.seed !== ZERO32) continue
      const secrets = config.canonicalSubset.map((_v, i) =>
        seeds0Secret(env.SEEDS0!, i * SECRET_STRIDE + Number(k)),
      )
      try {
        const receipt = await sendAs(publicClient, wallet, {
          address: config.random,
          abi: randomAbi,
          functionName: 'cast',
          args: [heat.key, locationsAt(k), secrets],
        })
        console.log(`cast key ${heat.key} (slot ${k}) in block ${receipt.blockNumber}`)
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
