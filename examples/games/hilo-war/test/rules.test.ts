import { describe, it, expect } from 'vitest'
import {
  initialFlipState, applyMove, hashGameState, hashBetCommit, Phase,
  type HiLoState, type Move,
} from '../src/rules'

const ANTE = 5n
function freshState(): HiLoState {
  return initialFlipState({ ante: ANTE, deckIndex: 0, warPot: 0n })
}
function run(s: HiLoState, moves: Move[]): HiLoState {
  return moves.reduce((acc, m) => {
    const r = applyMove(acc, m, ANTE)
    if ('error' in r) throw new Error(r.error)
    return r.state
  }, s)
}
const commitA: Move = { kind: 'BET_COMMIT', by: 'A', commitment: ('0x' + 'a1'.repeat(32)) as `0x${string}` }
const commitB: Move = { kind: 'BET_COMMIT', by: 'B', commitment: ('0x' + 'b1'.repeat(32)) as `0x${string}` }
// commit/open pairs that actually match
const saltA = '0x01' as `0x${string}`, saltB = '0x02' as `0x${string}`
const holdA: Move = { kind: 'BET_COMMIT', by: 'A', commitment: hashBetCommit('HOLD', saltA) }
const holdB: Move = { kind: 'BET_COMMIT', by: 'B', commitment: hashBetCommit('HOLD', saltB) }
const raiseA: Move = { kind: 'BET_COMMIT', by: 'A', commitment: hashBetCommit('RAISE', saltA) }
const raiseB: Move = { kind: 'BET_COMMIT', by: 'B', commitment: hashBetCommit('RAISE', saltB) }

