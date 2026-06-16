/**
 * Autonomous testnet players for the OFF-CHAIN SESSION games (chain 943).
 *
 * Where player-bots.ts keeps the ON-CHAIN coinflip/raffle tables moving, this driver keeps the
 * off-chain `@gibs/msgboard-games` HouseSession tables alive: dice, limbo, plinko, keno, and the
 * stateful mines. The on-chain games already have bots — this one does NOT touch them.
 *
 * Each game runs its own table loop. A table is a `HouseSession` constructed exactly the way the
 * web hook (examples/games/web/src/hooks/useSession.ts) builds one:
 *   - PLAYER signer  : a viem account derived from MNEMONIC (mnemonicToAccount). A viem account
 *                      satisfies the session `Signer` shape (signTypedData + signMessage).
 *   - HOUSE signer   : a fresh ephemeral in-process key per table (privateKeyToAccount). The
 *                      HouseSession is documented as an in-process player↔house driver; a real
 *                      deployment splits the house onto its own machine over the same transport.
 *   - SEED source    : a 32-byte random tip generated locally; buildSeedChain hashes it down and
 *                      the OPEN envelope publishes only the `commit`. Every round's server seed is
 *                      revealed + chain-verified by the session itself (provably fair, in-process).
 *   - DOMAIN         : makeDomain(chainId, verifyingContract). chainId comes from the deployment;
 *                      verifyingContract defaults to the on-chain `random` address from
 *                      943-deployment.json as a stable anchor (no on-chain settle yet — see notes).
 *
 * NOTE on seeds/RPC: the current HouseSession is fully in-process and does NOT pull on-chain
 * validator reveals; the seed chain is built locally. We therefore load the deployment only to pin
 * the EIP-712 domain (chainId + verifyingContract) on the same 943 config the other bots use via
 * actor-common. If/when the session pulls on-chain reveals, the RPC wiring in actor-common drops in
 * unchanged. No 943 RPC round-trips are made by this driver today.
 *
 * Hi-Lo War is intentionally NOT covered here: it is a TWO-peer ZK-card session (@gibs/hilo-war
 * needs a MaskedDeckProvider + a paired counterpart client over a real transport), not a
 * single-process HouseSession. duel.ts covers on-chain coinflip parity, NOT hilo-war, so nothing
 * is duplicated either way; a hilo bot would be a separate paired-client driver — see report.
 *
 * Pacing: before signing each turn the bot sleeps a randomized human-like "think" delay
 * (~0.3–3s). Because the session stamps offeredAt/signedAt around that sleep and
 * broadcastAt/confirmedAt around the (near-instant, in-process) co-sign, decisionMs comes out
 * dominated by the think delay and networkMs by the local round-trip — a non-trivial decomposition.
 * Randomness is drawn from node crypto (NOT Math.random) so it is genuinely varied per turn.
 *
 * Env (mirrors actor-common conventions):
 *   MNEMONIC     required — the player signer is addressIndex SESSION_BOT_INDEX (default 30, clear
 *                of validators 1-3, gate players 4-8, and player-bots 11/20+).
 *   CHAIN        default 943 — selects the deployment loaded for the domain.
 *   CONFIG       optional explicit deployment path (else <CHAIN>-deployment.json next to this file).
 *   RPC          accepted for parity with the other bots; unused today (in-process seeds).
 *   GAMES        comma list to restrict which games run (default: dice,limbo,plinko,keno,mines).
 *   CHAIN_LENGTH default 256 — rounds the committed seed chain affords before a table reopens.
 *   THINK_MIN_MS / THINK_MAX_MS  default 300 / 3000 — the randomized per-turn think window.
 *   ROUND_GAP_MS default 1500 — extra idle gap between rounds on a table (jittered 0.5x..1.5x).
 *   START_BALANCE / HOUSE_BALANCE  opening chip balances (ether units, default 100 / 100000).
 *   ONCE=true    play a single round on each table then exit (smoke check).
 */
