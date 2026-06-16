/// <reference lib="webworker" />
import { createBoardClient, MsgBoardTransport } from '@gibs/msgboard-games'

/**
 * MsgBoard proof-of-work grinder — runs in a Web Worker, NEVER on the UI thread (doPoW is a multi-
 * second busy-grind that would freeze the tab; see the guard in @gibs/msgboard-games board.ts, which
 * also throws if this is ever reached on the main thread). A worker has no `document`, so the guard
 * passes here.
 *
 * KEY BOUNDARY: this worker receives only a category NAME, a plain (unsigned) lifecycle NOTICE, and
 * the board RPC. It never receives a private key — these notices aren't signed, and all session
 * signing stays on the main thread. The worker just encodes → PoW-wraps → submits.
 */
type Job = { id: number; rpcUrl: string; category: string; notice: unknown }

self.onmessage = async (e: MessageEvent<Job>) => {
  const { id, rpcUrl, category, notice } = e.data
  try {
    const transport = new MsgBoardTransport(createBoardClient(rpcUrl), { category })
    await transport.send(notice) // encode + doPoW + submit, all off the UI thread
    ;(self as unknown as Worker).postMessage({ id, ok: true })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
