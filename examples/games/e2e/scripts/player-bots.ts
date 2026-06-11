/**
 * Autonomous testnet players: keep the games moving and the historical record growing.
 * Stateless — every fact rebuilds from chain state each tick, and raffle guess/salt pairs
 * re-derive deterministically from (bot key, commit ordinal), so restarts lose nothing.
 *
 * Per tick (with jitter):
 *   coin flip  — if ANY open entry waits at the canonical stake (a bot's or a human's), a bot
 *                enters the opposite side and pairs it (humans on the site always find a
 *                counterparty); otherwise, sometimes queue a fresh entry.
 *   raffle     — fill the canonical round one bot-commit at a time; arm at threshold once the
 *                period elapses; reveal own tickets during the claim window; finalise after.
 *
 * The cast-watcher (separate process) finalizes seeds; this script never casts.
 *
 * Env: MNEMONIC (funded; bots are addressIndex 20..20+BOTS-1, topped up from account 0),
 *      SEEDS0 (bot guess/salt derivation), CHAIN (default 943), RPC, CONFIG,
 *      BOTS (default 3), INTERVAL_MS (default 90000), ENTER_PROBABILITY (default 0.35),
 *      ONCE=true for a single pass.
 */
import * as viem from 'viem'
import {
  coinFlipAbi,
  raffleAbi,
  poolLocationFor,
  type GamesChainId,
  type Info,
} from '@gibs/games-core'
import { makePresets as coinflipPresets } from '@gibs/coinflip'
import { makePresets as rafflePresets } from '@gibs/raffle'
import { seeds0Secret } from './seeds0'
import { loadDeployment, makeActor, sendAs, heatsSince } from './actor-common'

const env = process.env
const CHAIN = (env.CHAIN ? Number(env.CHAIN) : 943) as GamesChainId
const BOT_COUNT = env.BOTS ? Number(env.BOTS) : 3
const FIRST_BOT_INDEX = 20 // clear of validators (1-3) and the gate's players (4-8)
const BOT_KEY_BASE = 50_000_000 // reserved seeds0 range for bot salt derivation
const INTERVAL_MS = env.INTERVAL_MS ? Number(env.INTERVAL_MS) : 90_000
const ENTER_PROBABILITY = env.ENTER_PROBABILITY ? Number(env.ENTER_PROBABILITY) : 0.35
const TOP_UP_BELOW = viem.parseEther('0.5')
const TOP_UP_TO = viem.parseEther('2')
const COMMIT_GAS = 1_000_000n
const ENTER_GAS = 4_000_000n
const REVEAL_GAS = 500_000n

