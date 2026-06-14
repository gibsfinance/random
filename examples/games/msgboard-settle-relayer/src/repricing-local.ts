// TODO(plan3): delete once @msgboard/relayer republishes (> 0.0.31) with repricingAction + createPendingTxTracker.
//
// The published @msgboard/relayer ^0.0.31 already exports Relayer / RelayerAction /
// RelayerContext / RelayerMode / RelayerNode (the worker imports those from the package),
// but the generic repricing/nonce-window primitive — added to the engine in this same plan
// (packages/relayer/src/{stores/pending-tx,actions/repricing}.ts, plan 3 tasks 2-3) — is not
// in the published 0.0.31 yet. This file is a byte-for-byte mirror of that engine primitive so
// the worker builds + tests green now. When the engine republishes, delete this file and switch
// the imports in settleAction.ts / worker.ts back to `@msgboard/relayer`.
import type { RelayerAction, RelayerContext } from '@msgboard/relayer'

/** Fee fields for an EIP-1559 settle tx, in wei. */
export type TxFees = {
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

/** What we retain about one in-flight tx, keyed by its nonce. */
export type PendingTx = {
  nonce: number
  hash: string
  fees: TxFees
  submittedAt: number
}

export type PendingTxTrackerOptions = {
  /** Max number of nonces in flight at once (the pipeline depth). */
  windowSize: number
  /** First nonce this worker owns (from `getTransactionCount(account, 'pending')`). */
  baseNonce: number
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number
  /** RBF bump numerator/denominator. Defaults to 1125/1000 (+12.5%, above geth's 10% floor). */
  bumpNum?: bigint
  bumpDen?: bigint
}

/**
 * Tracks settle txs by nonce so multiple settlements pipeline (a bounded window)
 * and stuck ones can be replaced-by-fee. Knows nothing about games or settlement —
 * a generic engine primitive (the relayer spec §13 deferred item). Process-local.
 */
export type PendingTxTracker = {
  /** Reserve the next nonce, or undefined if the window is full. */
  claim(): number | undefined
  /** Record the tx hash + fees we submitted for a claimed nonce. */
  recordSubmission(nonce: number, tx: { hash: string } & TxFees): void
  /** True if the tx for `nonce` was submitted longer than `staleMs` ago and is still pending. */
  isStale(nonce: number, staleMs: number): boolean
  /** Compute strictly-higher fees for a replace-by-fee resubmission of `nonce`. */
  bumpFees(nonce: number): TxFees
  /** Mark a nonce's tx mined; frees the slot and advances the window. */
  markMined(nonce: number): void
  /** Current pending entries, for observability. */
  pending(): readonly PendingTx[]
}

const ceilMul = (v: bigint, num: bigint, den: bigint): bigint => (v * num + den - 1n) / den

export const createPendingTxTracker = (opts: PendingTxTrackerOptions): PendingTxTracker => {
  const now = opts.now ?? (() => Date.now())
  const bumpNum = opts.bumpNum ?? 1125n
  const bumpDen = opts.bumpDen ?? 1000n
  const inFlight = new Map<number, PendingTx | null>() // null = claimed, not yet submitted
  let nextNonce = opts.baseNonce

  const liveCount = (): number => inFlight.size

  return {
    claim: () => {
      if (liveCount() >= opts.windowSize) return undefined
      const nonce = nextNonce
      nextNonce += 1
      inFlight.set(nonce, null)
      return nonce
    },
    recordSubmission: (nonce, tx) => {
      inFlight.set(nonce, {
        nonce,
        hash: tx.hash,
        fees: { maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas },
        submittedAt: now(),
      })
    },
    isStale: (nonce, staleMs) => {
      const e = inFlight.get(nonce)
      if (!e) return false
      return now() - e.submittedAt > staleMs
    },
    bumpFees: (nonce) => {
      const e = inFlight.get(nonce)
      if (!e) throw new Error(`pending-tx: no submission recorded for nonce ${nonce}`)
      return {
        maxFeePerGas: ceilMul(e.fees.maxFeePerGas, bumpNum, bumpDen),
        maxPriorityFeePerGas: ceilMul(e.fees.maxPriorityFeePerGas, bumpNum, bumpDen),
      }
    },
    markMined: (nonce) => {
      inFlight.delete(nonce)
    },
    pending: () => [...inFlight.values()].filter((e): e is PendingTx => e !== null),
  }
}

/** What the caller's submit fn is handed: the nonce + fees to use, the item, and the runtime ctx. */
export type SubmitRequest<T> = {
  item: T
  nonce: number
  fees: TxFees
  context: RelayerContext
  /** True when this is a replace-by-fee resubmission of an already-pending nonce. */
  replacement: boolean
}

export type RepricingActionOptions<T> = {
  /** Tracks in-flight txs by nonce (window + RBF state). */
  tracker: PendingTxTracker
  /** Pure description for observe-mode logging. */
  describe: (item: T, context: RelayerContext) => string
  /** Build + send ONE tx at the given nonce/fees. Returns the tx hash. */
  submit: (req: SubmitRequest<T>) => Promise<{ hash: string }>
  /** Initial EIP-1559 fees for a fresh settlement (e.g. read from the chain). */
  initialFees: (item: T, context: RelayerContext) => Promise<TxFees>
  /** A pending tx older than this is replaced-by-fee. */
  staleMs: number
  /** Stable per-item key so a re-tick of the same settlement reuses its nonce. Defaults to JSON. */
  itemKey?: (item: T) => string
  /** Injectable clock (tests). */
  now?: () => number
}

/**
 * Wraps a single-tx submit fn with a nonce window (pipeline multiple settlements)
 * and replace-by-fee (bump a stuck tx). Generic — the relayer spec §13 deferred
 * "nonce-window / repricing Action wrapper". Knows nothing about games.
 *
 * Safety: `describe` is pure (observe mode never submits). A submitted nonce is
 * remembered; a re-tick of the same item before it mines RBFs the SAME nonce
 * (never a second tx, never a forged state — it only re-sends the same calldata
 * at a higher fee). When the window is full a new item is a no-op this tick.
 */
export const repricingAction = <T>(options: RepricingActionOptions<T>): RelayerAction<T> => {
  const key = options.itemKey ?? ((item: T) => JSON.stringify(item))
  // item-key -> the nonce we assigned it, so a re-tick reuses it for RBF
  const nonceOf = new Map<string, number>()

  return {
    describe: (item, context) => options.describe(item, context),
    execute: async (item, context) => {
      const k = key(item)
      const existing = nonceOf.get(k)

      // Already in flight: replace-by-fee iff stale, else leave it.
      if (existing !== undefined) {
        if (!options.tracker.isStale(existing, options.staleMs)) {
          return { ok: true, ref: `nonce:${existing}`, meta: { skipped: 'still-pending' } }
        }
        const fees = options.tracker.bumpFees(existing)
        const { hash } = await options.submit({ item, nonce: existing, fees, context, replacement: true })
        options.tracker.recordSubmission(existing, { hash, ...fees })
        return { ok: true, ref: hash, meta: { replacement: true, nonce: existing } }
      }

      // New settlement: claim a nonce from the window.
      const nonce = options.tracker.claim()
      if (nonce === undefined) {
        return { ok: false, meta: { deferred: 'nonce-window-full' } }
      }
      const fees = await options.initialFees(item, context)
      const { hash } = await options.submit({ item, nonce, fees, context, replacement: false })
      nonceOf.set(k, nonce)
      options.tracker.recordSubmission(nonce, { hash, ...fees })
      return { ok: true, ref: hash, meta: { nonce } }
    },
  }
}
