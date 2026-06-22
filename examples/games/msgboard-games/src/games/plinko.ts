import { encodeAbiParameters, type Hex } from 'viem'
import { EDGE_BPS, HUNDREDTHS, type Game, type RoundOutcome } from '../game'

export type PlinkoRisk = 'low' | 'medium' | 'high'

export interface PlinkoParams {
  /** number of peg rows; the ball makes `rows` binary deflections and lands in a bucket [0, rows]. */
  rows: number
  /** risk profile selecting the multiplier table. */
  risk: PlinkoRisk
}

export const DEFAULT_ROWS = 16
const MIN_ROWS = 1
const MAX_ROWS = 16 // we only ship reference tables up to 16 rows

/**
 * PLACEHOLDER PAYTABLES — VALUES ARE NOT FINAL.
 *
 * These are the "fair" (pre-edge) bucket multipliers in HUNDREDTHS (100 == 1.00x), one symmetric
 * table per risk level, length rows+1. They are plausible/standard Plinko-shaped tables but the
 * exact morbius/stake reference numbers (from IMG_2259.MP4) are NOT yet available. Replace the
 * `rows === 16` rows below (and add other row counts as needed) with the reference values.
 *
 * The ENGINE (deflection -> bucket -> table lookup -> edge -> payout) is final and correct; only
 * these literal numbers are tuning placeholders.
 */
const FAIR_TABLES_X100: Record<PlinkoRisk, Record<number, readonly bigint[]>> = {
  low: {
    16: [1600n, 900n, 200n, 140n, 110n, 100n, 50n, 50n, 30n, 50n, 50n, 100n, 110n, 140n, 200n, 900n, 1600n],
  },
  medium: {
    16: [11000n, 4100n, 1000n, 500n, 300n, 150n, 100n, 50n, 30n, 50n, 100n, 150n, 300n, 500n, 1000n, 4100n, 11000n],
  },
  high: {
    16: [100000n, 13000n, 2600n, 900n, 400n, 200n, 20n, 20n, 20n, 20n, 20n, 200n, 400n, 900n, 2600n, 13000n, 100000n],
  },
}

/** the fair (pre-edge) bucket table for a (risk, rows) pair, or throw if unsupported. */
export function plinkoFairTableX100(risk: PlinkoRisk, rows: number): readonly bigint[] {
  const byRows = FAIR_TABLES_X100[risk]
  const table = byRows?.[rows]
  if (!table) throw new Error(`plinko: no paytable for risk=${risk} rows=${rows}`)
  if (table.length !== rows + 1) throw new Error(`plinko: paytable length ${table.length} != rows+1 (${rows + 1})`)
  return table
}

/** apply the house edge to a fair multiplier (hundredths in, hundredths out): floor(fair*(1-edge)). */
export function plinkoEdgedX100(fairX100: bigint): bigint {
  return (fairX100 * (10_000n - EDGE_BPS)) / 10_000n
}

/**
 * land the ball: consume one bit of `raw` per row as a right-deflection (1) vs left (0); the bucket
 * index is the count of right-deflections, in [0, rows].
 */
export function plinkoBucket(raw: bigint, rows: number): number {
  let bucket = 0
  for (let i = 0; i < rows; i++) {
    if ((raw >> BigInt(i)) & 1n) bucket++
  }
  return bucket
}

/** the fair multiplier (hundredths) at a bucket; throws if the bucket is out of [0, rows]. */
function fairAt(table: readonly bigint[], bucket: number): bigint {
  const fair = table[bucket]
  if (fair === undefined) throw new Error(`plinko: bucket ${bucket} out of range`)
  return fair
}

/** the edged multiplier (hundredths) for a settled bucket. */
export function plinkoMultiplierX100(risk: PlinkoRisk, rows: number, bucket: number): bigint {
  return plinkoEdgedX100(fairAt(plinkoFairTableX100(risk, rows), bucket))
}

export const plinko: Game<PlinkoParams> = {
  gameId: 3,
  maxMultiplierX100(params): bigint {
    // The bucket is random over [0, rows]; the house must cover the highest-paying bucket.
    const table = plinkoFairTableX100(params.risk, params.rows) // validates risk + rows
    let maxFair = 0n
    for (const fair of table) if (fair > maxFair) maxFair = fair
    return plinkoEdgedX100(maxFair)
  },
  settleRound(stake, params, raw): RoundOutcome {
    if (params.rows < MIN_ROWS || params.rows > MAX_ROWS) throw new Error('plinko: rows out of range')
    const table = plinkoFairTableX100(params.risk, params.rows) // validates risk+rows+length
    const bucket = plinkoBucket(raw, params.rows)
    const multiplierX100 = plinkoEdgedX100(fairAt(table, bucket))
    // payout = stake * mult; player delta = payout - stake. win = mult >= 1.00x (player not down).
    const playerDelta = (stake * multiplierX100) / HUNDREDTHS - stake
    const win = multiplierX100 >= HUNDREDTHS
    return { win, playerDelta, multiplierX100 }
  },
  encodeRound(stake, params, raw): Hex {
    return encodeAbiParameters(
      [{ type: 'uint8' }, { type: 'uint256' }, { type: 'uint16' }, { type: 'string' }, { type: 'uint256' }] as const,
      [this.gameId, stake, params.rows, params.risk, raw],
    ) as Hex
  },
}
