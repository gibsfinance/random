/**
 * Two-player coin-flip duel for the CoinFlip periphery contract on PulseChain testnet v4
 * (chain 943). One self-contained run takes two distinct wallets through a full, real,
 * on-chain flip and shows the escrowed pot move to the parity-selected winner.
 *
 * What it does:
 *   1. Deploys CoinFlip(random) if no address is cached (core Random is already deployed).
 *   2. Inks a small validator entropy pool (price 0, so heat forwards no value) as the
 *      funded account, and funds the player wallets derived from the same mnemonic.
 *   3. Player 0 enters heads (queues); player 1 enters tails (pairs, inks both players,
 *      heats [p0, p1, ...validators], and returns the Random request key).
 *   4. Casts the revealed secrets in heat order, finalizing the seed. Random calls back
 *      onCast, which settles and pays the winner stake*2.
 *   5. Reads the seed and prints the winner and the before/after balances.
 *
 * Funding & key safety (important):
 *   Account 0 of MNEMONIC is the funded provider/deployer/funder/caster. The player wallets
 *   are FURTHER ACCOUNTS of the SAME funded mnemonic (account index 1, 2, ...), funded with
 *   stake + gas from account 0. These are ordinary wallets — they are never used as secret
 *   seeds, so this is the "non-seeds0" funding path. The seeds0 footgun (where secret[i] is
 *   wallet account i's private key) only applies to a dedicated RANDOMNESS_MNEMONIC used as a
 *   SECRET seed; this script never does that. Validator secrets are standalone keccak values.
 *
 * Safety: every state-changing call is simulated against the live contract first. DRY_RUN=true
 * simulates the ink and a player entry (using a balance state-override, so no real funding is
 * needed) and broadcasts NOTHING.
 *
 * The 12-block window: CoinFlip pins FLIP_DURATION = 12 blocks as the heat request's expiry.
 * The cast must land within ~12 blocks of the match; this script casts immediately. In
 * production that tight window is what the always-on validator node service exists to serve.
 *
 * Environment variables:
 *   MNEMONIC     funded recovery phrase, read in by the caller (e.g. `op read`); never logged.
 *   RPC_943      JSON-RPC endpoint (default: g4mm4 public testnet). Override to valve.city for
 *                reliability inside the 12-block window.
 *   STAKE_943    stake per player, in coins (default "0.1").
 *   COINFLIP     reuse an already-deployed CoinFlip address instead of deploying.
 *   VALIDATORS   validator pool size (default 3).
 *   WALK_AWAY    "true" => both players commit the public walk-away secret (1), demonstrating
 *                the validator-finalizable path. Default: each player reveals their own secret.
 *   EXPECTED_PROVIDER  address account 0 must derive to (default: the known funded account);
 *                set empty to skip the guard.
 *   DRY_RUN      "true" => simulate ink + a player entry and stop, broadcasting nothing.
 *
 * Run from packages/contracts:
 *   MNEMONIC="$(op read 'op://gibs/randomness/recovery phrase')" \
 *     npx tsx scripts/duel-943.ts
 */
import * as viem from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { pulsechainV4 } from 'viem/chains'
import * as fs from 'fs'
import * as path from 'path'
import RandomArtifact from '../artifacts/contracts/Random.sol/Random.json'
import CoinFlipArtifact from '../artifacts/contracts/CoinFlip.sol/CoinFlip.json'
import deployedAddresses from '../ignition/deployments/chain-943/deployed_addresses.json'

const randomAbi = RandomArtifact.abi as viem.Abi
const coinFlipAbi = CoinFlipArtifact.abi as viem.Abi
const coinFlipBytecode = CoinFlipArtifact.bytecode as viem.Hex
const RANDOM = (deployedAddresses as Record<string, viem.Hex>)['RandomModule#Random']

const env = process.env
const RPC = env.RPC_943 || 'https://rpc-testnet-pulsechain.g4mm4.io'
const STAKE = viem.parseEther(env.STAKE_943 || '0.1')
const VALIDATOR_COUNT = env.VALIDATORS ? Number(env.VALIDATORS) : 3
const WALK_AWAY = env.WALK_AWAY === 'true'
const DRY_RUN = env.DRY_RUN === 'true'
const EXPECTED_PROVIDER =
  env.EXPECTED_PROVIDER === undefined
    ? '0xAF2b2118376b51eEcB58327526bc082aED3e4225'
    : env.EXPECTED_PROVIDER
const ADDRESS_CACHE = path.join(__dirname, '.coinflip-943.json')

/** Mirrors the contract's WALK_AWAY_SECRET / WALK_AWAY_PREIMAGE. */
const WALK_AWAY_SECRET = viem.padHex('0x01', { size: 32 })
const WALK_AWAY_PREIMAGE = viem.keccak256(WALK_AWAY_SECRET)

