import * as viem from 'viem'
import { type Game, coinFlipOutcome } from '@gibs/games-core'

export type CoinFlipParams = { stake: bigint; validatorSubset: viem.Hex[] }
export type CoinFlipEntry = { player: viem.Hex; side: 'heads' | 'tails' }
export type CoinFlipOutcome = { winner: viem.Hex; winningSide: 'heads' | 'tails' }

const MIN_SUBSET = 3

export const coinflip: Game<CoinFlipParams, CoinFlipEntry, CoinFlipOutcome> = {
  parseParams: (raw) => {
    const p = raw as Partial<CoinFlipParams>
    if (typeof p.stake !== 'bigint' || p.stake <= 0n) throw new Error('stake must be a positive bigint')
    if (!Array.isArray(p.validatorSubset) || p.validatorSubset.length < MIN_SUBSET) {
      throw new Error(`validatorSubset must have at least ${MIN_SUBSET} members`)
    }
    const distinct = new Set(p.validatorSubset.map((a) => a.toLowerCase()))
    if (distinct.size !== p.validatorSubset.length) throw new Error('validatorSubset must be distinct')
    return { stake: p.stake, validatorSubset: p.validatorSubset }
  },

  decodeEntry: (raw) => {
    const e = raw as { player: viem.Hex; side: number | 'heads' | 'tails' }
    const side = e.side === 0 || e.side === 'heads' ? 'heads' : 'tails'
    return { player: e.player, side }
  },

  canArm: (_params, entries) => {
    const heads = entries.filter((e) => e.side === 'heads').length
    const tails = entries.filter((e) => e.side === 'tails').length
    return heads === 1 && tails === 1
  },

  settle: (_params, entries, seed) => {
    const winningSide = coinFlipOutcome(seed)
    const winner = entries.find((e) => e.side === winningSide)
    if (!winner) throw new Error('no entry on the winning side')
    return { winner: winner.player, winningSide }
  },

  presets: [],
}