import * as viem from 'viem'
import { mnemonicToAccount, privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import {
  HouseSession,
  makeDomain,
  decisionMs,
  networkMs,
  totalMs,
  dice,
  limbo,
  plinko,
  keno,
  start as minesStart,
  reveal as minesReveal,
  cashOut as minesCashOut,
  hashBoard as minesHashBoard,
  hashGameState as minesHashGameState,
  playerDelta as minesPlayerDelta,
  multiplierX100At as minesMultiplierX100At,
  MinesPhase,
  type Game,
  type Signer,
  type MinesBoard,
  type MinesConfig,
} from '@gibs/msgboard-games'
import { loadDeployment } from './actor-common'

const env = process.env
const CHAIN = env.CHAIN ? Number(env.CHAIN) : 943
const SESSION_BOT_INDEX = env.SESSION_BOT_INDEX ? Number(env.SESSION_BOT_INDEX) : 30
const CHAIN_LENGTH = env.CHAIN_LENGTH ? Number(env.CHAIN_LENGTH) : 256
const THINK_MIN_MS = env.THINK_MIN_MS ? Number(env.THINK_MIN_MS) : 300
const THINK_MAX_MS = env.THINK_MAX_MS ? Number(env.THINK_MAX_MS) : 3000
const ROUND_GAP_MS = env.ROUND_GAP_MS ? Number(env.ROUND_GAP_MS) : 1500
const START_BALANCE = viem.parseEther(env.START_BALANCE || '100')
const HOUSE_BALANCE = viem.parseEther(env.HOUSE_BALANCE || '100000')
const STAKE = viem.parseEther(env.STAKE || '1')

const ALL_GAMES = ['dice', 'limbo', 'plinko', 'keno', 'mines'] as const
type GameName = (typeof ALL_GAMES)[number]
const SELECTED: GameName[] = (env.GAMES ? env.GAMES.split(',').map((s) => s.trim()) : [...ALL_GAMES]).filter(
  (g): g is GameName => (ALL_GAMES as readonly string[]).includes(g),
)

let running = true

// ---- randomness / pacing -----------------------------------------------------------------------
// crypto-derived varied delays (NOT Math.random, per the task) — uniform in [min, max].
const randUint = (): number => crypto.getRandomValues(new Uint32Array(1))[0]! / 0x1_0000_0000
const thinkDelay = (): number => Math.round(THINK_MIN_MS + randUint() * (THINK_MAX_MS - THINK_MIN_MS))
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)))
/** sleepable cancel-aware wait that resolves early on shutdown. */
const idle = async (ms: number) => {
  const end = Date.now() + ms
  while (running && Date.now() < end) await sleep(Math.min(100, end - Date.now()))
}
const randBytes32 = (): viem.Hex => viem.bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
const randInt = (n: number): number => Math.floor(randUint() * n)
const pick = <T,>(xs: readonly T[]): T => xs[randInt(xs.length)]!

// ---- per-game param generators ------------------------------------------------------------------
// Sane, bounded params so a table doesn't drain the house or hit a module range error.
const diceParams = () => ({ targetX100: BigInt(2000 + randInt(6000)) }) // roll-under 20%..80%
const limboParams = () => ({ targetX100: BigInt(150 + randInt(850)) }) // 1.50x..10.00x target
const plinkoParams = () => ({ rows: 16, risk: pick(['low', 'medium', 'high'] as const) })
const kenoParams = () => {
  const count = 1 + randInt(10) // 1..10 distinct picks of 1..40
  const picks = new Set<number>()
  while (picks.size < count) picks.add(1 + randInt(40))
  return { picks: [...picks] }
}

// ---- signer construction (mirrors useSession.ts) ------------------------------------------------
const playerSigner = mnemonicToAccount(env.MNEMONIC ?? 'test test test test test test test test test test test junk', {
  addressIndex: SESSION_BOT_INDEX,
}) as unknown as Signer
const newHouse = (): Signer => privateKeyToAccount(generatePrivateKey()) as unknown as Signer

const newTableId = (label: string): viem.Hex =>
  viem.keccak256(viem.stringToHex(`mbg:${label}:${Date.now()}:${randInt(1_000_000)}`))

const fmt = (wei: bigint) => viem.formatEther(wei)

