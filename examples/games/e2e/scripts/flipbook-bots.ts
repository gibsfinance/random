/**
 * Autonomous FlipBook players: keep the P2P coin-flip offer book alive on testnet and soak-test
 * every contract path continuously. Stateless — the book rebuilds from chain events each tick,
 * and the maker's (choice, salt) re-derives deterministically from (seeds0, offerId), so restarts
 * lose nothing and no secret is ever stored.
 *
 * Per tick (with jitter):
 *   maker  — keep up to MAX_OPEN standing offers posted (stake from STAKES, bond = stake/5,
 *            3h take window, 15min reveal window); cancel own offers past their deadline.
 *   taker  — take any open HUMAN offer immediately (stake ≤ MAX_STAKE — humans always find a
 *            counterparty); take the maker bot's offers on the sparing cadence so the book stays
 *            visibly populated between flips.
 *   reveal — open the commit on own taken offers inside the window… except a deterministic
 *            FORFEIT_PCT of them, which the maker deliberately sits out so the forfeit path
 *            (claim pays 2·stake + bond to the taker) gets ambient exercise too.
 *   claim  — crank any taken offer past its reveal window (permissionless).
 *
 * Secret plan: salt(offerId) = keccak(flipKey ‖ offerId), choice = keccak(salt) & 1. The maker
 * posts against the PREDICTED next offerId; if a rare race shifts the id, reveal-time recovery
 * scans a small id window and verifies against the on-chain commit before sending, so a
 * mis-predicted commit is never revealed blind (worst case that offer forfeits its bond).
 *
 * Env: MNEMONIC (funded; maker = addressIndex 30, taker = 31 — clear of validators 1-3, gate
 *      players 4-8, watcher 10, ops 11, player-bots 20+ — topped up from account 0),
 *      SEEDS0 (secret derivation), CHAIN (default 943), RPC, FLIPBOOK (contract address),
 *      FLIPBOOK_DEPLOY_BLOCK (event-scan origin), STAKES (default "0.1,0.25,0.5"),
 *      MAX_OPEN (default 2), MAX_STAKE (take cap, default 25), FORFEIT_PCT (default 10),
 *      INTERVAL_MS (default 120000), SELF_PLAY_INTERVAL_MS (default 0),
 *      VAULT_FLOOR (default 100) — same pause semantics as player-bots. ONCE=true single pass.
 */
import * as viem from 'viem'
import type { GamesChainId } from '@gibs/games-core'
import { seeds0Secret } from './seeds0'
import { makeActor, sendAs, flooredFees, chunkedEvents } from './actor-common'

const env = process.env
const CHAIN = (env.CHAIN ? Number(env.CHAIN) : 943) as GamesChainId
const FLIPBOOK = (env.FLIPBOOK ?? '0xb009bd8b849dd33d9c5081ec6e53f29a947f6832') as viem.Hex
const FROM_BLOCK = BigInt(env.FLIPBOOK_DEPLOY_BLOCK ?? '24921235')
const STAKES = (env.STAKES ?? '0.1,0.25,0.5').split(',').map((s) => viem.parseEther(s.trim()))
const MAX_OPEN = env.MAX_OPEN ? Number(env.MAX_OPEN) : 2
const MAX_STAKE = viem.parseEther(env.MAX_STAKE || '25')
const FORFEIT_PCT = env.FORFEIT_PCT ? Number(env.FORFEIT_PCT) : 10
const INTERVAL_MS = env.INTERVAL_MS ? Number(env.INTERVAL_MS) : 120_000
const SELF_PLAY_INTERVAL_MS = env.SELF_PLAY_INTERVAL_MS ? Number(env.SELF_PLAY_INTERVAL_MS) : 0
const VAULT_FLOOR = viem.parseEther(env.VAULT_FLOOR || '100')
const MAKER_INDEX = 30
const TAKER_INDEX = 31
const FLIP_KEY_BASE = 60_000_000 // reserved seeds0 range (player-bots use 50M+, validators i*100k)
const GAS_CUSHION = viem.parseEther('1')
const TOP_UP_BELOW = viem.parseEther('20')
const TOP_UP_TO = viem.parseEther('100')
const TAKE_DEADLINE_S = 3n * 3600n
const REVEAL_WINDOW_S = 900
const ID_RECOVERY_WINDOW = 5n // reveal-time scan for race-shifted predicted ids

const flipBookAbi = viem.parseAbi([
  'function post(bytes32 commit, uint256 bond_, uint64 takeDeadline, uint32 revealWindow) payable returns (uint256)',
  'function cancel(uint256 offerId)',
  'function take(uint256 offerId, bool guess) payable',
  'function reveal(uint256 offerId, bool choice, bytes32 salt)',
  'function claim(uint256 offerId)',
  'function nextOfferId() view returns (uint256)',
  'event OfferPosted(uint256 indexed offerId, address indexed maker, bytes32 commit, uint256 stake, uint256 bond, uint64 takeDeadline, uint32 revealWindow)',
  'event OfferCancelled(uint256 indexed offerId)',
  'event OfferTaken(uint256 indexed offerId, address indexed taker, bool guess, uint256 revealBy)',
  'event Revealed(uint256 indexed offerId, bool choice, address indexed winner, uint256 pot)',
  'event Forfeited(uint256 indexed offerId, address indexed taker, uint256 amount)',
])

