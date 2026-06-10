/**
 * The 943 gate, automated: deploy CoinFlip + Raffle against live core Random on PulseChain
 * testnet v4, allowlist mnemonic-derived validators, ink one price-0 preimage per validator,
 * fund the player wallets, then run one coin-flip duel and one full raffle round end to end,
 * asserting at each settlement that the off-chain `settle` names the on-chain winner. On
 * success it appends a run-log entry to examples/games/README.md.
 *
 * Carries over the duel-943.ts conventions: every state-changing call is simulated first,
 * player calls carry explicit gas caps (PulseChain prevalidates eth_call balance against the
 * BLOCK gas limit when no gas is given), players are further address indexes of the same
 * funded mnemonic topped up from account 0, and deployed addresses are cached so a re-run
 * reuses the contracts.
 *
 * Environment variables:
 *   CHAIN        '943' (default) or 'local' — local is the smoke-test mode: same code path
 *                against anvil, deploying a fresh Random first and mining instead of waiting.
 *   MNEMONIC     funded recovery phrase (943; read via `op read`, never logged). Local mode
 *                defaults to the standard anvil test mnemonic.
 *   RPC_943      JSON-RPC endpoint for 943 (default: g4mm4 public testnet; override to the
 *                valve.city endpoint for reliability inside the 12-block heat window).
 *   STAKE        stake per player in coins (default '0.1' duel, also the raffle ticket price).
 *   VALIDATORS   validator count (default 3 == the contract MIN_SUBSET).
 *   COINFLIP     reuse an already-deployed CoinFlip instead of deploying.
 *   RAFFLE       reuse an already-deployed Raffle instead of deploying.
 *   RANDOM_ADDRESS  override the core Random address (required if CHAIN=local reuses a chain;
 *                NOT named RANDOM because shells special-case that variable).
 *   EXPECTED_PROVIDER  the address account 0 must derive to on 943 (guards against a wrong
 *                mnemonic; set empty to skip).
 *   DRY_RUN      'true' => simulate the deploys and the first ink, broadcast nothing.
 *   SKIP_FINALISE 'true' => stop after the raffle parity assert (reveals), printing how to
 *                finalise later, instead of waiting out the 100-block claim window.
 *   NO_RUN_LOG   'true' => do not append to the README run log.
 *
 * Run from examples/games/e2e:
 *   MNEMONIC="$(op read 'op://gibs/randomness/recovery phrase')" pnpm run-943
 * Smoke test (anvil running): CHAIN=local pnpm run-943
 */
import * as viem from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import {
  chains,
  defaultRpc,
  randomAddress as knownRandom,
  makeSecret,
  buildHeatLocations,
  coinFlipAbi,
  coinFlipBytecode,
  raffleAbi,
  raffleBytecode,
  randomAbi,
  raffleDraw,
  type GamesChainId,
  type Info,
} from '@gibs/games-core'
import { coinflip } from '@gibs/coinflip'
import { raffle } from '@gibs/raffle'
import RandomArtifact from '@gibs/random/artifacts/contracts/Random.sol/Random.json'

const env = process.env
const CHAIN: GamesChainId = env.CHAIN === 'local' ? 31337 : 943
const IS_LOCAL = CHAIN === 31337
const RPC = (IS_LOCAL ? env.RPC : env.RPC_943) || defaultRpc[CHAIN]
const STAKE = viem.parseEther(env.STAKE || '0.1')
const VALIDATOR_COUNT = env.VALIDATORS ? Number(env.VALIDATORS) : 3
const DRY_RUN = env.DRY_RUN === 'true'
const SKIP_FINALISE = env.SKIP_FINALISE === 'true'
const EXPECTED_PROVIDER =
  env.EXPECTED_PROVIDER === undefined ? '0xAF2b2118376b51eEcB58327526bc082aED3e4225' : env.EXPECTED_PROVIDER
const TEST_MNEMONIC = 'test test test test test test test test test test test junk'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const ADDRESS_CACHE = path.join(scriptDir, '.games-943.json')
const README = path.join(scriptDir, '..', '..', 'README.md')

// Explicit gas caps for player calls (PulseChain eth_call prevalidation quirk — see header).
const ENTER_HEADS_GAS = 2_000_000n
const ENTER_TAILS_GAS = 4_000_000n // heats N validator preimages
const COMMIT_GAS = 1_000_000n
const REVEAL_GAS = 500_000n
const PLAYER_GAS_BUDGET = 6_000_000n // funding headroom over the largest cap

