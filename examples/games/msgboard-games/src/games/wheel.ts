import { encodeAbiParameters, type Hex } from 'viem'
import { EDGE_BPS, HUNDREDTHS, type Game, type RoundOutcome } from '../game'

export type WheelRisk = 'low' | 'medium' | 'high'

export interface WheelParams {
  /** number of equal segments on the wheel; the pointer lands on `raw % segments`. */
  segments: number
  /** risk profile selecting the multiplier table. */
  risk: WheelRisk
}

const BPS = 10_000n
export const SUPPORTED_SEGMENTS = [10, 20, 30, 40, 50] as const

/** expand run-length pairs [mult, count] into a flat segment table; the counts must sum to `segments`. */
function runs(segments: number, pairs: readonly (readonly [bigint, number])[]): readonly bigint[] {
  const out: bigint[] = []
  for (const [mult, count] of pairs) for (let i = 0; i < count; i++) out.push(mult)
  if (out.length !== segments) throw new Error(`wheel: table length ${out.length} != segments ${segments}`)
  return out
}

/**
 * PLACEHOLDER PAYTABLES — VALUES ARE NOT FINAL (⚠ pending IMG_2259.MP4 / live morbius reference).
 *
 * Fair (pre-edge) segment multipliers in HUNDREDTHS (100 == 1.00x), one table per (risk, segments).
 * Expressed as run-length pairs for readability; the engine flattens them. The shapes are standard
 * wheel profiles (low = many small wins, high = mostly 0x with rare large spikes); the exact reference
 * numbers must replace these. The ENGINE (pointer = raw % segments -> table -> edge -> payout) is final.
 */
const FAIR_TABLES_X100: Record<WheelRisk, Record<number, readonly bigint[]>> = {
  low: {
    10: runs(10, [[0n, 2], [120n, 4], [150n, 3], [200n, 1]]),
    20: runs(20, [[0n, 4], [120n, 9], [150n, 5], [200n, 2]]),
    30: runs(30, [[0n, 6], [120n, 14], [150n, 7], [200n, 3]]),
    40: runs(40, [[0n, 8], [120n, 19], [150n, 9], [200n, 4]]),
    50: runs(50, [[0n, 10], [120n, 24], [150n, 11], [200n, 5]]),
  },
  medium: {
    10: runs(10, [[0n, 4], [150n, 3], [200n, 2], [500n, 1]]),
    20: runs(20, [[0n, 9], [150n, 6], [200n, 3], [300n, 1], [900n, 1]]),
    30: runs(30, [[0n, 14], [150n, 9], [200n, 4], [300n, 2], [900n, 1]]),
    40: runs(40, [[0n, 19], [150n, 12], [200n, 5], [300n, 3], [1500n, 1]]),
    50: runs(50, [[0n, 24], [150n, 15], [200n, 6], [300n, 4], [1500n, 1]]),
  },
  high: {
    10: runs(10, [[0n, 9], [990n, 1]]),
    20: runs(20, [[0n, 19], [1980n, 1]]),
    30: runs(30, [[0n, 29], [3000n, 1]]),
    40: runs(40, [[0n, 39], [4000n, 1]]),
    50: runs(50, [[0n, 49], [5000n, 1]]),
  },
}

/** the fair (pre-edge) segment table for a (risk, segments) pair, or throw if unsupported. */
export function wheelFairTableX100(risk: WheelRisk, segments: number): readonly bigint[] {
  const table = FAIR_TABLES_X100[risk]?.[segments]
  if (!table) throw new Error(`wheel: no paytable for risk=${risk} segments=${segments}`)
  return table
}

/** apply the house edge to a fair multiplier (hundredths in, hundredths out): floor(fair*(1-edge)). */
export function wheelEdgedX100(fairX100: bigint): bigint {
  return (fairX100 * (BPS - EDGE_BPS)) / BPS
}

/** the segment the pointer lands on, in [0, segments-1]. */
export function wheelSegment(raw: bigint, segments: number): number {
  return Number(raw % BigInt(segments))
}

/** the edged multiplier (hundredths) for a settled segment. */
export function wheelMultiplierX100(risk: WheelRisk, segments: number, segment: number): bigint {
  const fair = wheelFairTableX100(risk, segments)[segment]
  if (fair === undefined) throw new Error(`wheel: segment ${segment} out of range`)
  return wheelEdgedX100(fair)
}

export const wheel: Game<WheelParams> = {
  gameId: 8,
  maxMultiplierX100(params): bigint {
    // The segment is random over [0, segments-1]; the house must cover the highest-paying segment.
    const table = wheelFairTableX100(params.risk, params.segments) // validates risk + segments
    let maxFair = 0n
    for (const fair of table) if (fair > maxFair) maxFair = fair
    return wheelEdgedX100(maxFair)
  },
  settleRound(stake, params, raw): RoundOutcome {
    const table = wheelFairTableX100(params.risk, params.segments) // validates risk + segments
    const segment = wheelSegment(raw, params.segments)
    const fair = table[segment]
    if (fair === undefined) throw new Error(`wheel: segment ${segment} out of range`)
    const multiplierX100 = wheelEdgedX100(fair)
    const playerDelta = (stake * multiplierX100) / HUNDREDTHS - stake
    const win = multiplierX100 >= HUNDREDTHS
    return { win, playerDelta, multiplierX100 }
  },
  encodeRound(stake, params, raw): Hex {
    return encodeAbiParameters(
      [{ type: 'uint8' }, { type: 'uint256' }, { type: 'uint16' }, { type: 'string' }, { type: 'uint256' }] as const,
      [this.gameId, stake, params.segments, params.risk, raw],
    ) as Hex
  },
}
