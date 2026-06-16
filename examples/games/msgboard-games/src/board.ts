import { createPublicClient, http, type Hex } from 'viem'
import { MsgBoardClient } from '@msgboard/sdk'
import type { BoardClient } from './msgboardTransport'

/**
 * Bridges a real `@msgboard/sdk` MsgBoardClient to the `BoardClient` surface `MsgBoardTransport`
 * needs. The only gap is proof-of-work: the transport hands us `{ category, data }`, and the board
 * requires a PoW-stamped message — so `addMessage` grinds the work (against the board's live
 * difficulty, read by `doPoW`) and submits, while `content` passes straight through (the SDK's
 * `RPCMessage` already exposes `data`, which is the hex the transport reads back).
 *
 * On a testnet board (943, default difficulty factors) a small message grinds in well under a
 * second, so this is usable for both the headless bots and best-effort browser broadcast. On a
 * production-difficulty board, run `doPoW` off the UI thread (a Web Worker) — see the SDK README.
 */
/**
 * GUARD: proof-of-work (`doPoW`) is a multi-second busy-grind. Running it on a browser's MAIN thread
 * freezes the tab (it's the thread that renders the UI) for the whole grind — never do this. We detect
 * the UI main thread by the presence of `document` (a Web Worker has no `document`; Node has none
 * either), and throw LOUDLY rather than silently hang the page. To post from a browser, grind inside a
 * Web Worker (`new Worker(...)`) and call this there. This is enforced here, at the single PoW
 * chokepoint, so no caller — or future agent — can reintroduce the freeze by accident.
 */
function assertOffMainThread(): void {
  if (typeof document !== 'undefined') {
    throw new Error(
      'MsgBoard proof-of-work (doPoW) must not run on the browser main thread — it freezes the UI for ' +
        'the whole grind. Run the board client inside a Web Worker instead. (msgboard-games/board.ts guard)',
    )
  }
}

export function msgBoardClientAdapter(board: MsgBoardClient): BoardClient {
  return {
    async addMessage(seed: { category: Hex; data: Hex }) {
      assertOffMainThread()
      const work = await board.doPoW(seed.category, seed.data)
      return board.addMessage(work.message)
    },
    async content(filter: { category?: Hex }) {
      const out = await board.content(filter.category ? { category: filter.category } : {})
      // SDK Content is Record<categoryHash, RPCMessage[]>; RPCMessage has `data: Hex` → structurally
      // the Record<string, {data: Hex}[]> the transport expects.
      return out as unknown as Record<string, Array<{ data: Hex }>>
    },
  }
}

/** Build a live `BoardClient` from an RPC URL whose node runs the `msgboard_` module (e.g. a
 *  valve.city endpoint: https://one.valve.city/rpc/<key>/evm/<chainId>). The returned client posts
 *  real PoW-stamped notices and reads the live board. */
export function createBoardClient(rpcUrl: string): BoardClient {
  const viemClient = createPublicClient({ transport: http(rpcUrl) })
  // viem's `request` is typed to a fixed RPC schema; the board needs the SDK's looser
  // `{ method: string; params }` Provider. Forward through a thin wrapper (the msgboard_* methods
  // aren't in viem's schema anyway — the transport just relays them).
  const provider = {
    request: <T, U extends unknown[]>(arg: { method: string; params: U }): Promise<T> =>
      viemClient.request(arg as never) as Promise<T>,
  }
  return msgBoardClientAdapter(new MsgBoardClient(provider))
}