const RAFFLE_PERIOD = 2n // blocks a raffle round must fill before arming

// Fresh secrets every run: the seed is a deterministic function of the revealed secrets, so
// reuse would reproduce the same winner. Crypto-strong per-run salt models a real validator.
const RUN_SALT = viem.bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
const randomBigint = (maxExclusive: bigint): bigint =>
  BigInt(viem.hexToNumber(viem.bytesToHex(crypto.getRandomValues(new Uint8Array(4))))) % maxExclusive

const coins = (value: bigint): string => `${viem.formatEther(value)} ${IS_LOCAL ? 'ETH' : 'tPLS'}`

type Cache = { coinFlip?: viem.Hex; raffle?: viem.Hex }
const loadCache = (): Cache => {
  if (IS_LOCAL) return {} // anvil is ephemeral; never reuse local addresses
  if (!fs.existsSync(ADDRESS_CACHE)) return {}
  return JSON.parse(fs.readFileSync(ADDRESS_CACHE, 'utf8')) as Cache
}
const saveCache = (cache: Cache) => {
  if (!IS_LOCAL) fs.writeFileSync(ADDRESS_CACHE, JSON.stringify(cache, null, 2))
}

const main = async () => {
  const mnemonic = env.MNEMONIC || (IS_LOCAL ? TEST_MNEMONIC : undefined)
  if (!mnemonic) throw new Error('MNEMONIC is required for 943 (read it in via `op read`, it is never logged)')

  const account = mnemonicToAccount(mnemonic) // index 0: deployer + funder + caster
  if (!IS_LOCAL && EXPECTED_PROVIDER && !viem.isAddressEqual(account.address, EXPECTED_PROVIDER as viem.Hex)) {
    throw new Error(
      `derived ${account.address} does not match expected provider ${EXPECTED_PROVIDER}; ` +
        'wrong mnemonic or derivation. Aborting before any transaction.',
    )
  }

  const chain = chains[CHAIN]
  const transport = viem.http(RPC)
  const publicClient = viem.createPublicClient({ chain, transport })
  const wallet = viem.createWalletClient({ account, chain, transport })
  const walletFor = (acct: viem.Account) => viem.createWalletClient({ account: acct, chain, transport })

  const gasPrice = await publicClient.getGasPrice()
  const maxPriorityFeePerGas = gasPrice / 10n > 0n ? gasPrice / 10n : 1n
  const maxFeePerGas = gasPrice * 2n + maxPriorityFeePerGas
  const fees = { maxFeePerGas, maxPriorityFeePerGas }
  const fundPerPlayer = STAKE + maxFeePerGas * PLAYER_GAS_BUDGET

  /** Simulate then broadcast a contract call, awaiting and checking the receipt. */
  const send = async (
    label: string,
    from: ReturnType<typeof walletFor>,
    address: viem.Hex,
    abi: viem.Abi,
    functionName: string,
    args: readonly unknown[],
    value = 0n,
    gas?: bigint,
  ): Promise<viem.TransactionReceipt> => {
    const { request } = await publicClient.simulateContract({
      address,
      abi,
      functionName,
      args,
      account: from.account!,
      value,
      ...fees,
      ...(gas ? { gas } : {}),
    })
    const hash = await from.writeContract(request)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    console.log(`  ${label}: block ${receipt.blockNumber}, gas ${receipt.gasUsed}, ${receipt.status} (${hash})`)
    if (receipt.status !== 'success') throw new Error(`${label} reverted on chain`)
    return receipt
  }

  /** Advance past a target block: mine on anvil, poll on a live chain. */
  const advancePastBlock = async (target: bigint) => {
    if (IS_LOCAL) {
      const now = await publicClient.getBlockNumber()
      if (now <= target) {
        await publicClient.request({
          method: 'anvil_mine' as any,
          params: [viem.toHex(target - now + 1n) as any],
        })
      }
      return
    }
    for (;;) {
      const now = await publicClient.getBlockNumber()
      if (now > target) return
      console.log(`  waiting for block > ${target} (now ${now}, ~${(target - now + 1n) * 10n}s)`)
      await new Promise((resolve) => setTimeout(resolve, 30_000))
    }
  }

  // --- Account layout: validators 1..V, duel players V+1..V+2, raffle players V+3..V+5 ---
  const validatorAccounts = Array.from({ length: VALIDATOR_COUNT }, (_v, i) =>
    mnemonicToAccount(mnemonic, { addressIndex: i + 1 }),
  )
  const heads = mnemonicToAccount(mnemonic, { addressIndex: VALIDATOR_COUNT + 1 })
  const tails = mnemonicToAccount(mnemonic, { addressIndex: VALIDATOR_COUNT + 2 })
  const rafflePlayers = [3, 4, 5].map((offset) =>
    mnemonicToAccount(mnemonic, { addressIndex: VALIDATOR_COUNT + offset }),
  )
  const subset = validatorAccounts.map((v) => v.address)

  const balance = await publicClient.getBalance({ address: account.address })
  console.log(`--- games platform run (chain ${CHAIN}) ---`)
  console.log(`rpc             : ${RPC}`)
  console.log(`account 0       : ${account.address} (deployer + funder + caster)`)
  console.log(`balance (acct0) : ${coins(balance)}`)
  console.log(`stake           : ${coins(STAKE)} per player; fund/player ${coins(fundPerPlayer)}`)
  console.log(`validators      : ${subset.join(', ')}`)
  console.log('')

  // --- Resolve core Random ---------------------------------------------------------------
  let random = (env.RANDOM_ADDRESS as viem.Hex | undefined) ?? knownRandom[CHAIN]
  if (!random) {
    if (!IS_LOCAL) throw new Error('no Random address for this chain')
    console.log('[deploy] local smoke mode: deploying a fresh core Random')
    const hash = await wallet.deployContract({
      abi: RandomArtifact.abi as viem.Abi,
      bytecode: RandomArtifact.bytecode as viem.Hex,
      args: [],
      ...fees,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Random deploy reverted')
    random = receipt.contractAddress
    console.log(`  Random at ${random}`)
  }

  // --- DRY_RUN: simulate the deploys and the first ink, then stop -------------------------
  if (DRY_RUN) {
    console.log('[dry-run] simulating CoinFlip + Raffle deploys and one validator ink...')
    for (const [name, bytecode, abi] of [
      ['CoinFlip', coinFlipBytecode, coinFlipAbi],
      ['Raffle', raffleBytecode, raffleAbi],
    ] as const) {
      await publicClient.call({
        account: account.address,
        data: viem.encodeDeployData({ abi, bytecode, args: [random] }),
        ...fees,
      })
      console.log(`  ${name} constructor simulation OK`)
    }
    const probe = makeSecret('dry-run-probe', RUN_SALT)
    const section: Info = {
      provider: validatorAccounts[0]!.address,
      callAtChange: false,
      durationIsTimestamp: false,
      duration: 12n,
      token: viem.zeroAddress,
      price: 0n,
      offset: 0n,
      index: 0n,
    }
    await publicClient.simulateContract({
      address: random,
      abi: randomAbi,
      functionName: 'ink',
      args: [section, probe.preimage],
      account,
      value: 0n,
      ...fees,
    })
    console.log('  ink simulation OK')
    console.log('\nDRY_RUN=true -> nothing was broadcast. Re-run without DRY_RUN for the live gate.')
    return
  }

  // --- Deploy or reuse the games -----------------------------------------------------------
  const cache = loadCache()
  const deployGame = async (name: string, cached: viem.Hex | undefined, abi: viem.Abi, bytecode: viem.Hex) => {
    if (cached) {
      console.log(`[deploy] reusing ${name} at ${cached}`)
      return cached
    }
    console.log(`[deploy] deploying ${name}(random)`)
    const hash = await wallet.deployContract({ abi, bytecode, args: [random], ...fees })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`${name} deploy reverted`)
    console.log(`  ${name} at ${receipt.contractAddress} (block ${receipt.blockNumber})`)
    return receipt.contractAddress
  }
  const coinFlipAddr = await deployGame(
    'CoinFlip',
    (env.COINFLIP as viem.Hex | undefined) ?? cache.coinFlip,
    coinFlipAbi,
    coinFlipBytecode,
  )
  const raffleAddr = await deployGame(
    'Raffle',
    (env.RAFFLE as viem.Hex | undefined) ?? cache.raffle,
    raffleAbi,
    raffleBytecode,
  )
  saveCache({ coinFlip: coinFlipAddr, raffle: raffleAddr })
  console.log('')

  // --- Allowlist the validators on both games (idempotent: addValidator no-ops if present) --
  console.log('[allowlist] adding validators to both games')
  for (const game of [coinFlipAddr, raffleAddr]) {
    for (const v of subset) {
      const already = (await publicClient.readContract({
        address: game,
        abi: raffleAbi,
        functionName: 'isValidator',
        args: [v],
      })) as boolean
      if (already) continue
      await send(`addValidator ${v.slice(0, 10)}`, wallet, game, raffleAbi, 'addValidator', [v])
    }
  }
  console.log('')

  // --- Ink two fresh price-0 preimages per validator (account 0 pays; provider = validator) --
  // Random.ink records the pool under info.provider, so the validators need no gas of their
  // own. A preimage is one-shot — once heated and cast it cannot ignite again — so the run
  // needs one per game: pool index 0 feeds the duel, index 1 feeds the raffle. The Ink event
  // returns the pool's start offset (high 128 bits) — load-bearing on a reused chain, where a
  // validator's Nth ink lands at a nonzero offset.
  console.log('[ink] inking two preimages per validator (duel + raffle)')
  const poolOffsetByProvider: Record<string, bigint> = {}
  const secretsByProvider: Record<string, [viem.Hex, viem.Hex]> = {}
  for (const [i, v] of validatorAccounts.entries()) {
    const duelSecret = makeSecret(`validator-${i}-duel-${v.address}`, RUN_SALT)
    const raffleSecret = makeSecret(`validator-${i}-raffle-${v.address}`, RUN_SALT)
    const section: Info = {
      provider: v.address,
      callAtChange: false,
      durationIsTimestamp: false,
      duration: 12n,
      token: viem.zeroAddress,
      price: 0n,
      offset: 0n,
      index: 0n,
    }
    const receipt = await send(
      `ink validator ${i}`,
      wallet,
      random,
      randomAbi,
      'ink',
      [section, viem.concatHex([duelSecret.preimage, raffleSecret.preimage])],
    )
    const inkArgs = viem.parseEventLogs({ abi: randomAbi, eventName: 'Ink', logs: receipt.logs })[0]?.args as
      | { offset?: bigint }
      | undefined
    const poolOffset = inkArgs?.offset !== undefined ? BigInt.asUintN(128, inkArgs.offset >> 128n) : 0n
    poolOffsetByProvider[v.address.toLowerCase()] = poolOffset
    secretsByProvider[v.address.toLowerCase()] = [duelSecret.secret, raffleSecret.secret]
  }
  const locationsAt = (index: bigint): Info[] =>
    buildHeatLocations(subset, poolOffsetByProvider).map((l) => ({ ...l, index }))
  const duelLocations = locationsAt(0n)
  const raffleLocations = locationsAt(1n)
  const duelSecrets = subset.map((v) => secretsByProvider[v.toLowerCase()]![0])
  const raffleSecrets = subset.map((v) => secretsByProvider[v.toLowerCase()]![1])
  console.log('')

  // --- Fund the player wallets from account 0 ----------------------------------------------
  console.log('[fund] topping up player wallets')
  for (const [label, player] of [
    ['heads', heads],
    ['tails', tails],
    ['raffle 0', rafflePlayers[0]!],
    ['raffle 1', rafflePlayers[1]!],
    ['raffle 2', rafflePlayers[2]!],
  ] as const) {
    const have = await publicClient.getBalance({ address: player.address })
    if (have >= fundPerPlayer) {
      console.log(`  ${label} already holds ${coins(have)}`)
      continue
    }
    const top = fundPerPlayer - have
    const hash = await wallet.sendTransaction({ to: player.address, value: top, ...fees })
    await publicClient.waitForTransactionReceipt({ hash })
    console.log(`  ${label} <- ${coins(top)}`)
  }
  console.log('')

  // === The duel =============================================================================
  console.log('[duel] heads enters (queues)')
  await send('enter-heads', walletFor(heads), coinFlipAddr, coinFlipAbi, 'enterAndMatch', [0, subset, []], STAKE, ENTER_HEADS_GAS)
  console.log('[duel] tails enters (pairs + heats the subset)')
  const matchReceipt = await send(
    'enter-tails',
    walletFor(tails),
    coinFlipAddr,
    coinFlipAbi,
    'enterAndMatch',
    [1, subset, duelLocations],
    STAKE,
    ENTER_TAILS_GAS,
  )
  const heated = viem.parseEventLogs({ abi: coinFlipAbi, eventName: 'Heated', logs: matchReceipt.logs })[0]
    ?.args as { key?: viem.Hex } | undefined
  if (!heated?.key) throw new Error('no Heated event — pairing failed')

  console.log('[duel] casting the validator secrets (within the 12-block window)')
  const duelCastReceipt = await send('cast', wallet, random, randomAbi, 'cast', [heated.key, duelLocations, duelSecrets])
  const settled = viem.parseEventLogs({ abi: coinFlipAbi, eventName: 'Settled', logs: duelCastReceipt.logs })[0]
    ?.args as { winner?: viem.Hex; seed?: viem.Hex } | undefined
  if (!settled?.winner || !settled.seed) throw new Error('no Settled event in the cast receipt')

  const duelOffChain = coinflip.settle(
    { stake: STAKE, validatorSubset: subset },
    [
      { player: heads.address, side: 'heads' },
      { player: tails.address, side: 'tails' },
    ],
    settled.seed,
  )
  console.log(`  seed      : ${settled.seed}`)
  console.log(`  off-chain : ${duelOffChain.winner} (${duelOffChain.winningSide})`)
  console.log(`  on-chain  : ${settled.winner}`)
  if (!viem.isAddressEqual(duelOffChain.winner, settled.winner)) throw new Error('DUEL PARITY MISMATCH')
  console.log('  DUEL PARITY OK')
  console.log('')

  // === The raffle ===========================================================================
  console.log('[raffle] three players commit hidden guesses')
  const guesses = rafflePlayers.map(() => 1n + randomBigint(256n))
  const salts = rafflePlayers.map((_p, i) => viem.keccak256(viem.toHex(`raffle-salt-${i}-${RUN_SALT}`)))
  const commitmentFor = (guess: bigint, salt: viem.Hex, player: viem.Hex): viem.Hex =>
    viem.keccak256(
      viem.encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes32' }, { type: 'address' }], [guess, salt, player]),
    )
  const ticketIds: bigint[] = []
  const committedAtBlocks: bigint[] = []
  let roundId: viem.Hex | undefined
  for (const [i, player] of rafflePlayers.entries()) {
    const receipt = await send(
      `commit ${i}`,
      walletFor(player),
      raffleAddr,
      raffleAbi,
      'commit',
      [STAKE, 3n, RAFFLE_PERIOD, subset, commitmentFor(guesses[i]!, salts[i]!, player.address)],
      STAKE,
      COMMIT_GAS,
    )
    const committed = viem.parseEventLogs({ abi: raffleAbi, eventName: 'Committed', logs: receipt.logs })[0]
      ?.args as { ticketId?: bigint; roundId?: viem.Hex } | undefined
    if (committed?.ticketId === undefined || !committed.roundId) throw new Error('no Committed event')
    ticketIds.push(committed.ticketId)
    committedAtBlocks.push(receipt.blockNumber)
    roundId = committed.roundId
  }

  console.log('[raffle] arming (heats the subset) and casting')
  const createdRound = (await publicClient.readContract({
    address: raffleAddr,
    abi: raffleAbi,
    functionName: 'rounds',
    args: [roundId!],
  })) as any[]
  await advancePastBlock((createdRound[4] as bigint) + RAFFLE_PERIOD - 1n) // period must elapse before arm
  const armReceipt = await send('arm', wallet, raffleAddr, raffleAbi, 'arm', [roundId!, raffleLocations])
  const armed = viem.parseEventLogs({ abi: raffleAbi, eventName: 'Armed', logs: armReceipt.logs })[0]?.args as
    | { key?: viem.Hex }
    | undefined
  if (!armed?.key) throw new Error('no Armed event')
  const raffleCastReceipt = await send('cast', wallet, random, randomAbi, 'cast', [armed.key, raffleLocations, raffleSecrets])
  const drawn = viem.parseEventLogs({ abi: raffleAbi, eventName: 'Drawn', logs: raffleCastReceipt.logs })[0]
    ?.args as { draw?: bigint; claimDeadline?: bigint } | undefined
  if (drawn?.draw === undefined || drawn.claimDeadline === undefined) throw new Error('no Drawn event')
  const seed = (await publicClient.readContract({
    address: random,
    abi: randomAbi,
    functionName: 'randomness',
    args: [armed.key],
  })) as { seed: viem.Hex }
  if (raffleDraw(seed.seed) !== drawn.draw) throw new Error('seed/draw mismatch — wrong key?')

  console.log('[raffle] all three reveal')
  for (const [i, player] of rafflePlayers.entries()) {
    await send(
      `reveal ${i}`,
      walletFor(player),
      raffleAddr,
      raffleAbi,
      'reveal',
      [ticketIds[i]!, guesses[i]!, salts[i]!],
      0n,
      REVEAL_GAS,
    )
  }

  const entries = rafflePlayers.map((player, i) => ({
    ticketId: ticketIds[i]!,
    player: player.address as viem.Hex,
    guess: guesses[i]!,
    committedAtBlock: committedAtBlocks[i]!,
    revealed: true,
  }))
  const raffleOffChain = raffle.settle(
    { stake: STAKE, threshold: 3n, period: RAFFLE_PERIOD, validatorSubset: subset },
    entries,
    seed.seed,
  )
  const roundAfterReveals = (await publicClient.readContract({
    address: raffleAddr,
    abi: raffleAbi,
    functionName: 'rounds',
    args: [roundId!],
  })) as any[]
  const onChainBestTicket = roundAfterReveals[12] as bigint
  console.log(`  draw      : ${drawn.draw}`)
  console.log(`  off-chain : ticket ${raffleOffChain?.ticketId} (${raffleOffChain?.player})`)
  console.log(`  on-chain  : ticket ${onChainBestTicket}`)
  if (raffleOffChain?.ticketId !== onChainBestTicket) throw new Error('RAFFLE PARITY MISMATCH')
  console.log('  RAFFLE PARITY OK')

  // --- Finalise (the payout) — needs the 100-block claim window to lapse -------------------
  let finaliseNote = ''
  if (SKIP_FINALISE) {
    finaliseNote = `finalise skipped; after block ${drawn.claimDeadline} anyone may call Raffle.finalise(${roundId})`
    console.log(`[raffle] ${finaliseNote}`)
  } else {
    console.log(`[raffle] waiting out the claim window (deadline block ${drawn.claimDeadline})`)
    await advancePastBlock(drawn.claimDeadline)
    const finaliseReceipt = await send('finalise', wallet, raffleAddr, raffleAbi, 'finalise', [roundId!])
    const finalised = viem.parseEventLogs({ abi: raffleAbi, eventName: 'Finalised', logs: finaliseReceipt.logs })[0]
      ?.args as { winner?: viem.Hex; payout?: bigint } | undefined
    if (!finalised?.winner) throw new Error('no Finalised event')
    if (!viem.isAddressEqual(finalised.winner, raffleOffChain!.player)) throw new Error('FINALISE PARITY MISMATCH')
    finaliseNote = `finalised, payout ${coins(finalised.payout ?? 0n)} to ${finalised.winner}`
    console.log(`  ${finaliseNote}`)
  }
  console.log('')

  // --- Run log ------------------------------------------------------------------------------
  const logEntry = [
    `### Run ${new Date().toISOString().slice(0, 10)} (chain ${CHAIN})`,
    '',
    `- Random: \`${random}\``,
    `- CoinFlip: \`${coinFlipAddr}\``,
    `- Raffle: \`${raffleAddr}\``,
    `- Duel: seed \`${settled.seed}\`, winner \`${settled.winner}\` (${duelOffChain.winningSide}) — off-chain == on-chain ✓`,
    `- Raffle: draw ${drawn.draw}, winning ticket ${onChainBestTicket} (\`${raffleOffChain!.player}\`) — off-chain == on-chain ✓; ${finaliseNote}`,
    '',
  ].join('\n')
  console.log('--- run log entry ---')
  console.log(logEntry)
  if (!IS_LOCAL && env.NO_RUN_LOG !== 'true') {
    const readme = fs.readFileSync(README, 'utf8')
    const marker = '## 943 run log'
    const placeholder = /\n_No 943 run recorded yet[^\n]*\n/
    const updated = readme.includes(marker)
      ? readme
          .replace(placeholder, '\n')
          .replace(marker, `${marker}\n\n${logEntry}`)
      : `${readme}\n${marker}\n\n${logEntry}`
    fs.writeFileSync(README, updated)
    console.log(`appended to ${path.relative(process.cwd(), README)}`)
  }
  console.log('ALL PARITY CHECKS PASSED')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
