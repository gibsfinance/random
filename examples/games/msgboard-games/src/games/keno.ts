import { encodeAbiParameters, type Hex } from 'viem'
import { EDGE_BPS, HUNDREDTHS, type Game, type RoundOutcome } from '../game'

export interface KenoParams {
  /** the player's chosen numbers: distinct integers in [1, 40], typically 1..10 picks. */
  picks: number[]
  /** how many numbers the round draws of 40, without replacement. Standard keno draws 10. */
  drawn?: number
}

export const POOL = 40 // numbers are 1..40
export const MAX_PICKS = 10
export const DEFAULT_DRAWN = 10 // standard keno draws 10 of 40

// (1 - edge) expressed in hundredths: (10000 - 100)/100 == 99  (i.e. 0.99x == 99).
const ONE_MINUS_EDGE_X100 = (10_000n - EDGE_BPS) / HUNDREDTHS // 99n

/**
 * PLACEHOLDER PAYTABLE. Keyed by [number of picks][number of hits] -> "fair" multiplier in
 * hundredths BEFORE the house edge is applied. These are a standard/plausible keno table and are
 * NOT the reference morbius/stake (IMG_2259.MP4) values — they must be replaced with the real
 * tuned table once supplied. The engine (deterministic draw-without-replacement, hit counting,
 * table lookup, edge application, payout) is correct independent of these numbers.
 *
 * Index convention: BASE_PAYTABLE_X100[picks][hits], picks in [1,10], hits in [0,picks].
 * A value of 0n means "no payout" for that (picks, hits) cell.
 */
export const BASE_PAYTABLE_X100: readonly (readonly bigint[])[] = [
  /* picks 0 (unused) */ [0n],
  /* picks 1 */ [0n, 360n],
  /* picks 2 */ [0n, 0n, 900n],
  /* picks 3 */ [0n, 0n, 270n, 4500n],
  /* picks 4 */ [0n, 0n, 180n, 750n, 9000n],
  /* picks 5 */ [0n, 0n, 150n, 420n, 1300n, 30000n],
  /* picks 6 */ [0n, 0n, 110n, 200n, 660n, 6000n, 70000n],
  /* picks 7 */ [0n, 0n, 0n, 200n, 700n, 3000n, 18000n, 70000n],
  /* picks 8 */ [0n, 0n, 0n, 200n, 400n, 1100n, 6700n, 40000n, 90000n],
  /* picks 9 */ [0n, 0n, 0n, 200n, 350n, 600n, 3300n, 8000n, 50000n, 100000n],
  /* picks 10 */ [0n, 0n, 0n, 150n, 250n, 450n, 1600n, 7000n, 40000n, 80000n, 100000n],
]

/** Apply the 1% house edge to a "fair" multiplier in hundredths. */
export function applyEdgeX100(fairX100: bigint): bigint {
  return (fairX100 * ONE_MINUS_EDGE_X100) / HUNDREDTHS
}

/**
 * Deterministically draw `drawn` distinct numbers of POOL (1..40) WITHOUT replacement, derived
 * from `raw` via a Fisher-Yates partial shuffle. Reproducible / parity-testable: the same `raw`
 * always yields the same set. The pool is consumed back-to-front (positions n-1, n-2, ...), and
 * at each step the swap index is drawn from the remaining [0, i] window using successive base-i
 * digits of `raw`. Returns the drawn values as a set of numbers in [1, 40].
 */
export function kenoDraw(raw: bigint, drawn: number = DEFAULT_DRAWN): Set<number> {
  if (drawn < 0 || drawn > POOL) throw new Error('keno: drawn out of range')
  const pool: number[] = new Array(POOL)
  for (let k = 0; k < POOL; k++) pool[k] = k + 1 // 1..40
  let r = raw
  const result = new Set<number>()
  for (let i = POOL - 1; i >= POOL - drawn; i--) {
    const window = BigInt(i + 1) // pick j in [0, i]
    const j = Number(r % window)
    r = r / window
    // swap pool[i] and pool[j], take pool[i] as a drawn number
    const tmp = pool[i]!
    pool[i] = pool[j]!
    pool[j] = tmp
    result.add(pool[i]!)
  }
  return result
}

/** Count hits: |picks ∩ drawn|. */
export function kenoHits(picks: number[], drawn: Set<number>): number {
  let hits = 0
  for (const p of picks) if (drawn.has(p)) hits++
  return hits
}

function validatePicks(picks: number[]): void {
  if (picks.length < 1 || picks.length > MAX_PICKS) throw new Error('keno: picks count out of range [1,10]')
  const seen = new Set<number>()
  for (const p of picks) {
    if (!Number.isInteger(p) || p < 1 || p > POOL) throw new Error('keno: pick out of range [1,40]')
    if (seen.has(p)) throw new Error('keno: duplicate pick')
    seen.add(p)
  }
}

export const keno: Game<KenoParams> = {
  // NOTE: gameId 4 chosen to avoid colliding with Plinko, which is expected to take 3
  // (dice=1, limbo=2). Reconcile with the Plinko module's id before release.
  gameId: 4,
  settleRound(stake, params, raw): RoundOutcome {
    validatePicks(params.picks)
    const drawn = params.drawn ?? DEFAULT_DRAWN
    if (drawn < 1 || drawn > POOL) throw new Error('keno: drawn out of range [1,40]')
    const draw = kenoDraw(raw, drawn)
    const hits = kenoHits(params.picks, draw)
    const fairX100 = BASE_PAYTABLE_X100[params.picks.length]?.[hits] ?? 0n
    const multiplierX100 = applyEdgeX100(fairX100)
    // win if the payout exceeds the stake (multiplier > 1.00x == 100).
    const win = multiplierX100 > HUNDREDTHS
    if (!win) return { win: false, playerDelta: -stake, multiplierX100: multiplierX100 > 0n ? multiplierX100 : 0n }
    const playerDelta = (stake * multiplierX100) / HUNDREDTHS - stake
    return { win: true, playerDelta, multiplierX100 }
  },
  encodeRound(stake, params, raw): Hex {
    const picks = params.picks.map((p) => BigInt(p))
    return encodeAbiParameters(
      [{ type: 'uint8' }, { type: 'uint256' }, { type: 'uint256[]' }, { type: 'uint256' }] as const,
      [this.gameId, stake, picks, raw],
    ) as Hex
  },
}