type Offer = {
  offerId: bigint
  maker: viem.Hex
  commit: viem.Hex
  stake: bigint
  bond: bigint
  takeDeadline: bigint
  status: 'open' | 'taken' | 'settled'
  taker?: viem.Hex
  revealBy?: bigint
}

const main = async () => {
  if (!env.MNEMONIC) throw new Error('MNEMONIC required')
  if (!env.SEEDS0) throw new Error('SEEDS0 required')
  const funder = makeActor(CHAIN, env.MNEMONIC, 0, env.RPC)
  const maker = makeActor(CHAIN, env.MNEMONIC, MAKER_INDEX, env.RPC)
  const taker = makeActor(CHAIN, env.MNEMONIC, TAKER_INDEX, env.RPC)
  const publicClient = funder.publicClient
  const flipKey = seeds0Secret(env.SEEDS0!, FLIP_KEY_BASE)
  console.log(`flipbook bots on chain ${CHAIN} @ ${FLIPBOOK}: maker ${maker.account.address}, taker ${taker.account.address}`)

  let lastSelfPlay = 0
  const selfPlayAllowed = () => Date.now() - lastSelfPlay >= SELF_PLAY_INTERVAL_MS
  const markSelfPlay = () => {
    lastSelfPlay = Date.now()
  }
  let vaultPaused = false

  /** The maker's deterministic secret for an offer id — recomputable forever from seeds0. */
  const planFor = (offerId: bigint) => {
    const salt = viem.keccak256(viem.concatHex([flipKey, viem.toHex(offerId, { size: 32 })]))
    const choice = (BigInt(viem.keccak256(salt)) & 1n) === 1n
    // The deliberate no-show: a fixed slice of flips is never revealed so the forfeit/claim path
    // stays exercised. Derived from the salt → deterministic across restarts.
    const forfeit = BigInt(viem.keccak256(viem.concatHex([salt, '0x666f7266656974']))) % 100n < BigInt(FORFEIT_PCT)
    return { salt, choice, forfeit }
  }
  const commitFor = (makerAddr: viem.Hex, choice: boolean, salt: viem.Hex): viem.Hex =>
    viem.keccak256(
      viem.encodeAbiParameters([{ type: 'address' }, { type: 'bool' }, { type: 'bytes32' }], [makerAddr, choice, salt]),
    )
  /** Recover (choice, salt) for one of OUR offers by matching its on-chain commit (race-proof). */
  const recoverPlan = (offer: Offer) => {
    for (let id = offer.offerId; id >= 1n && id + ID_RECOVERY_WINDOW >= offer.offerId; id--) {
      const p = planFor(id)
      if (commitFor(maker.account.address, p.choice, p.salt) === offer.commit) return p
    }
    return undefined
  }

  const book = async (): Promise<Offer[]> => {
    const events = (eventName: 'OfferPosted' | 'OfferCancelled' | 'OfferTaken' | 'Revealed' | 'Forfeited') =>
      chunkedEvents(publicClient, { address: FLIPBOOK, abi: flipBookAbi as viem.Abi, eventName, fromBlock: FROM_BLOCK })
    const [posted, cancelled, taken, revealed, forfeited] = await Promise.all([
      events('OfferPosted'),
      events('OfferCancelled'),
      events('OfferTaken'),
      events('Revealed'),
      events('Forfeited'),
    ])
    const byId = new Map<string, Offer>()
    for (const log of posted) {
      const a = log.args as { offerId: bigint; maker: viem.Hex; commit: viem.Hex; stake: bigint; bond: bigint; takeDeadline: bigint }
      byId.set(a.offerId.toString(), { ...a, status: 'open' })
    }
    for (const log of taken) {
      const a = log.args as { offerId: bigint; taker: viem.Hex; revealBy: bigint }
      const o = byId.get(a.offerId.toString())
      if (o) Object.assign(o, { status: 'taken', taker: a.taker, revealBy: a.revealBy })
    }
    for (const log of [...cancelled, ...revealed, ...forfeited]) {
      const o = byId.get(((log.args as { offerId: bigint }).offerId).toString())
      if (o) o.status = 'settled'
    }
    return [...byId.values()]
  }

  const topUp = async () => {
    if (vaultPaused) return
    for (const bot of [maker, taker]) {
      const balance = await publicClient.getBalance({ address: bot.account.address })
      if (balance >= TOP_UP_BELOW) continue
      const hash = await funder.wallet.sendTransaction({
        to: bot.account.address,
        value: TOP_UP_TO - balance,
        ...(await flooredFees(publicClient)),
      })
      await publicClient.waitForTransactionReceipt({ hash })
      console.log(`topped up ${bot.account.address}`)
    }
  }

  const tick = async () => {
    const vault = await publicClient.getBalance({ address: funder.account.address })
    const nowPaused = vault < VAULT_FLOOR
    if (nowPaused !== vaultPaused) {
      console.log(nowPaused ? `vault below floor — flipbook bots paused on chain ${CHAIN}` : 'vault refilled — flipbook bots resume')
    }
    vaultPaused = nowPaused
    await topUp()

    const now = BigInt(Math.floor(Date.now() / 1000))
    const offers = await book()
    const makerAddr = maker.account.address.toLowerCase()
    const takerAddr = taker.account.address.toLowerCase()

    // claim anything whose reveal window lapsed (permissionless crank; pays the offer's taker)
    for (const o of offers) {
      if (o.status !== 'taken' || now <= (o.revealBy ?? 0n)) continue
      await sendAs(taker.publicClient, taker.wallet, {
        address: FLIPBOOK, abi: flipBookAbi, functionName: 'claim', args: [o.offerId],
      })
      console.log(`claimed forfeit on #${o.offerId} (maker sat out the window)`)
    }

    // reveal own taken offers still inside the window — minus the deliberate forfeit slice
    for (const o of offers) {
      if (o.status !== 'taken' || o.maker.toLowerCase() !== makerAddr || now > (o.revealBy ?? 0n)) continue
      const plan = recoverPlan(o)
      if (!plan) {
        console.error(`no recoverable plan for own offer #${o.offerId} — leaving to forfeit`)
        continue
      }
      if (plan.forfeit) continue // the no-show slice: taker will claim after the window
      await sendAs(maker.publicClient, maker.wallet, {
        address: FLIPBOOK, abi: flipBookAbi, functionName: 'reveal', args: [o.offerId, plan.choice, plan.salt],
      })
      console.log(`revealed #${o.offerId} (${plan.choice ? 'heads' : 'tails'})`)
    }

    if (vaultPaused) return

    // cancel own offers nobody took before the deadline (full refund; keeps the book fresh)
    for (const o of offers) {
      if (o.status !== 'open' || o.maker.toLowerCase() !== makerAddr || now <= o.takeDeadline) continue
      await sendAs(maker.publicClient, maker.wallet, {
        address: FLIPBOOK, abi: flipBookAbi, functionName: 'cancel', args: [o.offerId],
      })
      console.log(`cancelled own expired offer #${o.offerId}`)
    }

    // take: human offers immediately (service), the bot's own offers on the sparing cadence
    const takeable = offers.filter(
      (o) => o.status === 'open' && now < o.takeDeadline && o.stake <= MAX_STAKE && o.maker.toLowerCase() !== takerAddr,
    )
    for (const o of takeable) {
      const isOwnBook = o.maker.toLowerCase() === makerAddr
      if (isOwnBook && (!selfPlayAllowed() || Math.random() > 0.5)) continue // let the book linger
      const balance = await publicClient.getBalance({ address: taker.account.address })
      if (balance < o.stake + GAS_CUSHION) continue
      const guess = Math.random() < 0.5
      await sendAs(taker.publicClient, taker.wallet, {
        address: FLIPBOOK, abi: flipBookAbi, functionName: 'take', args: [o.offerId, guess], value: o.stake,
      })
      if (isOwnBook) markSelfPlay()
      console.log(`took #${o.offerId} calling ${guess ? 'heads' : 'tails'} (${viem.formatEther(o.stake)} vs ${o.maker})`)
      break // one take per tick — pacing
    }

    // post: keep the book stocked up to MAX_OPEN standing offers
    const myOpen = offers.filter((o) => o.status === 'open' && o.maker.toLowerCase() === makerAddr && now < o.takeDeadline)
    if (myOpen.length < MAX_OPEN && selfPlayAllowed()) {
      const predicted = (await publicClient.readContract({
        address: FLIPBOOK, abi: flipBookAbi, functionName: 'nextOfferId',
      })) as bigint
      const plan = planFor(predicted)
      const stake = STAKES[Number(predicted % BigInt(STAKES.length))]!
      const bond = stake / 5n
      const balance = await publicClient.getBalance({ address: maker.account.address })
      if (balance < stake + bond + GAS_CUSHION) return
      await sendAs(maker.publicClient, maker.wallet, {
        address: FLIPBOOK,
        abi: flipBookAbi,
        functionName: 'post',
        args: [commitFor(maker.account.address, plan.choice, plan.salt), bond, now + TAKE_DEADLINE_S, REVEAL_WINDOW_S],
        value: stake + bond,
      })
      markSelfPlay()
      console.log(`posted offer #${predicted} (${viem.formatEther(stake)} + ${viem.formatEther(bond)} bond${plan.forfeit ? ', destined to forfeit' : ''})`)
    }
  }

  if (env.ONCE === 'true') {
    await tick()
    return
  }
  for (;;) {
    await tick().catch((e) => console.error(`tick failed: ${(e as Error).message?.split('\n').slice(0, 3).join(' ¦ ')}`))
    const jitter = 0.5 + Math.random()
    await new Promise((resolve) => setTimeout(resolve, Math.round(INTERVAL_MS * jitter)))
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