/** The PreimageLocation.Info tuple the contracts expect. */
type Info = {
  provider: viem.Hex
  callAtChange: boolean
  durationIsTimestamp: boolean
  duration: bigint
  token: viem.Hex
  price: bigint
  offset: bigint
  index: bigint
}

const formatCoins = (value: bigint): string => `${viem.formatEther(value)} tPLS`

// A per-run salt makes every secret fresh each invocation. This is load-bearing for fairness, not
// cosmetic: the seed is a deterministic function of the revealed secrets (that is what makes it
// verifiable), so REUSING secrets reproduces the same seed and the same winner every time. Real
// entropy must be unique and unpredictable per flip — a production validator node never reuses a
// secret. Fresh randomness here (crypto-strong) models that.
const RUN_SALT = viem.bytesToHex(crypto.getRandomValues(new Uint8Array(32)))

/** A fresh 32-byte secret bound to a label + the per-run salt, plus its on-chain preimage. */
const makeSecret = (label: string): { secret: viem.Hex; preimage: viem.Hex } => {
  const secret = viem.keccak256(viem.toHex(`${label}-${RUN_SALT}`))
  return { secret, preimage: viem.keccak256(secret) }
}

const playerSecret = (player: { address: viem.Hex }): { secret: viem.Hex; preimage: viem.Hex } =>
  WALK_AWAY ? { secret: WALK_AWAY_SECRET, preimage: WALK_AWAY_PREIMAGE } : makeSecret(`coinflip-player-${player.address}`)

const loadCachedAddress = (): viem.Hex | undefined => {
  if (env.COINFLIP) return env.COINFLIP as viem.Hex
  if (!fs.existsSync(ADDRESS_CACHE)) return undefined
  return (JSON.parse(fs.readFileSync(ADDRESS_CACHE, 'utf8')) as { coinFlip?: viem.Hex }).coinFlip
}

