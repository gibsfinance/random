import { describe, it, expect } from 'vitest'
import * as viem from 'viem'
import { deriveCoinFlipLobby, type CoinFlipEvents } from '../src/model/coinflip-lobby'

const A = '0xAAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa' as viem.Hex
const B = '0xBbbBBbbbBbbBbbbBbBBBBBBBBbbbBbBbBbbBbbBb' as viem.Hex
const C = '0xCccCCcccCccCcccCcCCCCCCCCcccCcCcCccCccCc' as viem.Hex
const SUBSET_HASH = viem.keccak256(viem.toHex('subset'))
const stake = viem.parseEther('1')

const base: CoinFlipEvents = { entered: [], cancelled: [], paired: [], heated: [], settled: [] }

describe('deriveCoinFlipLobby', () => {
  it('shows an uncancelled, unpaired entry as open, with the side decoded and mine flagged case-insensitively', () => {
    const lobby = deriveCoinFlipLobby(
      { ...base, entered: [{ id: 1n, player: A, side: 0, stake, subsetHash: SUBSET_HASH }] },
      A.toLowerCase() as viem.Hex,
    )
    expect(lobby.openEntries).to.have.length(1)
    expect(lobby.openEntries[0]).to.deep.include({ id: 1n, side: 'heads', mine: true })
    expect(lobby.flips).to.have.length(0)
  })

  it('drops cancelled entries from the lobby', () => {
    const lobby = deriveCoinFlipLobby(
      {
        ...base,
        entered: [
          { id: 1n, player: A, side: 0, stake, subsetHash: SUBSET_HASH },
          { id: 2n, player: B, side: 1, stake, subsetHash: SUBSET_HASH },
        ],
        cancelled: [{ id: 1n }],
      },
      C,
    )
    expect(lobby.openEntries.map((e) => e.id)).to.deep.equal([2n])
  })

  it('consumes the earliest matching entries when a pairing lands, and shows a pending flip', () => {
    const flipId = viem.keccak256(viem.toHex('flip-1'))
    const lobby = deriveCoinFlipLobby(
      {
        ...base,
        entered: [
          { id: 1n, player: A, side: 0, stake, subsetHash: SUBSET_HASH }, // heads, consumed
          { id: 2n, player: A, side: 0, stake, subsetHash: SUBSET_HASH }, // heads, still open (FIFO)
          { id: 3n, player: B, side: 1, stake, subsetHash: SUBSET_HASH }, // tails, consumed
        ],
        paired: [{ flipId, heads: A, tails: B, stake }],
        heated: [{ flipId, key: viem.keccak256(viem.toHex('key')) }],
      },
      B,
    )
    expect(lobby.openEntries.map((e) => e.id)).to.deep.equal([2n])
    expect(lobby.flips).to.have.length(1)
    expect(lobby.flips[0]).to.deep.include({ flipId, status: 'pending', mine: true })
  })

  it('upgrades a flip to settled with the winner, side, and seed', () => {
    const flipId = viem.keccak256(viem.toHex('flip-2'))
    const seed = viem.padHex('0x02', { size: 32 })
    const lobby = deriveCoinFlipLobby(
      {
        ...base,
        entered: [
          { id: 1n, player: A, side: 0, stake, subsetHash: SUBSET_HASH },
          { id: 2n, player: B, side: 1, stake, subsetHash: SUBSET_HASH },
        ],
        paired: [{ flipId, heads: A, tails: B, stake }],
        settled: [{ flipId, winner: A, winningSide: 0, payout: stake * 2n, seed }],
      },
      C,
    )
    expect(lobby.flips[0]).to.deep.include({ status: 'settled', winner: A, winningSide: 'heads', seed })
    expect(lobby.flips[0]!.mine).to.equal(false)
  })

  it('does not cross-consume entries at a different stake', () => {
    const flipId = viem.keccak256(viem.toHex('flip-3'))
    const otherStake = viem.parseEther('0.1')
    const lobby = deriveCoinFlipLobby(
      {
        ...base,
        entered: [
          { id: 1n, player: A, side: 0, stake: otherStake, subsetHash: SUBSET_HASH }, // different stake — stays
          { id: 2n, player: A, side: 0, stake, subsetHash: SUBSET_HASH },
          { id: 3n, player: B, side: 1, stake, subsetHash: SUBSET_HASH },
        ],
        paired: [{ flipId, heads: A, tails: B, stake }],
      },
      A,
    )
    expect(lobby.openEntries.map((e) => e.id)).to.deep.equal([1n])
  })
})