describe('hilo-war rules', () => {
  it('full showdown path: deal → commits → opens(hold,hold) → showdown', () => {
    let s = freshState()
    expect(s.phase).toBe(Phase.DEAL)
    s = run(s, [
      { kind: 'DEAL_DONE' },
      holdA, holdB,
      { kind: 'BET_OPEN', by: 'A', bet: 'HOLD', salt: saltA },
      { kind: 'BET_OPEN', by: 'B', bet: 'HOLD', salt: saltB },
    ])
    expect(s.phase).toBe(Phase.SHOWDOWN)
    s = run(s, [{ kind: 'SHOWDOWN', cardA: 51, cardB: 0 }]) // A♠ vs 2♣
    expect(s.phase).toBe(Phase.FLIP_DONE)
    expect(s.result).toEqual({ winner: 'A', amount: 2n * ANTE })
    expect(s.warPot).toBe(0n)
  })
  it('raise/call doubles the pot; raise/fold pays raiser without showdown', () => {
    const s = run(freshState(), [
      { kind: 'DEAL_DONE' }, raiseA, holdB,
      { kind: 'BET_OPEN', by: 'A', bet: 'RAISE', salt: saltA },
      { kind: 'BET_OPEN', by: 'B', bet: 'HOLD', salt: saltB },
    ])
    expect(s.phase).toBe(Phase.CALL_OR_FOLD)
    const folded = run(s, [{ kind: 'FOLD', by: 'B' }])
    expect(folded.phase).toBe(Phase.FLIP_DONE)
    expect(folded.result).toEqual({ winner: 'A', amount: 3n * ANTE }) // 2 antes + A's raise
    expect(folded.foldedCardHidden).toBe(true)

    const called = run(s, [{ kind: 'CALL', by: 'B' }])
    expect(called.phase).toBe(Phase.SHOWDOWN)
    expect(called.pot).toBe(4n * ANTE) // 2 antes + raise + call
  })
  it('tie carries the war pot into the next flip', () => {
    const s = run(freshState(), [
      { kind: 'DEAL_DONE' }, holdA, holdB,
      { kind: 'BET_OPEN', by: 'A', bet: 'HOLD', salt: saltA },
      { kind: 'BET_OPEN', by: 'B', bet: 'HOLD', salt: saltB },
      { kind: 'SHOWDOWN', cardA: 0, cardB: 1 },            // 2♣ vs 2♦ — tie
    ])
    expect(s.result).toBeNull()
    expect(s.warPot).toBe(2n * ANTE)
    expect(s.pot).toBe(0n)
    const next = initialFlipState({ ante: ANTE, deckIndex: s.deckIndex + 2, warPot: s.warPot })
    expect(next.pot).toBe(0n)
    expect(next.warPot).toBe(2n * ANTE)
  })
  it('winner takes pot PLUS carried war pot at showdown', () => {
    let s = initialFlipState({ ante: ANTE, deckIndex: 2, warPot: 10n })
    s = run(s, [
      { kind: 'DEAL_DONE' }, holdA, holdB,
      { kind: 'BET_OPEN', by: 'A', bet: 'HOLD', salt: saltA },
      { kind: 'BET_OPEN', by: 'B', bet: 'HOLD', salt: saltB },
      { kind: 'SHOWDOWN', cardA: 4, cardB: 51 },           // 3♣ vs A♠
    ])
    expect(s.result).toEqual({ winner: 'B', amount: 2n * ANTE + 10n })
    expect(s.warPot).toBe(0n)
  })
  it('both raise → showdown with both raises in the pot, no call phase', () => {
    const s = run(freshState(), [
      { kind: 'DEAL_DONE' }, raiseA, raiseB,
      { kind: 'BET_OPEN', by: 'A', bet: 'RAISE', salt: saltA },
      { kind: 'BET_OPEN', by: 'B', bet: 'RAISE', salt: saltB },
    ])
    expect(s.phase).toBe(Phase.SHOWDOWN)
    expect(s.pot).toBe(4n * ANTE)
  })
  it('rejects out-of-phase and duplicate moves', () => {
    let s = freshState()
    expect(applyMove(s, commitA, ANTE)).toHaveProperty('error')      // commit before deal done
    s = run(s, [{ kind: 'DEAL_DONE' }, commitA])
    expect(applyMove(s, commitA, ANTE)).toHaveProperty('error')      // duplicate commit
    expect(applyMove(s, { kind: 'SHOWDOWN', cardA: 0, cardB: 1 }, ANTE)).toHaveProperty('error')
  })
  it('bet open must match its commitment', () => {
    const s = run(freshState(), [
      { kind: 'DEAL_DONE' },
      { kind: 'BET_COMMIT', by: 'A', commitment: hashBetCommit('RAISE', '0xfeed' as `0x${string}`) }, commitB,
    ])
    expect(applyMove(s, { kind: 'BET_OPEN', by: 'A', bet: 'HOLD', salt: '0xfeed' as `0x${string}` }, ANTE)).toHaveProperty('error')
    const ok = applyMove(s, { kind: 'BET_OPEN', by: 'A', bet: 'RAISE', salt: '0xfeed' as `0x${string}` }, ANTE)
    expect(ok).not.toHaveProperty('error')
  })
  it('raiser cannot call or fold own raise', () => {
    const s = run(freshState(), [
      { kind: 'DEAL_DONE' }, raiseA, holdB,
      { kind: 'BET_OPEN', by: 'A', bet: 'RAISE', salt: saltA },
      { kind: 'BET_OPEN', by: 'B', bet: 'HOLD', salt: saltB },
    ])
    expect(applyMove(s, { kind: 'CALL', by: 'A' }, ANTE)).toHaveProperty('error')
    expect(applyMove(s, { kind: 'FOLD', by: 'A' }, ANTE)).toHaveProperty('error')
  })
  it('pot accounting conserves: antes+raises in == result out (+war carry)', () => {
    const s = run(freshState(), [
      { kind: 'DEAL_DONE' }, raiseA, holdB,
      { kind: 'BET_OPEN', by: 'A', bet: 'RAISE', salt: saltA },
      { kind: 'BET_OPEN', by: 'B', bet: 'HOLD', salt: saltB },
      { kind: 'CALL', by: 'B' },
      { kind: 'SHOWDOWN', cardA: 4, cardB: 51 },
    ])
    expect(s.result!.amount).toBe(s.contributed.A + s.contributed.B)
  })
  it('hashGameState is stable & sensitive', () => {
    const s = freshState()
    expect(hashGameState(s)).toBe(hashGameState({ ...s }))
    expect(hashGameState(s)).not.toBe(hashGameState({ ...s, deckIndex: 2 }))
  })
})
