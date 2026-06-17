import { useCallback, useMemo, useRef, useState } from 'react'
import * as viem from 'viem'
import { useBoardBroadcaster } from './useBoardBroadcaster'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  HouseSession,
  MsgBoardTransport,
  makeDomain,
  decisionMs,
  networkMs,
  totalMs,
  type BoardClient,
  type Game,
  type Signer,
} from '@gibs/msgboard-games'

/**
 * Drives a `@gibs/msgboard-games` HouseSession for one off-chain session game in the browser.
 *
 * Game-agnostic on purpose: the only game-specific bit is the `Game<TParams>` module passed in,
 * and the `TParams` a screen supplies to `play`. Dice/Limbo/Plinko/Keno all plug in by passing
 * their `Game` module + a params UI — the hook never names a game.
 *
 * Wiring (see ASSUMPTIONS in the screen / task report):
 *  - The PLAYER signer is the injected wallet, adapted to the session `Signer` shape.
 *  - The HOUSE signer is a fresh in-browser ephemeral key. The session class is documented as an
 *    in-process player↔house driver ("both signers local"); a real deployment splits the house onto
 *    its own machine behind the same Transport, and only this one line changes.
 *  - The TRANSPORT is `MsgBoardTransport` over a pluggable `BoardClient`. A real `MsgBoardClient`
 *    from `@msgboard/sdk` drops in unchanged; absent a live board we default to an in-memory client
 *    so the pattern compiles and plays headlessly.
 *  - The RNG seed tip is generated client-side per session; its `commit` is published in the OPEN
 *    envelope and every round's server seed is revealed + chain-verified by the session itself.
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
   * In this in-process driver the four marks fire ~µs apart, so deltas are often 0 (real delays
   * come from the bot fleet / a real transport). Any sub-span may be undefined.
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
  /** EIP-712 verifyingContract for the session domain. Defaults to a placeholder (no on-chain settle yet). */
  verifyingContract?: viem.Hex
  /** how many rounds the committed seed chain affords. */
  chainLength?: number
  /** opening chip balances co-signed into the first state. */
  openBalances?: { player: bigint; house: bigint }
  /** transport client; defaults to an in-memory board so play works headlessly. */
  boardClient?: BoardClient
  /** MsgBoard RPC for the live lobby feed — when set, opening a table posts an `open` notice (PoW in
   *  a Web Worker, never the UI thread). Absent → no broadcast. */
  boardRpc?: string
  /** short game name used in the lobby notice (e.g. 'dice'). Defaults to `game-<gameId>`. */
  gameLabel?: string
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

/** A minimal in-memory `BoardClient` — same surface a real `MsgBoardClient` exposes to the transport. */
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
 * The reference session hook. Adding a new session-game screen is then ~mechanical:
 *   const session = useSession({ game: limbo, walletClient, chainId })
 *   // render params UI, call session.play(stake, { targetX100 }) on the action.
 */
export const useSession = <TParams>(config: UseSessionConfig<TParams>): SessionApi<TParams> => {
  const {
    game,
    walletClient,
    chainId,
    verifyingContract = PLACEHOLDER_VERIFIER,
    chainLength = 64,
    openBalances = { player: 10n ** 18n, house: 10n ** 21n },
    boardClient,
    boardRpc,
    gameLabel,
  } = config
  const broadcastLobby = useBoardBroadcaster({ boardRpc, chainId })

  const [status, setStatus] = useState<SessionStatus>('idle')
  const [error, setError] = useState<string>()
  const [history, setHistory] = useState<RoundRecord[]>([])
  const [balances, setBalances] = useState<{ player: bigint; house: bigint }>()
  const [commit, setCommit] = useState<viem.Hex>()
  const [roundsLeft, setRoundsLeft] = useState(0)

  // the live session is mutable engine state, not render state — keep it in a ref.
  const sessionRef = useRef<HouseSession<TParams>>()
  const transportRef = useRef<MsgBoardTransport>()
  const busy = useRef(false)

  // the transport board is stable for the hook's lifetime (in-memory fallback unless one is passed).
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
      // ephemeral in-browser house — a real deployment moves this onto the house machine.
      const house = privateKeyToAccount(generatePrivateKey()) as unknown as Signer
      const tableId = viem.keccak256(viem.stringToHex(`mbg:${Date.now()}:${player.address}`))
      const seedTip = viem.bytesToHex(crypto.getRandomValues(new Uint8Array(32)))

      const session = new HouseSession<TParams>({
        domain: makeDomain(chainId, verifyingContract),
        tableId,
        game,
        player,
        house,
        seedTip,
        chainLength,
        openBalances,
        settlementMode: 0,
      })
      // wire the MsgBoard transport for this table (broadcast-only; we retain our own transcript).
      transportRef.current = new MsgBoardTransport(board, tableId)

      await session.open()
      sessionRef.current = session
      setCommit(session.chain.commit)
      setBalances({ player: session.state.balancePlayer, house: session.state.balanceHouse })
      setHistory([])
      setRoundsLeft(chainLength)
      setStatus('open')
      // announce the table on the shared live feed (PoW grinds in a Web Worker — never the UI thread).
      broadcastLobby({ kind: 'open', game: gameLabel ?? `game-${game.gameId}`, tableId, commit: session.chain.commit })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    } finally {
      busy.current = false
    }
  }, [walletClient, chainId, verifyingContract, game, chainLength, openBalances, board])

  const play = useCallback(
    async (stake: bigint, params: TParams): Promise<RoundRecord | undefined> => {
      const session = sessionRef.current
      if (!session) {
        setError('open a table first')
        return undefined
      }
      if (busy.current) return undefined
      busy.current = true
      setStatus('playing')
      setError(undefined)
      try {
        const clientSeed = viem.bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
        await session.playRound({ stake, params, clientSeed })

        // recompute the round's randomness + outcome to surface a receipt (engine state is co-signed).
        const last = session.transcript.entries.at(-1)
        const body = last?.body as
          | { round?: number; outcome?: { win: boolean; playerDelta: string; multiplierX100: string } }
          | undefined
        // also broadcast the freshly-appended envelope over the transport (best-effort).
        if (transportRef.current && last) await transportRef.current.send(last)

        // map the round envelope's non-signed timing marks through the helpers (any may be undefined).
        const t = last?.timing
        const timing = t
          ? { decisionMs: decisionMs(t), networkMs: networkMs(t), totalMs: totalMs(t) }
          : undefined

        const record: RoundRecord = {
          round: body?.round ?? Number(session.state.nonce),
          stake,
          raw: 0n, // raw is internal to the round; left 0 here — verify panel can recompute from transcript.
          win: body?.outcome?.win ?? false,
          playerDelta: body?.outcome ? BigInt(body.outcome.playerDelta) : 0n,
          multiplierX100: body?.outcome ? BigInt(body.outcome.multiplierX100) : 0n,
          balancePlayer: session.state.balancePlayer,
          balanceHouse: session.state.balanceHouse,
          timing,
        }
        setHistory((h) => [...h, record])
        setBalances({ player: session.state.balancePlayer, house: session.state.balanceHouse })
        setRoundsLeft((n) => Math.max(0, n - 1))
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
    [],
  )

  const transcriptJson = useCallback(() => sessionRef.current?.transcript.toJSON(), [])

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

export { ZERO_ADDR }
