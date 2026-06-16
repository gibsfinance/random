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
export function msgBoardClientAdapter(board: MsgBoardClient): BoardClient {
  return {
    async addMessage(seed: { category: Hex; data: Hex }) {
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