const main = async () => {
  if (!env.MNEMONIC) throw new Error('MNEMONIC required')
  if (!env.SEEDS0) throw new Error('SEEDS0 required')
  const config = loadDeployment(CHAIN, env.CONFIG)
  const funder = makeActor(CHAIN, env.MNEMONIC, 0, env.RPC)
  const bots = Array.from({ length: BOT_COUNT }, (_b, i) => ({
    ...makeActor(CHAIN, env.MNEMONIC!, FIRST_BOT_INDEX + i, env.RPC),
    saltKey: seeds0Secret(env.SEEDS0!, BOT_KEY_BASE + i),
  }))
  const publicClient = funder.publicClient
  const subset = config.canonicalSubset
  const poolSize = BigInt(config.poolSize)
  const flipParams = coinflipPresets(subset)[0]!.params // the 0.1 preset only — bounded spend
  const raffleParams = rafflePresets(subset)[0]!.params
  const from = BigInt(config.deployBlock)
  console.log(
    `player bots on chain ${CHAIN}: ${bots.map((b) => b.account.address).join(', ')} (tick ${INTERVAL_MS}ms)`,
  )

  const botAddresses = new Set(bots.map((b) => b.account.address.toLowerCase()))
  const randomPick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)]!

  /** salt_n/guess_n for a bot's n-th raffle commit — recomputable forever from seeds0. */
  const ticketPlan = (saltKey: viem.Hex, ordinal: number) => {
    const salt = viem.keccak256(viem.concatHex([saltKey, viem.toHex(ordinal, { size: 32 })]))
    const guess = 1n + (BigInt(viem.keccak256(salt)) % 256n)
    return { salt, guess }
  }
  const commitmentFor = (guess: bigint, salt: viem.Hex, player: viem.Hex): viem.Hex =>
    viem.keccak256(
      viem.encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes32' }, { type: 'address' }], [guess, salt, player]),
    )

  const heatLocations = async (): Promise<Info[]> => {
    const k = BigInt((await heatsSince(publicClient, config)).length)
    return subset.map((provider) => {
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
  }

  const topUp = async () => {
    for (const bot of bots) {
      const balance = await publicClient.getBalance({ address: bot.account.address })
      if (balance >= TOP_UP_BELOW) continue
      const gasPrice = await publicClient.getGasPrice()
      const hash = await funder.wallet.sendTransaction({
        to: bot.account.address,
        value: TOP_UP_TO - balance,
        maxFeePerGas: gasPrice * 2n,
        maxPriorityFeePerGas: gasPrice / 10n || 1n,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      console.log(`topped up ${bot.account.address}`)
    }
  }

  // --- coin flip ---------------------------------------------------------------------------
  const tickCoinFlip = async () => {
    // open entries = Entered minus anything no longer active (paired or cancelled), straight
    // from the contract's own entries(id).active flag — no event-derivation heuristics
    const entered = await publicClient.getContractEvents({
      address: config.coinFlip,
      abi: coinFlipAbi,
      eventName: 'Entered',
      fromBlock: from,
    })
    const open: { id: bigint; player: viem.Hex; side: number; stake: bigint }[] = []
    for (const log of entered.slice(-40)) {
      const args = log.args as { id: bigint; player: viem.Hex; side: number; stake: bigint }
      if (args.stake !== flipParams.stake) continue
      const entry = (await publicClient.readContract({
        address: config.coinFlip,
        abi: coinFlipAbi,
        functionName: 'entries',
        args: [args.id],
      })) as unknown[]
      if (entry[5] === true) open.push(args) // .active
    }

    if (open.length > 0) {
      const target = open[0]!
      const taker = randomPick(bots.filter((b) => b.account.address.toLowerCase() !== target.player.toLowerCase()))
      if (!taker) return
      const opposite = Number(target.side) === 0 ? 1 : 0
      await sendAs(taker.publicClient, taker.wallet, {
        address: config.coinFlip,
        abi: coinFlipAbi,
        functionName: 'enterAndMatch',
        args: [opposite, subset, await heatLocations()],
        value: flipParams.stake,
        gas: ENTER_GAS,
      })
      console.log(`flip: ${taker.account.address} took the ${opposite === 0 ? 'heads' : 'tails'} side vs ${target.player}`)
      return
    }
    if (Math.random() < ENTER_PROBABILITY) {
      const bot = randomPick(bots)
      const side = Math.random() < 0.5 ? 0 : 1
      await sendAs(bot.publicClient, bot.wallet, {
        address: config.coinFlip,
        abi: coinFlipAbi,
        functionName: 'enterAndMatch',
        args: [side, subset, []],
        value: flipParams.stake,
        gas: ENTER_GAS,
      })
      console.log(`flip: ${bot.account.address} queued ${side === 0 ? 'heads' : 'tails'}`)
    }
  }

  // --- raffle ------------------------------------------------------------------------------
  const tickRaffle = async () => {
    const subsetHash = viem.keccak256(viem.encodeAbiParameters([{ type: 'address[]' }], [subset]))
    const tupleHash = viem.keccak256(
      viem.encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes32' }],
        [raffleParams.stake, raffleParams.threshold, raffleParams.period, subsetHash],
      ),
    )
    const activeRoundId = (await publicClient.readContract({
      address: config.raffle,
      abi: raffleAbi,
      functionName: 'activeRound',
      args: [tupleHash],
    })) as viem.Hex
    const currentBlock = await publicClient.getBlockNumber()
    const committedLogs = await publicClient.getContractEvents({
      address: config.raffle,
      abi: raffleAbi,
      eventName: 'Committed',
      fromBlock: from,
    })
    const commitsByBot = new Map<string, { ticketId: bigint; roundId: viem.Hex }[]>()
    for (const log of committedLogs) {
      const args = log.args as { ticketId: bigint; roundId: viem.Hex; player: viem.Hex }
      const key = args.player.toLowerCase()
      if (!botAddresses.has(key)) continue
      commitsByBot.set(key, [...(commitsByBot.get(key) ?? []), { ticketId: args.ticketId, roundId: args.roundId }])
    }

    // 1. fill / arm the active round
    if (activeRoundId !== viem.padHex('0x0', { size: 32 })) {
      const round = (await publicClient.readContract({
        address: config.raffle,
        abi: raffleAbi,
        functionName: 'rounds',
        args: [activeRoundId],
      })) as unknown[]
      const status = Number(round[7]) // 1 = Filling
      const commitCount = round[5] as bigint
      const createdAtBlock = round[4] as bigint
      if (status === 1 && commitCount < raffleParams.threshold) {
        const fresh = bots.find(
          (b) => !(commitsByBot.get(b.account.address.toLowerCase()) ?? []).some((c) => c.roundId === activeRoundId),
        )
        if (fresh) {
          const ordinal = (commitsByBot.get(fresh.account.address.toLowerCase()) ?? []).length
          const { salt, guess } = ticketPlan(fresh.saltKey, ordinal)
          await sendAs(fresh.publicClient, fresh.wallet, {
            address: config.raffle,
            abi: raffleAbi,
            functionName: 'commit',
            args: [raffleParams.stake, raffleParams.threshold, raffleParams.period, subset, commitmentFor(guess, salt, fresh.account.address)],
            value: raffleParams.stake,
            gas: COMMIT_GAS,
          })
          console.log(`raffle: ${fresh.account.address} committed (ordinal ${ordinal}) to ${activeRoundId.slice(0, 10)}`)
          return
        }
      }
      if (status === 1 && commitCount >= raffleParams.threshold && currentBlock >= createdAtBlock + raffleParams.period) {
        await sendAs(funder.publicClient, funder.wallet, {
          address: config.raffle,
          abi: raffleAbi,
          functionName: 'arm',
          args: [activeRoundId, await heatLocations()],
        })
        console.log(`raffle: armed ${activeRoundId.slice(0, 10)}`)
        return
      }
    } else if (Math.random() < ENTER_PROBABILITY) {
      // no active round — open one
      const bot = randomPick(bots)
      const ordinal = (commitsByBot.get(bot.account.address.toLowerCase()) ?? []).length
      const { salt, guess } = ticketPlan(bot.saltKey, ordinal)
      await sendAs(bot.publicClient, bot.wallet, {
        address: config.raffle,
        abi: raffleAbi,
        functionName: 'commit',
        args: [raffleParams.stake, raffleParams.threshold, raffleParams.period, subset, commitmentFor(guess, salt, bot.account.address)],
        value: raffleParams.stake,
        gas: COMMIT_GAS,
      })
      console.log(`raffle: ${bot.account.address} opened a new round (ordinal ${ordinal})`)
      return
    }

    // 2. reveal own tickets in claiming rounds; finalise closed ones
    const seenRounds = new Set<viem.Hex>()
    for (const bot of bots) {
      const mine = commitsByBot.get(bot.account.address.toLowerCase()) ?? []
      for (const [ordinal, commit] of mine.entries()) {
        const ticket = (await publicClient.readContract({
          address: config.raffle,
          abi: raffleAbi,
          functionName: 'tickets',
          args: [commit.ticketId],
        })) as unknown[]
        const active = ticket[4] as boolean
        const revealed = ticket[5] as boolean
        if (!active || revealed) continue
        const round = (await publicClient.readContract({
          address: config.raffle,
          abi: raffleAbi,
          functionName: 'rounds',
          args: [commit.roundId],
        })) as unknown[]
        const status = Number(round[7])
        const claimDeadline = round[11] as bigint
        if (status === 3 && currentBlock <= claimDeadline) {
          const { salt, guess } = ticketPlan(bot.saltKey, ordinal)
          if (commitmentFor(guess, salt, bot.account.address) !== (ticket[2] as viem.Hex)) {
            console.error(`raffle: derived plan mismatch for ticket ${commit.ticketId} — skipping (ordinal drift?)`)
            continue
          }
          await sendAs(bot.publicClient, bot.wallet, {
            address: config.raffle,
            abi: raffleAbi,
            functionName: 'reveal',
            args: [commit.ticketId, guess, salt],
            gas: REVEAL_GAS,
          })
          console.log(`raffle: ${bot.account.address} revealed ticket ${commit.ticketId} (guess ${guess})`)
        } else if (status === 3 && currentBlock > claimDeadline && !seenRounds.has(commit.roundId)) {
          seenRounds.add(commit.roundId)
          await sendAs(funder.publicClient, funder.wallet, {
            address: config.raffle,
            abi: raffleAbi,
            functionName: 'finalise',
            args: [commit.roundId],
          })
          console.log(`raffle: finalised ${commit.roundId.slice(0, 10)}`)
        }
      }
    }
  }

  const tick = async () => {
    await topUp()
    await tickCoinFlip().catch((e) => console.error(`flip tick: ${(e as Error).message?.split('\n')[0]}`))
    await tickRaffle().catch((e) => console.error(`raffle tick: ${(e as Error).message?.split('\n')[0]}`))
  }

  if (env.ONCE === 'true') {
    await tick()
    return
  }
  for (;;) {
    await tick().catch((e) => console.error(`tick failed: ${(e as Error).message?.split('\n')[0]}`))
    const jitter = 0.5 + Math.random() // 0.5x..1.5x the interval
    await new Promise((resolve) => setTimeout(resolve, Math.round(INTERVAL_MS * jitter)))
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
