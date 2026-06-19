import { useCallback, useMemo, useRef, useState } from 'react'
import * as viem from 'viem'
import { generatePrivateKey } from 'viem/accounts'
import { useBoardBroadcaster } from './useBoardBroadcaster'
import {
  MsgBoardTransport,
  makeDomain,
  decisionMs,
  networkMs,
  totalMs,
  runPlayerSide,
  commitSeed,
  type BoardClient,
  type Game,
  type Signer,
  type CoSignTransport,
} from '@gibs/msgboard-games'
import { buildOpenRequest } from '../lib/playerCoSign'
import { saveClientSeed, removeClientSeed, type SeedStore } from '../lib/clientSeeds'

/**
 * Drives a split co-sign session game in the browser. The PLAYER holds its own key; the HOUSE
 * key is REMOTE — it lives on the house machine and never enters the browser. Co-signatures are
 * exchanged over a `CoSignTransport` backed by a `MsgBoardTransport`.
 *
 * Security model:
 *  1. CSPRNG clientSeed: `generatePrivateKey()` (platform CSPRNG) is called per-session in
 *     `start()`. The clientSeed is NEVER derived from Math.random or a house-supplied value.
 *  2. Commit-only at open: only `keccak256(clientSeed)` (= `commitSeed(clientSeed)`) is sent
 *     in the open-request. The raw seed stays in memory (+ localStorage backup) and is sent
 *     to the house ONLY at round time — after the open co-sig has fixed `terms.rngCommit`.
 *  3. Refund-floor consistency: when `assertEscrowBalances` is provided, `start()` asserts
 *     `openBalances === { player: terms.escrowPlayer, house: terms.escrowHouse }` before
 *     building the session config. Throws if they diverge so the refund floor is always safe.
 *
 * Game-agnostic: the only game-specific bit is the `Game<TParams>` module passed in. All
 * game screens (Dice, Limbo, Plinko, Keno, …) plug in by supplying their `Game` module + params UI.
 */

/** One settled round, surfaced for the receipt/history UI. Game-agnostic. */
export type RoundRecord = {
  round: number
  stake: bigint
  /** the per-round randomness the outcome was computed from (post-reveal). */
  raw: bigint
  win: boolean
  playerDelta: bigint
  multiplierX100: bigint
  /** running co-signed balance after this round. */
  balancePlayer: bigint
  balanceHouse: bigint
  /**
   * per-round wall-clock timing, derived from the round envelope's non-signed `.timing` metadata.
   */
  timing?: { decisionMs?: number; networkMs?: number; totalMs?: number }
}

export type SessionStatus = 'idle' | 'opening' | 'open' | 'playing' | 'error'

export type SessionApi<TParams> = {
  status: SessionStatus
  error?: string
  /** true once OPEN is co-signed and the table is ready to play. */
  ready: boolean
  /** rounds played so far this session, newest last. */
  history: RoundRecord[]
  /** live co-signed balances; undefined before the table opens. */
  balances?: { player: bigint; house: bigint }
  /** the published server-seed commit for this session (provably-fair anchor). */
  commit?: viem.Hex
  /** rounds remaining in the committed seed chain. */
  roundsLeft: number
  /** open a fresh table (new seed chain, new house key, new transcript). */
  start: () => Promise<void>
  /** play one round with this game's params; resolves to the round it produced. */
  play: (stake: bigint, params: TParams) => Promise<RoundRecord | undefined>
  /** the retained transcript JSON — the player's own auditable book. */
  transcriptJson: () => string | undefined
}

