import { useCallback, useEffect, useRef, useState } from 'react'
import * as viem from 'viem'
import { coinFlipAbi, raffleAbi } from '@gibs/games-core'
import { deriveCoinFlipLobby, type CoinFlipLobby } from '../model/coinflip-lobby'
import { deriveRaffleRounds, type RaffleRoundView } from '../model/raffle-rounds'
import { publicClientFor } from '../wallet'
import type { GameDeployment } from '../config'

const POLL_MS = 4_000

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

/** Every event carries its provenance: the block it landed in and the tx that caused it. */
const eventArgs = async <T,>(
  client: ReturnType<typeof publicClientFor>,
  address: viem.Hex,
  abi: viem.Abi,
  eventName: string,
  fromBlock: bigint,
): Promise<T[]> => {
  const logs = await client.getContractEvents({ address, abi, eventName, fromBlock, strict: true })
  return logs.map(
    (log) => ({ ...(log.args as object), blockNumber: log.blockNumber, transactionHash: log.transactionHash }) as T,
  )
}

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
      const [blockNumber, entered, cancelled, paired, heated, settled, opened, committed, ticketCancelled, armed, drawn, revealed, finalised, noContest, ticketRefunded] =
        await Promise.all([
          client.getBlockNumber(),
          eventArgs<never>(client, deployment.coinFlip, coinFlipAbi, 'Entered', from),
          eventArgs<never>(client, deployment.coinFlip, coinFlipAbi, 'Cancelled', from),
          eventArgs<never>(client, deployment.coinFlip, coinFlipAbi, 'Paired', from),
          eventArgs<never>(client, deployment.coinFlip, coinFlipAbi, 'Heated', from),
          eventArgs<never>(client, deployment.coinFlip, coinFlipAbi, 'Settled', from),
          eventArgs<never>(client, deployment.raffle, raffleAbi, 'RoundOpened', from),
          eventArgs<never>(client, deployment.raffle, raffleAbi, 'Committed', from),
          eventArgs<never>(client, deployment.raffle, raffleAbi, 'TicketCancelled', from),
          eventArgs<never>(client, deployment.raffle, raffleAbi, 'Armed', from),
          eventArgs<never>(client, deployment.raffle, raffleAbi, 'Drawn', from),
          eventArgs<never>(client, deployment.raffle, raffleAbi, 'Revealed', from),
          eventArgs<never>(client, deployment.raffle, raffleAbi, 'Finalised', from),
          eventArgs<never>(client, deployment.raffle, raffleAbi, 'NoContest', from),
          eventArgs<never>(client, deployment.raffle, raffleAbi, 'TicketRefunded', from),
        ])
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
