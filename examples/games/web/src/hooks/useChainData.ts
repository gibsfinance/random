import { useCallback, useEffect, useRef, useState } from 'react'
import * as viem from 'viem'
import { coinFlipAbi, raffleAbi } from '@gibs/games-core'
import { deriveCoinFlipLobby, type CoinFlipLobby } from '../model/coinflip-lobby'
import { deriveRaffleRounds, type RaffleRoundView } from '../model/raffle-rounds'
import { publicClientFor } from '../wallet'
import type { GameDeployment } from '../config'

const POLL_MS = 12_000

export type ChainData = {
  lobby: CoinFlipLobby
  rounds: RaffleRoundView[]
  blockNumber: bigint
  /** Unix seconds per block number (string key) for every block an event landed in. */
  timestamps: Record<string, number>
  error?: string
  refresh: () => void
}

const emptyLobby: CoinFlipLobby = { openEntries: [], flips: [] }

type RawLog = { eventName?: string; args?: unknown; blockNumber?: bigint | null; transactionHash?: viem.Hex | null }

/** Partition one contract's logs by event name into the `{ ...args, blockNumber, transactionHash }`
 *  shape the models expect. We fetch ALL of a contract's events in a SINGLE getContractEvents call and
 *  split here — one request per contract instead of one per event name (which was flooding the RPC). */
const pick = <T,>(logs: readonly RawLog[], eventName: string): T[] =>
  logs
    .filter((l) => l.eventName === eventName)
    .map((l) => ({ ...(l.args as object), blockNumber: l.blockNumber, transactionHash: l.transactionHash }) as T)

/** Block timestamps never change once mined — cache them across polls, per chain. */
const timestampCache = new Map<string, number>()

const resolveTimestamps = async (
  client: ReturnType<typeof publicClientFor>,
  chainId: number,
  eventLists: { blockNumber?: bigint }[][],
): Promise<Record<string, number>> => {
  const blocks = new Set<string>()
  for (const list of eventLists) {
    for (const e of list) if (e.blockNumber !== undefined) blocks.add(e.blockNumber.toString())
  }
  const missing = [...blocks].filter((b) => !timestampCache.has(`${chainId}:${b}`))
  await Promise.all(
    missing.map(async (b) => {
      const block = await client.getBlock({ blockNumber: BigInt(b) })
      timestampCache.set(`${chainId}:${b}`, Number(block.timestamp))
    }),
  )
  const out: Record<string, number> = {}
  for (const b of blocks) {
    const ts = timestampCache.get(`${chainId}:${b}`)
    if (ts !== undefined) out[b] = ts
  }
  return out
}

/** One polling loop: every 4 s pull both games' events through the core ABIs into the models. */
export const useChainData = (deployment: GameDeployment | null, myAddress?: viem.Hex): ChainData => {
  const [data, setData] = useState<Omit<ChainData, 'refresh'>>({
    lobby: emptyLobby,
    rounds: [],
    blockNumber: 0n,
    timestamps: {},
  })
  const busy = useRef(false)

  const load = useCallback(async () => {
    if (!deployment || busy.current) return
    busy.current = true
    try {
      const client = publicClientFor(deployment.chainId, deployment.rpc)
      const from = BigInt(deployment.deployBlock)
      // 3 requests per poll (head + both contracts' full event sets), not 16.
      const [blockNumber, coinflipLogs, raffleLogs] = await Promise.all([
        client.getBlockNumber(),
        client.getContractEvents({ address: deployment.coinFlip, abi: coinFlipAbi, fromBlock: from, strict: true }),
        client.getContractEvents({ address: deployment.raffle, abi: raffleAbi, fromBlock: from, strict: true }),
      ])
      const entered = pick<never>(coinflipLogs, 'Entered')
      const cancelled = pick<never>(coinflipLogs, 'Cancelled')
      const paired = pick<never>(coinflipLogs, 'Paired')
      const heated = pick<never>(coinflipLogs, 'Heated')
      const settled = pick<never>(coinflipLogs, 'Settled')
      const opened = pick<never>(raffleLogs, 'RoundOpened')
      const committed = pick<never>(raffleLogs, 'Committed')
      const ticketCancelled = pick<never>(raffleLogs, 'TicketCancelled')
      const armed = pick<never>(raffleLogs, 'Armed')
      const drawn = pick<never>(raffleLogs, 'Drawn')
      const revealed = pick<never>(raffleLogs, 'Revealed')
      const finalised = pick<never>(raffleLogs, 'Finalised')
      const noContest = pick<never>(raffleLogs, 'NoContest')
      const ticketRefunded = pick<never>(raffleLogs, 'TicketRefunded')
      const timestamps = await resolveTimestamps(client, deployment.chainId, [
        entered,
        paired,
        settled,
        opened,
        committed,
        armed,
        drawn,
        revealed,
        finalised,
      ])
      setData({
        blockNumber,
        timestamps,
        lobby: deriveCoinFlipLobby({ entered, cancelled, paired, heated, settled }, myAddress),
        rounds: deriveRaffleRounds(
          { opened, committed, ticketCancelled, armed, drawn, revealed, finalised, noContest, ticketRefunded },
          myAddress,
          blockNumber,
        ),
        error: undefined,
      })
    } catch (error) {
      setData((d) => ({ ...d, error: error instanceof Error ? error.message : String(error) }))
    } finally {
      busy.current = false
    }
  }, [deployment, myAddress])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  return { ...data, refresh: () => void load() }
}