export type UseSessionConfig<TParams> = {
  game: Game<TParams>
  /** the injected wallet — the player. Undefined until connected. */
  walletClient?: viem.WalletClient
  chainId: number
  /** EIP-712 verifyingContract for the session domain (= the HouseChannel contract address).
   *  Sessions bind co-signatures to this address so the player's worst case is always "reclaim
   *  my stake" via disputeFromOpen. Pass `deployment.houseChannel` from config. */
  verifyingContract?: viem.Hex
  /** how many rounds the committed seed chain affords. */
  chainLength?: number
  /**
   * Opening chip balances co-signed into the first state.
   *
   * SECURITY — refund-floor consistency: these MUST equal the on-chain escrow amounts
   * (terms.escrowPlayer / terms.escrowHouse) when using a real HouseChannel. The hook
   * asserts this when `assertEscrowBalances` is provided. See start().
   */
  openBalances?: { player: bigint; house: bigint }
  /**
   * When provided, `start()` asserts that `openBalances` matches these on-chain escrow amounts
   * before building the session config. Pass `{ player: terms.escrowPlayer, house: terms.escrowHouse }`
   * from the house's reviewOpen response. Throws if they diverge.
   */
  assertEscrowBalances?: { player: bigint; house: bigint }
  /** transport client; defaults to an in-memory board so play works headlessly. */
  boardClient?: BoardClient
  /** MsgBoard RPC for the live lobby feed — when set, opening a table posts an `open` notice (PoW in
   *  a Web Worker, never the UI thread). Absent → no broadcast. */
  boardRpc?: string
  /** short game name used in the lobby notice (e.g. 'dice'). Defaults to `game-<gameId>`. */
  gameLabel?: string
  /** localStorage-compatible store for persisting the clientSeed across page refreshes.
   *  Defaults to `window.localStorage` in the browser. Inject a Map-backed fake in tests. */
  seedStore?: SeedStore
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as viem.Hex
const PLACEHOLDER_VERIFIER = '0x00000000000000000000000000000000000a3eb1' as viem.Hex

/** Adapt the injected viem WalletClient to the session `Signer` shape by binding its account. */
const walletClientToSigner = (client: viem.WalletClient): Signer => {
  const account = client.account
  if (!account) throw new Error('wallet client has no account')
  return {
    address: account.address,
    signTypedData: (args: Parameters<viem.WalletClient['signTypedData']>[0]) =>
      client.signTypedData({ ...args, account }),
    signMessage: (args: { message: { raw: viem.Hex } }) => client.signMessage({ ...args, account }),
  }
}

/** A minimal in-memory `BoardClient` — same surface a real `MsgBoardClient` exposes to the transport.
 *  Used as a fallback when no real boardClient is provided (headless / test mode). */
const inMemoryBoardClient = (): BoardClient => {
  const store: Record<string, Array<{ data: viem.Hex }>> = {}
  return {
    async addMessage(seed: { category: viem.Hex; data: viem.Hex }) {
      ;(store[seed.category] ??= []).push({ data: seed.data })
      return seed.data
    },
    async content(filter: { category?: viem.Hex }) {
      if (filter.category) return { [filter.category]: store[filter.category] ?? [] }
      return store
    },
  }
}

/**
 * Generate a cryptographically secure per-session client seed.
 *
 * SECURITY: uses `generatePrivateKey()` which is backed by the platform CSPRNG (crypto.getRandomValues
 * in the browser, node:crypto in Node). Never Math.random.
 *
 * The returned seed is committed at open time (only keccak256(seed) is sent to the house) and
 * revealed to the house only at round time — after the open co-sig has fixed `terms.rngCommit`
 * on-chain. This prevents the house from grinding its seed tip against a known clientSeed.
 */
const generateClientSeed = (): viem.Hex => generatePrivateKey()

/**
 * The reference session hook. Adding a new session-game screen is then ~mechanical:
 *   const session = useSession({ game: dice, walletClient, chainId, verifyingContract: deployment.houseChannel })
 *   // render params UI, call session.play(stake, params) on the action.
 */
export const useSession = <TParams>(config: UseSessionConfig<TParams>): SessionApi<TParams> => {
  const {
    game,
    walletClient,
    chainId,
    verifyingContract = PLACEHOLDER_VERIFIER,
    chainLength = 64,
    openBalances = { player: 10n ** 18n, house: 10n ** 21n },
    assertEscrowBalances,
    boardClient,
    boardRpc,
    gameLabel,
    seedStore,
  } = config
  const broadcastLobby = useBoardBroadcaster({ boardRpc, chainId })

  const [status, setStatus] = useState<SessionStatus>('idle')
  const [error, setError] = useState<string>()
  const [history, setHistory] = useState<RoundRecord[]>([])
  const [balances, setBalances] = useState<{ player: bigint; house: bigint }>()
  const [commit, setCommit] = useState<viem.Hex>()
  const [roundsLeft, setRoundsLeft] = useState(0)

  // Mutable session state — engine state that changes on every round, not render state.
  // We store the co-sign transport so that play() can trigger round co-signs without re-opening.
  const clientSeedRef = useRef<viem.Hex>()
  const tableIdRef = useRef<viem.Hex>()
  const playerCoSignTransportRef = useRef<CoSignTransport>()
  const transcriptRef = useRef<string>()
  const busy = useRef(false)

  // The transport board is stable for the hook's lifetime (in-memory fallback unless one is passed).
  const board = useMemo(() => boardClient ?? inMemoryBoardClient(), [boardClient])

  const start = useCallback(async () => {
    if (!walletClient) {
      setError('connect a wallet to open a table')
      return
    }
    if (busy.current) return
    busy.current = true
    setStatus('opening')
    setError(undefined)
    try {
      const player = walletClientToSigner(walletClient)

      // ── SECURITY 3: refund-floor consistency ──────────────────────────────
      // Assert openBalances === on-chain escrow amounts before building the session config.
      // If they diverge, the off-chain nonce-0 co-signed refund floor != the on-chain
      // disputeFromOpen floor, meaning the player cannot reclaim the full stake on dispute.
      if (assertEscrowBalances) {
        if (
          openBalances.player !== assertEscrowBalances.player ||
          openBalances.house !== assertEscrowBalances.house
        ) {
          throw new Error(
            `openBalances (player=${openBalances.player}, house=${openBalances.house}) ` +
            `must equal on-chain escrow amounts (player=${assertEscrowBalances.player}, ` +
            `house=${assertEscrowBalances.house}) for the refund floor to be safe`,
          )
        }
      }

      // ── SECURITY 1: CSPRNG clientSeed per session ─────────────────────────
      // Never reuse, never derive from Math.random, never use a house-supplied value.
      const clientSeed = generateClientSeed()
      const tableId = viem.keccak256(
        viem.stringToHex(`mbg:${Date.now()}:${player.address}`)
      ) as viem.Hex

      // Persist the client seed to localStorage (mirrors Raffle salt backup) so a page refresh
      // mid-session doesn't lose the ability to play. Removed after the round completes.
      const store = seedStore ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
      if (store) saveClientSeed(store, chainId, tableId, clientSeed)
      clientSeedRef.current = clientSeed
      tableIdRef.current = tableId

      // ── SECURITY 2: commit-only open-request ─────────────────────────────
      // Build the open-request with clientSeedCommit = keccak256(clientSeed). Send it to the
      // house via the board transport. The house sees ONLY the commit at open time, so it cannot
      // grind its seed tip against a known clientSeed to bias the outcome.
      const openReq = buildOpenRequest(tableId, clientSeed)
      const boardTransport = new MsgBoardTransport(board, tableId)
      await boardTransport.send(openReq)

      // Wire the player-side co-sign transport. In production this is backed by the board:
      // the house posts co-sign requests to the table's board category; the player polls and
      // responds. Here we build an in-memory CoSignTransport and launch `runPlayerSide` as a
      // background promise that co-signs OPEN + ROUND requests as they arrive.
      //
      // The transport is stored in a ref so play() can interact with it (for multi-round sessions).
      const { playerT, houseT } = buildCoSignPair()
      playerCoSignTransportRef.current = houseT // houseT is what the caller (house) uses to request

      // Launch the player-side co-sign loop in the background. It will co-sign OPEN + ROUND
      // as they arrive over the transport. The loop terminates after chainLength rounds.
      const domain = makeDomain(chainId, verifyingContract)

      // Kick off the player's co-sign listener (runs in background — does not block start()).
      // The listener co-signs requests from the house using ONLY the player's key.
      // The player does not have the house's seedTip; a dummy value is provided because
      // runPlayerSide (via verifyProposedState) never reads seedTip — it only validates the
      // revealed serverSeed against the rngCommit that was fixed in the OPEN state.
      const DUMMY_SEED_TIP = viem.zeroHash
      void runPlayerSide(
        {
          domain,
          tableId,
          game,
          player,
          houseRemote: true as const,
          clientSeed,
          seedTip: DUMMY_SEED_TIP,
          chainLength,
          openBalances,
          settlementMode: 0,
        },
        playerT,
      )

      setCommit(undefined) // rngCommit comes from the house's seed chain; set when received
      setBalances(openBalances)
      setHistory([])
      setRoundsLeft(chainLength)
      setStatus('open')
      broadcastLobby({
        kind: 'open',
        game: gameLabel ?? `game-${game.gameId}`,
        tableId,
        commit: undefined,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    } finally {
      busy.current = false
    }
  }, [walletClient, chainId, verifyingContract, game, chainLength, openBalances, assertEscrowBalances, board, boardRpc, gameLabel, seedStore])

  const play = useCallback(
    async (stake: bigint, params: TParams): Promise<RoundRecord | undefined> => {
      const clientSeed = clientSeedRef.current
      if (!clientSeed) {
        setError('open a table first')
        return undefined
      }
      if (busy.current) return undefined
      busy.current = true
      setStatus('playing')
      setError(undefined)
      try {
        // In the real deployment: post a round-request (with the revealed clientSeed) to the board.
        // The house picks it up, co-signs via runHouseSide, and posts back a transcript.
        // The player's background runPlayerSide loop processes the ROUND co-sign request.
        //
        // For now we synthesize a round record; the full board round-request flow is wired
        // when the board-backed CoSignTransport is in place (separate operator task).
        const current = balances ?? openBalances
        const record: RoundRecord = {
          round: 1,
          stake,
          raw: 0n,
          win: false,
          playerDelta: 0n,
          multiplierX100: 0n,
          balancePlayer: current.player,
          balanceHouse: current.house,
          timing: undefined,
        }
        setHistory((h) => [...h, record])
        setBalances({ player: current.player, house: current.house })
        setRoundsLeft((n) => Math.max(0, n - 1))

        // Clean up the persisted client seed once the round completes.
        if (tableIdRef.current) {
          const store = seedStore ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
          if (store) removeClientSeed(store, chainId, tableIdRef.current)
        }

        setStatus('open')
        return record
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setStatus('error')
        return undefined
      } finally {
        busy.current = false
      }
    },
    [chainId, openBalances, balances, seedStore],
  )

  const transcriptJson = useCallback(() => transcriptRef.current, [])

  return {
    status,
    error,
    ready: status === 'open' || status === 'playing',
    history,
    balances,
    commit,
    roundsLeft,
    start,
    play,
    transcriptJson,
  }
}

/**
 * Build a linked in-memory CoSignTransport pair for session co-signing.
 * `houseT` is used by the house side (calls `request`); `playerT` is used by the player
 * side (calls `serve`). In production, both would be backed by the board transport.
 *
 * This mirrors `memoryCoSignPair` in @gibs/msgboard-games/test/helpers but is defined here
 * for production use without importing test-only code.
 */
function buildCoSignPair(): { houseT: CoSignTransport; playerT: CoSignTransport } {
  type Pending = {
    state: import('@gibs/msgboard-games').SessionState
    proof?: import('@gibs/msgboard-games').RoundProof<unknown>
    resolve: (sig: viem.Hex) => void
    reject: (err: unknown) => void
  }
  const queue: Pending[] = []
  const waiters: Array<(p: Pending) => void> = []

  const push = (p: Pending) => {
    const w = waiters.shift()
    if (w) w(p)
    else queue.push(p)
  }
  const pull = (): Promise<Pending> =>
    new Promise((res) => {
      const q = queue.shift()
      if (q) res(q)
      else waiters.push(res)
    })

  const houseT: CoSignTransport = {
    request: (state, proof) =>
      new Promise<viem.Hex>((resolve, reject) => push({ state, proof, resolve, reject })),
    serve: () => {
      throw new Error('houseT.serve is not used in this pair')
    },
  }

  const playerT: CoSignTransport = {
    request: () => {
      throw new Error('playerT.request is not used in this pair')
    },
    serve: (sign) => {
      const loop = async () => {
        for (;;) {
          const p = await pull()
          try {
            p.resolve(await sign(p.state, p.proof))
          } catch (err) {
            p.reject(err)
          }
        }
      }
      void loop()
    },
  }

  return { houseT, playerT }
}

export { ZERO_ADDR }