const main = async () => {
  if (!env.MNEMONIC) {
    throw new Error('MNEMONIC is required (read it in via `op read`, it is never logged)')
  }

  const account = mnemonicToAccount(env.MNEMONIC) // index 0: provider + deployer + funder + caster
  if (EXPECTED_PROVIDER && !viem.isAddressEqual(account.address, EXPECTED_PROVIDER as viem.Hex)) {
    throw new Error(
      `derived ${account.address} does not match expected provider ${EXPECTED_PROVIDER}; ` +
        'wrong mnemonic or derivation. Aborting before any transaction.',
    )
  }
  // The two players are further accounts of the SAME funded mnemonic (non-seeds0 wallets).
  const player0 = mnemonicToAccount(env.MNEMONIC, { accountIndex: 1 }) // heads
  const player1 = mnemonicToAccount(env.MNEMONIC, { accountIndex: 2 }) // tails

  const transport = viem.http(RPC)
  const publicClient = viem.createPublicClient({ chain: pulsechainV4, transport })
  const wallet = viem.createWalletClient({ account, chain: pulsechainV4, transport })
  const wallet0 = viem.createWalletClient({ account: player0, chain: pulsechainV4, transport })
  const wallet1 = viem.createWalletClient({ account: player1, chain: pulsechainV4, transport })

  const gasPrice = await publicClient.getGasPrice()
  const maxPriorityFeePerGas = gasPrice / 10n > 0n ? gasPrice / 10n : 1n
  const maxFeePerGas = gasPrice * 2n + maxPriorityFeePerGas
  const fees = { maxFeePerGas, maxPriorityFeePerGas }
  // PulseChain prevalidates an eth_call's balance against gas * maxFeePerGas + value, and with
  // no explicit gas it assumes the BLOCK gas limit (~hundreds of millions) — which would demand
  // many coins from a lightly-funded player just to simulate. So player calls carry an explicit
  // gas cap, and the player fund covers that cap with headroom for a fee rise.
  const ENTER_HEADS_GAS = 2_000_000n
  const ENTER_TAILS_GAS = 6_000_000n // inks both players + heats 2 + N preimages
  const gasBuffer = maxFeePerGas * 8_000_000n
  const fundPerPlayer = STAKE + gasBuffer

  /** Simulate then broadcast a contract call from a given account, awaiting the receipt. */
  const send = async (
    label: string,
    from: ReturnType<typeof viem.createWalletClient>,
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
    console.log(`  ${label}: ${hash}`)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    console.log(`  ${label} mined in block ${receipt.blockNumber} (gas ${receipt.gasUsed}, ${receipt.status})`)
    if (receipt.status !== 'success') throw new Error(`${label} reverted on chain`)
    return receipt
  }

  const balance = await publicClient.getBalance({ address: account.address })

  console.log('--- CoinFlip two-player duel (chain 943) ---')
  console.log(`random contract : ${RANDOM}`)
  console.log(`account 0       : ${account.address} (provider + deployer + caster)`)
  console.log(`player 0 (heads): ${player0.address}  [mnemonic account index 1]`)
  console.log(`player 1 (tails): ${player1.address}  [mnemonic account index 2]`)
  console.log(`rpc             : ${RPC}`)
  console.log(`balance (acct0) : ${formatCoins(balance)}`)
  console.log(`stake/player    : ${formatCoins(STAKE)}`)
  console.log(`fund/player     : ${formatCoins(fundPerPlayer)} (stake + gas headroom)`)
  console.log(`validator pool  : ${VALIDATOR_COUNT} preimages (price 0)`)
  console.log(`secret source   : ${WALK_AWAY ? 'public walk-away secret (validator-finalizable)' : 'each player reveals their own secret'}`)
  console.log('')

  // --- Validator entropy pool definition (price 0; heat forwards no value) --------------
  const poolSection: Info = {
    provider: account.address,
    callAtChange: false,
    durationIsTimestamp: false,
    duration: 12n, // matches FLIP_DURATION
    token: viem.zeroAddress,
    price: 0n,
    offset: 0n,
    index: 0n,
  }
  const validatorSecrets = Array.from({ length: VALIDATOR_COUNT }, (_v, i) =>
    makeSecret(`coinflip-validator-${account.address}-${i}`),
  )
  const inkData = viem.concatHex(validatorSecrets.map((s) => s.preimage))

  const secretP0 = playerSecret(player0)
  const secretP1 = playerSecret(player1)

  // --- DRY_RUN: simulate, broadcast nothing -------------------------------------------
  if (DRY_RUN) {
    console.log('[dry-run] simulating ink (validator pool) against the live contract...')
    await publicClient.simulateContract({
      address: RANDOM,
      abi: randomAbi,
      functionName: 'ink',
      args: [poolSection, inkData],
      account,
      value: 0n,
      ...fees,
    })
    console.log('  ink simulation OK.')

    const coinFlip = loadCachedAddress()
    if (!coinFlip) {
      console.log('[dry-run] no deployed CoinFlip address (cache/COINFLIP empty); cannot simulate the')
      console.log('          match/cast — those depend on a deployed contract and sequential on-chain')
      console.log('          state. A live run will deploy first. Constructor args verified: [random].')
    } else {
      console.log(`[dry-run] simulating player 0 enter (heads) against ${coinFlip} with a balance override...`)
      await publicClient.simulateContract({
        address: coinFlip,
        abi: coinFlipAbi,
        functionName: 'enterAndMatch',
        args: [0, secretP0.preimage, []],
        account: player0,
        value: STAKE,
        ...fees,
        gas: ENTER_HEADS_GAS,
        stateOverride: [{ address: player0.address, balance: fundPerPlayer }],
      })
      console.log('  player 0 enter simulation OK.')
    }
    console.log('\nDRY_RUN=true -> nothing was broadcast. Re-run without DRY_RUN to deploy and duel.')
    return
  }

  // --- Live: deploy or reuse CoinFlip --------------------------------------------------
  let coinFlip = loadCachedAddress()
  if (!coinFlip) {
    console.log('[deploy] deploying CoinFlip(random)')
    const hash = await wallet.deployContract({ abi: coinFlipAbi, bytecode: coinFlipBytecode, args: [RANDOM], ...fees })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('CoinFlip deploy reverted')
    coinFlip = receipt.contractAddress
    fs.writeFileSync(ADDRESS_CACHE, JSON.stringify({ coinFlip }, null, 2))
    console.log(`  CoinFlip deployed at ${coinFlip} (block ${receipt.blockNumber}, cached)`)
  } else {
    console.log(`[deploy] reusing CoinFlip at ${coinFlip}`)
  }
  console.log('')

  // --- Ink the validator pool ----------------------------------------------------------
  console.log(`[ink] inking ${VALIDATOR_COUNT} validator preimages (price 0)`)
  const inkReceipt = await send('ink', wallet, RANDOM, randomAbi, 'ink', [poolSection, inkData], 0n)
  const inkArgs = viem.parseEventLogs({ abi: randomAbi, eventName: 'Ink', logs: inkReceipt.logs })[0]?.args as
    | { offset?: bigint }
    | undefined
  const poolOffset = inkArgs?.offset !== undefined ? BigInt.asUintN(128, inkArgs.offset >> 128n) : 0n
  console.log(`  validator pool offset ${poolOffset}`)
  const validatorLocations: Info[] = validatorSecrets.map((_s, index) => ({
    ...poolSection,
    offset: poolOffset,
    index: BigInt(index),
  }))
  console.log('')

  // --- Fund the player wallets (stake + gas) from account 0 (non-seeds0 mnemonic) ------
  console.log('[fund] funding player wallets from account 0')
  for (const [label, player] of [['player 0', player0], ['player 1', player1]] as const) {
    const have = await publicClient.getBalance({ address: player.address })
    if (have >= fundPerPlayer) {
      console.log(`  ${label} already holds ${formatCoins(have)} (>= ${formatCoins(fundPerPlayer)})`)
      continue
    }
    const top = fundPerPlayer - have
    console.log(`  ${label} <- ${formatCoins(top)}`)
    const hash = await wallet.sendTransaction({ to: player.address, value: top, ...fees })
    await publicClient.waitForTransactionReceipt({ hash })
  }
  console.log('')

  // --- The duel: player 0 heads (queues), player 1 tails (pairs + heats) ---------------
  console.log('[match] player 0 enters HEADS (queues)')
  await send('enter-heads', wallet0, coinFlip, coinFlipAbi, 'enterAndMatch', [0, secretP0.preimage, []], STAKE, ENTER_HEADS_GAS)

  console.log('[match] player 1 enters TAILS (pairs, inks players, heats)')
  const matchReceipt = await send(
    'enter-tails',
    wallet1,
    coinFlip,
    coinFlipAbi,
    'enterAndMatch',
    [1, secretP1.preimage, validatorLocations],
    STAKE,
    ENTER_TAILS_GAS,
  )
  const paired = viem.parseEventLogs({ abi: coinFlipAbi, eventName: 'Paired', logs: matchReceipt.logs })[0]?.args as
    | { flipId?: viem.Hex }
    | undefined
  const heated = viem.parseEventLogs({ abi: coinFlipAbi, eventName: 'Heated', logs: matchReceipt.logs })[0]?.args as
    | { key?: viem.Hex; playerOffset?: bigint }
    | undefined
  const flipId = paired?.flipId
  const key = heated?.key
  const playerOffset = heated?.playerOffset
  if (!flipId || !key || playerOffset === undefined) {
    throw new Error('match did not emit Paired + Heated; cannot continue')
  }
  console.log(`  flipId ${flipId}`)
  console.log(`  request key ${key} (player offset ${playerOffset})`)
  console.log('')

  // --- Cast: reveal secrets in heat order [p0, p1, ...validators] ----------------------
  const playerLoc0 = (await publicClient.readContract({
    address: coinFlip,
    abi: coinFlipAbi,
    functionName: 'playerSection',
    args: [playerOffset, 0n],
  })) as Info
  const playerLoc1 = (await publicClient.readContract({
    address: coinFlip,
    abi: coinFlipAbi,
    functionName: 'playerSection',
    args: [playerOffset, 1n],
  })) as Info
  const selections: Info[] = [playerLoc0, playerLoc1, ...validatorLocations]
  const secrets: viem.Hex[] = [secretP0.secret, secretP1.secret, ...validatorSecrets.map((s) => s.secret)]

  console.log('[cast] revealing secrets to finalize the seed (account 0)')
  const castReceipt = await send('cast', wallet, RANDOM, randomAbi, 'cast', [key, selections, secrets])
  const settled = viem.parseEventLogs({ abi: coinFlipAbi, eventName: 'Settled', logs: castReceipt.logs })[0]?.args as
    | { winner?: viem.Hex; winningSide?: number; payout?: bigint; seed?: viem.Hex }
    | undefined
  console.log('')

  // --- Result --------------------------------------------------------------------------
  const seed = (await publicClient.readContract({
    address: RANDOM,
    abi: randomAbi,
    functionName: 'randomness',
    args: [key],
  })) as { seed: viem.Hex }
  const winningSide = (BigInt(seed.seed) & 1n) === 0n ? 'HEADS (player 0)' : 'TAILS (player 1)'
  const bal0 = await publicClient.getBalance({ address: player0.address })
  const bal1 = await publicClient.getBalance({ address: player1.address })

  console.log('--- result ---')
  console.log(`seed            : ${seed.seed}`)
  console.log(`parity          : ${winningSide}`)
  if (settled?.winner) {
    console.log(`Settled winner  : ${settled.winner} (payout ${formatCoins(settled.payout ?? 0n)})`)
  } else {
    console.log('no Settled event in the cast receipt — onCast push may have failed; try claim(flipId).')
  }
  console.log(`player 0 balance: ${formatCoins(bal0)}`)
  console.log(`player 1 balance: ${formatCoins(bal1)}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