// ---------------------------------------------------------------------------------------------
// single-draw games (dice / limbo / plinko / keno): one HouseSession.playRound per turn.
// ---------------------------------------------------------------------------------------------
const runDrawTable = async <TParams>(
  name: GameName,
  game: Game<TParams>,
  domain: ReturnType<typeof makeDomain>,
  genParams: () => TParams,
) => {
  // Controllable clock: the session captures offeredAt as the FIRST now() of a round, then signedAt
  // after co-sign. We sleep the think delay BEFORE the round, so to make that show up as decisionMs
  // we backdate ONLY that first read by the think duration via a one-shot offset. The remaining
  // marks (signedAt/broadcastAt/confirmedAt) read true wall-clock, so signedAt-offeredAt ≈ think
  // and confirmedAt-broadcastAt stays the real in-process co-sign latency.
  let pendingThinkMs = 0
  const clock = () => {
    const t = Date.now() - pendingThinkMs
    pendingThinkMs = 0 // one-shot: only the offeredAt read is backdated
    return t
  }
  while (running) {
    const session = new HouseSession<TParams>({
      domain,
      tableId: newTableId(name),
      game,
      player: playerSigner,
      house: newHouse(),
      seedTip: randBytes32(),
      chainLength: CHAIN_LENGTH,
      openBalances: { player: START_BALANCE, house: HOUSE_BALANCE },
      settlementMode: 0,
      clock,
    })
    await session.open()
    console.log(`[${name}] table open commit=${session.chain.commit.slice(0, 10)} player=${fmt(session.state.balancePlayer)}`)

    let round = 0
    while (running && Number(session.state.nonce) < CHAIN_LENGTH - 1) {
      // think before signing — this is the decision delay the timing decomposition measures.
      const think = thinkDelay()
      await idle(think)
      if (!running) break
      pendingThinkMs = think // backdate this round's offeredAt so decisionMs ≈ think
      const before = session.state.balancePlayer
      try {
        await session.playRound({ stake: STAKE, params: genParams(), clientSeed: randBytes32() })
      } catch (e) {
        // session throws on balance underflow — reopen a fresh table with topped-up chips.
        console.log(`[${name}] reopening table: ${(e as Error).message?.split('\n')[0]}`)
        break
      }
      round++
      const last = session.transcript.entries.at(-1)
      const body = last?.body as { outcome?: { win: boolean; playerDelta: string; multiplierX100: string } } | undefined
      const delta = session.state.balancePlayer - before
      const dMs = decisionMs(last?.timing)
      const nMs = networkMs(last?.timing)
      const tMs = totalMs(last?.timing)
      console.log(
        `[${name}] round ${round} stake=${fmt(STAKE)} ` +
          `${body?.outcome?.win ? 'WIN ' : 'lose'} x${(Number(body?.outcome?.multiplierX100 ?? 0n) / 100).toFixed(2)} ` +
          `delta=${delta >= 0n ? '+' : ''}${fmt(delta)} bal=${fmt(session.state.balancePlayer)} ` +
          `decision=${dMs ?? '?'}ms network=${nMs ?? '?'}ms total=${tMs ?? '?'}ms`,
      )
      if (env.ONCE === 'true') return
      await idle(ROUND_GAP_MS * (0.5 + randUint()))
    }
    if (env.ONCE === 'true') return
  }
}

// ---------------------------------------------------------------------------------------------
// MINES (stateful): start a board → reveal several safe tiles → cash out (randomized stop).
// Mines is NOT a single-draw `Game<TParams>`; it uses its own pure transitions. We drive it
// here directly (the HouseSession class only knows single-draw games), reusing the same
// player/house signers + a per-board committed layout, and report decision timing per move.
// Each tile reveal and the cash-out gets its own randomized think delay (multi-step turns).
// ---------------------------------------------------------------------------------------------
const randomMinesBoard = (config: MinesConfig): MinesBoard => {
  const mineTiles = new Set<number>()
  while (mineTiles.size < config.mines) mineTiles.add(randInt(config.tiles))
  return { config, mineTiles: [...mineTiles].sort((a, b) => a - b), salt: randBytes32() }
}

