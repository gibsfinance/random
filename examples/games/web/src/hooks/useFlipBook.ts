import { useCallback, useEffect, useRef, useState } from 'react'
import * as viem from 'viem'
import { publicClientFor } from '../wallet'
import type { GameDeployment } from '../config'
import { flipBookAbi } from '../lib/flipBookContract'

const POLL_MS = 10_000
// Chunk getLogs so a full-history range never exceeds the RPC's per-request limit (same guard as
// useChainData/useSudoku — valve returns "Request exceeds defined limit" on very wide ranges).
const MAX_RANGE = 10_000n

/** One offer's full lifecycle, folded from the five FlipBook events. */
export type OfferView = {
  offerId: bigint
  maker: viem.Hex
  commit: viem.Hex
  stake: bigint
  bond: bigint
  /** Unix seconds — takeable until this moment (inclusive). */
  takeDeadline: number
  /** Seconds the maker has to reveal after a take. */
  revealWindow: number
  status: 'open' | 'taken' | 'revealed' | 'forfeited' | 'cancelled'
  taker?: viem.Hex
  guess?: boolean
  /** Unix seconds — the maker must reveal by this moment (inclusive) or forfeit. */
  revealBy?: number
  /** Terminal facts (Revealed / Forfeited). */
  choice?: boolean
  winner?: viem.Hex
  pot?: bigint
  postTx: viem.Hex
  takeTx?: viem.Hex
  settleTx?: viem.Hex
}

export type FlipBookData = {
  offers: OfferView[]
  /** My pull-fallback balance (push payment reverted) — zero for normal wallets. */
  owed: bigint
  /** The head block's timestamp — the countdown reference (client clocks drift). */
  chainNow: number
  blockNumber: bigint
  loading: boolean
  error?: string
  refresh: () => void
}

type RawEvent = { eventName: string; args: Record<string, unknown>; transactionHash: viem.Hex }

const foldOffers = (events: RawEvent[]): OfferView[] => {
  const byId = new Map<string, OfferView>()
  for (const e of events) {
    const id = e.args.offerId as bigint | undefined
    if (id === undefined) continue
    const key = id.toString()
    if (e.eventName === 'OfferPosted') {
      byId.set(key, {
        offerId: id,
        maker: e.args.maker as viem.Hex,
        commit: e.args.commit as viem.Hex,
        stake: e.args.stake as bigint,
        bond: e.args.bond as bigint,
        takeDeadline: Number(e.args.takeDeadline as bigint),
        revealWindow: Number(e.args.revealWindow as number | bigint),
        status: 'open',
        postTx: e.transactionHash,
      })
      continue
    }
    const offer = byId.get(key)
    if (!offer) continue // event range starts at the deploy block, so this shouldn't happen
    if (e.eventName === 'OfferCancelled') {
      offer.status = 'cancelled'
      offer.settleTx = e.transactionHash
    } else if (e.eventName === 'OfferTaken') {
      offer.status = 'taken'
      offer.taker = e.args.taker as viem.Hex
      offer.guess = e.args.guess as boolean
      offer.revealBy = Number(e.args.revealBy as bigint)
      offer.takeTx = e.transactionHash
    } else if (e.eventName === 'Revealed') {
      offer.status = 'revealed'
      offer.choice = e.args.choice as boolean
      offer.winner = e.args.winner as viem.Hex
      offer.pot = e.args.pot as bigint
      offer.settleTx = e.transactionHash
    } else if (e.eventName === 'Forfeited') {
      offer.status = 'forfeited'
      offer.winner = e.args.taker as viem.Hex
      offer.pot = e.args.amount as bigint
      offer.settleTx = e.transactionHash
    }
  }
  return [...byId.values()].sort((a, b) => (a.offerId < b.offerId ? 1 : -1))
}

/**
 * Reads the whole FlipBook offer book for the active chain by folding its event log (offers are
 * fully on-chain — escrowed at post — so the chain IS the order book; no indexer needed yet).
 * Chunked scan from flipBookDeployBlock, re-run on a poll; also reads my `owed` pull-balance and
 * the head timestamp so reveal/take countdowns tick against chain time, not the local clock.
 */
export const useFlipBook = (deployment: GameDeployment | null, myAddress?: viem.Hex): FlipBookData => {
  const [data, setData] = useState<Omit<FlipBookData, 'refresh'>>({
    offers: [],
    owed: 0n,
    chainNow: Math.floor(Date.now() / 1000),
    blockNumber: 0n,
    loading: false,
  })
  const busy = useRef(false)

  const load = useCallback(async () => {
    if (!deployment?.flipBook || busy.current) return
    const flipBook = deployment.flipBook
    busy.current = true
    setData((d) => ({ ...d, loading: true }))
    try {
      const client = publicClientFor(deployment.chainId, deployment.rpc)
      const headBlock = await client.getBlock({ blockTag: 'latest' })
      const head = headBlock.number
      const fromBlock = BigInt(deployment.flipBookDeployBlock ?? deployment.deployBlock)

      const events: RawEvent[] = []
      for (let lo = fromBlock; lo <= head; lo += MAX_RANGE) {
        const hi = lo + MAX_RANGE - 1n < head ? lo + MAX_RANGE - 1n : head
        const logs = await client.getContractEvents({
          address: flipBook,
          abi: flipBookAbi,
          fromBlock: lo,
          toBlock: hi,
          strict: true,
        })
        for (const l of logs) {
          events.push({
            eventName: l.eventName,
            args: l.args as Record<string, unknown>,
            transactionHash: l.transactionHash,
          })
        }
      }

      const owed = myAddress
        ? ((await client.readContract({
            address: flipBook,
            abi: flipBookAbi,
            functionName: 'owed',
            args: [myAddress],
          })) as bigint)
        : 0n

      setData({
        offers: foldOffers(events),
        owed,
        chainNow: Number(headBlock.timestamp),
        blockNumber: head,
        loading: false,
        error: undefined,
      })
    } catch (error) {
      setData((d) => ({ ...d, loading: false, error: error instanceof Error ? error.message : String(error) }))
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
