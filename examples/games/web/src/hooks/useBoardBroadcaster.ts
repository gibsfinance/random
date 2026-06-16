import { useCallback, useEffect, useRef } from 'react'

/** A lifecycle notice a player's table posts to the shared lobby (mirrors the bots' shape). */
export type LobbyNotice = { kind: 'open' | 'summary'; game: string; tableId?: string; [k: string]: unknown }

/**
 * Returns a `broadcast(notice)` that posts a lobby notice to MsgBoard from the BROWSER — with the
 * proof-of-work grind running in a Web Worker, never on the UI thread (that would freeze the tab for
 * the ~30s+ grind). Drop-if-busy: one grind at a time, notices arriving mid-grind are dropped (the
 * board is a live signal, not a log). No key ever crosses into the worker — these notices are
 * unsigned, and `useSession`/`useWarSession` do all signing on the main thread.
 *
 * No-op when the deployment has no `boardRpc`. Reading the feed (`useBoardFeed`) needs no worker.
 */
export const useBoardBroadcaster = (boardRpc: string | undefined, chainId: number): ((n: LobbyNotice) => void) => {
  const workerRef = useRef<Worker | null>(null)
  const busy = useRef(false)
  const seq = useRef(0)

  useEffect(() => {
    if (!boardRpc) return
    const worker = new Worker(new URL('../workers/powWorker.ts', import.meta.url), { type: 'module' })
    const free = () => {
      busy.current = false
    }
    worker.onmessage = free
    worker.onerror = free
    workerRef.current = worker
    return () => {
      worker.terminate()
      workerRef.current = null
      busy.current = false
    }
  }, [boardRpc])

  return useCallback(
    (notice: LobbyNotice) => {
      const worker = workerRef.current
      if (!worker || !boardRpc || busy.current) return // drop-if-busy — PoW is slow
      busy.current = true
      worker.postMessage({
        id: ++seq.current,
        rpcUrl: boardRpc,
        category: `games.msgboard.xyz:lobby:${chainId}`,
        notice: { v: 1, at: Date.now(), ...notice },
      })
    },
    [boardRpc, chainId],
  )
}