const runMinesTable = async () => {
  const config: MinesConfig = { tiles: 25, mines: 3 } // 5x5, 3 mines — common safe default
  let session = 0
  while (running) {
    session++
    const board = randomMinesBoard(config)
    const commit = minesHashBoard(board)
    let state = minesStart(config, commit)
    const safe = config.tiles - config.mines
    // randomized stop: aim to reveal somewhere in [1, safe-1] tiles before cashing out.
    const target = 1 + randInt(Math.max(1, Math.min(safe - 1, 6)))
    const order = Array.from({ length: config.tiles }, (_v, i) => i).sort(() => randUint() - 0.5)
    let reveals = 0
    let busted = false
    const t0 = Date.now()
    let decisionTotal = 0
    for (const tile of order) {
      if (!running) break
      if (reveals >= target) break
      const d = thinkDelay()
      await idle(d) // think before each reveal
      if (!running) break
      decisionTotal += d
      const res = minesReveal(state, tile, board.mineTiles.includes(tile))
      if ('error' in res) continue // tile already revealed (shouldn't happen with shuffled order)
      state = res.state
      reveals++
      if (state.phase === MinesPhase.BUSTED) {
        busted = true
        break
      }
    }
    if (!running) break
    let multX100 = 0n
    if (!busted && state.phase === MinesPhase.PLAYING && reveals > 0) {
      const d = thinkDelay()
      await idle(d)
      decisionTotal += d
      const res = minesCashOut(state)
      if (!('error' in res)) {
        state = res.state
        multX100 = minesMultiplierX100At(config, reveals)
      }
    }
    // the running state is the co-signed game-state hash preimage (each step would be co-signed
    // in a real session; here we settle the terminal delta against the stake).
    const stateHash = minesHashGameState(state)
    const delta = minesPlayerDelta(state, STAKE)
    console.log(
      `[mines] session ${session} reveals=${reveals}/${safe} ` +
        `${busted ? 'BUST' : 'cashout'} x${(Number(multX100) / 100).toFixed(2)} ` +
        `delta=${delta >= 0n ? '+' : ''}${fmt(delta)} ` +
        `decision=${decisionTotal}ms total=${Date.now() - t0}ms hash=${stateHash.slice(0, 10)}`,
    )
    if (env.ONCE === 'true') return
    await idle(ROUND_GAP_MS * (0.5 + randUint()))
  }
}

// ---- main -------------------------------------------------------------------------------------
const main = async () => {
  if (!env.MNEMONIC) throw new Error('MNEMONIC required')
  if (SELECTED.length === 0) throw new Error(`GAMES selected none of ${ALL_GAMES.join(',')}`)
  const config = loadDeployment(CHAIN, env.CONFIG)
  // verifyingContract: the on-chain `random` address anchors the EIP-712 domain on this chain.
  const domain = makeDomain(config.chainId, (config.random as viem.Hex) ?? viem.zeroAddress)
  console.log(
    `session bots on chain ${CHAIN}: player=${(playerSigner as { address: viem.Hex }).address} ` +
      `games=[${SELECTED.join(', ')}] stake=${fmt(STAKE)} think=${THINK_MIN_MS}-${THINK_MAX_MS}ms` +
      (env.ONCE === 'true' ? ' (ONCE)' : ''),
  )

  const tables: Promise<void>[] = []
  for (const g of SELECTED) {
    if (g === 'dice') tables.push(runDrawTable('dice', dice, domain, diceParams))
    else if (g === 'limbo') tables.push(runDrawTable('limbo', limbo, domain, limboParams))
    else if (g === 'plinko') tables.push(runDrawTable('plinko', plinko, domain, plinkoParams))
    else if (g === 'keno') tables.push(runDrawTable('keno', keno, domain, kenoParams))
    else if (g === 'mines') tables.push(runMinesTable())
  }
  await Promise.all(tables)
}

// graceful SIGINT shutdown (mirrors player-bots' clean-exit intent).
const shutdown = () => {
  if (!running) return
  running = false
  console.log('\nshutting down session bots — finishing in-flight turns…')
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
