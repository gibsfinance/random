import { parentPort } from 'node:worker_threads'
import { createBoardClient, type BoardClient } from '@gibs/msgboard-games'

/**
 * Node worker_threads grinder. Keeps MsgBoard proof-of-work OFF the bot's main event loop, so the
 * game loops never starve the grind (and vice versa — on the main thread the two contend and a post
 * that should take ~30s stretched to 100s+).
 *
 * KEY BOUNDARY: this worker receives only ENCODED bytes — `{ category, data }` (the already-built
 * notice) plus the board RPC URL. It never receives a private key. Signing stays on the main thread;
 * this worker only PoW-wraps the bytes and submits them.
 */
if (!parentPort) throw new Error('pow-worker must be spawned as a worker_threads worker')

const clients = new Map<string, BoardClient>()
const clientFor = (rpcUrl: string): BoardClient => {
  let c = clients.get(rpcUrl)
  if (!c) {
    c = createBoardClient(rpcUrl)
    clients.set(rpcUrl, c)
  }
  return c
}

type Job = { id: number; category: `0x${string}`; data: `0x${string}`; rpcUrl: string }

parentPort.on('message', async (job: Job) => {
  try {
    const hash = await clientFor(job.rpcUrl).addMessage({ category: job.category, data: job.data })
    parentPort!.postMessage({ id: job.id, hash })
  } catch (e) {
    parentPort!.postMessage({ id: job.id, error: e instanceof Error ? e.message : String(e) })
  }
})
