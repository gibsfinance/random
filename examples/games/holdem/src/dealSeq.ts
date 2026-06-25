import { keccak256, concatHex, type Hex } from 'viem'
import {
  makeEnvelope,
  type Envelope,
  type EnvelopeSigner,
  type Transcript,
  type MaskedDeckProvider,
  type WireMasked,
  type WireShuffle,
} from '@gibs/zk-cards-core'
import { collectShares, revealCommunity, revealHole, verifyAllShares, ctxFor, type RevealShare } from './revealN'

/**
 * Board-coordinated deal sequence — Track 3 Task 3.
 *
 * Orchestrates the full Hold'em deal over the MsgBoard transport, where EACH shuffle
 * round and EACH card reveal is exactly ONE board post appended to the hash-chained
 * transcript, in canonical order — and (on the live board) each post is gated by the
 * ~1-2s WASM proof-of-work. This module is the SEQUENCER; it does NOT re-implement
 * crypto — it drives Task-1 (`runShuffleChain`) and Task-2 (`collectShares`,
 * `verifyAllShares`, `revealCommunity`, `revealHole`) primitives in the right order.
 *
 * Deal order (standard one-card-at-a-time Texas Hold'em):
 *   1. shuffle chain         — seat i shuffles seat i-1's deck (Task 1), N posts
 *   2. hole cards            — 2 per seat from the top of the post-shuffle deck.
 *                              Round 1 deals seat s slot `s`; round 2 deals seat s slot
 *                              `N+s`. So seat s's hole slots are `[s, N+s]`.
 *   3. flop                  — next 3 community slots `[2N, 2N+1, 2N+2]`, revealed to all
 *   4. turn                  — next community slot `2N+3`
 *   5. river                 — next community slot `2N+4`
 * Total dealt slots = `2N + 5`; the remaining `52 - (2N+5)` slots are NEVER revealed.
 *
 * SAFETY CONTRACT (carried forward from the Task-2 review): "verify shares FIRST (for
 * seat attribution), THEN combine." The sequencer ALWAYS calls `verifyAllShares` before
 * `revealCommunity`/`revealHole`. On a failed verify it surfaces WHICH SEAT's share
 * failed via `ShareAttributionFault` (the seat's deck pub + the slot) — not just a
 * slot-level fault. Every share is bound to `ctxFor(tableId, slot)`.
 */

/** A single deal step that maps to exactly ONE board post (one transcript envelope). */
export type DealStep =
  | { kind: 'SHUFFLE'; seat: number; round: WireShuffle }
  /** owner-targeted hole share posted by ONE peer seat for ONE hole slot */
  | { kind: 'HOLE_SHARE'; target: number; slot: number; share: RevealShare }
  /** community share for one slot posted by ONE seat */
  | { kind: 'COMMUNITY_SHARE'; group: 'FLOP' | 'TURN' | 'RIVER'; slot: number; share: RevealShare }

/** The slot layout for an N-seat deal. */
export interface DealPlan {
  /** holeSlots[s] = the two slots dealt to seat s, in deal order: [s, N+s] */
  holeSlots: number[][]
  flop: number[]
  turn: number
  river: number
}

/**
 * Standard one-card-at-a-time deal: round 1 gives seat s slot `s`, round 2 gives seat s
 * slot `N+s`. Community cards follow contiguously: flop `[2N..2N+2]`, turn `2N+3`,
 * river `2N+4`. No slot is used twice; total = `2N+5`.
 */
export function dealPlan(nSeats: number): DealPlan {
  const holeSlots = Array.from({ length: nSeats }, (_, s) => [s, nSeats + s])
  const base = 2 * nSeats
  return {
    holeSlots,
    flop: [base, base + 1, base + 2],
    turn: base + 3,
    river: base + 4,
  }
}

/** keccak over the flattened masked-deck ciphertext — mirrors the session deck commitment. */
export function deckCommitment(deck: WireMasked[]): Hex {
  return keccak256(concatHex(deck.flatMap((m) => [m.c1, m.c2])))
}

/**
 * The minimal in-memory board surface the sequencer posts to. The live board grinds a
 * ~1-2s PoW per post (`stamp()`); the fake test board just records that a stamp was
 * minted so tests can assert "one PoW per post" without a live RPC.
 */
export interface DealBoard {
  transcript: Transcript
  /** invoked once per post — the PoW-stamp seam (live: grind; test: count). */
  stamp(): void
}

/**
 * Post one deal step as one envelope: mint the PoW stamp, sign + append to the
 * hash-chained transcript. Returns the envelope. The transcript enforces seq + prev
 * chaining; a wrong signer is caught downstream by `verifyEnvelope` (which recovers the
 * signer and checks it equals `from`).
 */
export async function postStep(
  transcript: Transcript,
  signer: EnvelopeSigner,
  step: DealStep,
  board: Pick<DealBoard, 'stamp'>,
): Promise<Envelope> {
  board.stamp()
  const env = await makeEnvelope(signer, transcript.tableId, transcript.entries.length, transcript.head, step.kind, step)
  transcript.append(env)
  return env
}

/**
 * Thrown when a contributed share fails Chaum-Pedersen verification during the deal.
 * Carries BOTH the offending `slot` AND the offending `seat` (its deck pubkey) so the
 * fault is attributable to a specific seat — honoring the Task-2 verify-then-combine
 * contract (attribution, not just a slot-level fault).
 */
export class ShareAttributionFault extends Error {
  readonly slot: number
  readonly seat: Hex
  constructor(slot: number, seat: Hex) {
    super(`deal: slot ${slot} share from seat ${seat} failed verification (forged/stale/replayed)`)
    this.name = 'ShareAttributionFault'
    this.slot = slot
    this.seat = seat
  }
}

interface SeatRef {
  secret: Hex
  pub: Hex
  addr: Hex
  signer: EnvelopeSigner
}

export interface RunDealArgs {
  provider: MaskedDeckProvider
  seats: SeatRef[]
  agg: Hex
  tableId: Hex
  /** the POST-shuffle final deck (output of runShuffleChain) */
  deck: WireMasked[]
  plan: DealPlan
  board: DealBoard
  /** must be true: verify shares before combining (the safety contract) */
  verifyAllShares: boolean
  /**
   * test seam: optionally substitute a forged share for a given (slot, fromPub).
   * Returns a replacement RevealShare or null to use the honest one. Used to prove
   * bad-share attribution; production passes nothing.
   */
  forgeShare?: (slot: number, fromPub: Hex) => Promise<RevealShare | null>
}

export interface RunDealResult {
  /** holeCards[seatIndex] = the 2 card indices that seat (and only that seat) learned */
  holeCards: Record<number, number[]>
  /** the 5 community cards (flop+turn+river), readable by all */
  community: number[]
  /** total number of board posts emitted (shuffle + share posts) */
  postCount: number
}

/**
 * Verify a slot's shares FIRST (attributing any failure to the offending seat), THEN
 * combine. This is the single chokepoint enforcing the Task-2 safety contract.
 */
async function verifyAttributed(
  provider: MaskedDeckProvider,
  pubs: Hex[],
  deck: WireMasked[],
  slot: number,
  tableId: Hex,
  shares: RevealShare[],
): Promise<void> {
  // First the cheap aggregate check — if it's all good, we're done.
  if (await verifyAllShares(provider, pubs, deck, slot, tableId, shares)) return
  // It failed: pinpoint WHICH seat's share is bad (attribution, not just slot-level).
  const ctx = ctxFor(tableId, slot)
  const card = deck[slot]!
  const allowed = new Set(pubs.map((p) => p.toLowerCase()))
  for (const rs of shares) {
    const ok =
      allowed.has(rs.from.toLowerCase()) &&
      (await provider.verifyShare(rs.from, card, rs.share, ctx))
    if (!ok) throw new ShareAttributionFault(slot, rs.from)
  }
  // Defensive: verifyAllShares said false but every individual share verified — treat
  // as a slot-level fault attributed to the first contributor.
  throw new ShareAttributionFault(slot, shares[0]?.from ?? ('0x' as Hex))
}

/** Apply the optional forge seam to a freshly-collected share set (test only). */
async function maybeForge(
  shares: RevealShare[],
  slot: number,
  forge: RunDealArgs['forgeShare'],
): Promise<RevealShare[]> {
  if (!forge) return shares
  return Promise.all(
    shares.map(async (rs) => (await forge(slot, rs.from)) ?? rs),
  )
}

/**
 * Drive the whole deal: shuffle posts are assumed already produced (the deck is the
 * post-shuffle deck), but we still POST one SHUFFLE envelope per seat to model the
 * shuffle chain on the board; then hole reveals (per peer per hole slot), then the
 * five community reveals (per seat per community slot). Every share is verified before
 * it is combined, with seat attribution on failure.
 */
export async function runDeal(args: RunDealArgs): Promise<RunDealResult> {
  const { provider, seats, tableId, deck, plan, board, forgeShare } = args
  if (!args.verifyAllShares) throw new Error('runDeal: verifyAllShares must be true (safety contract)')
  const n = seats.length
  const pubs = seats.map((s) => s.pub)
  let postCount = 0

  // 1) Shuffle chain: one SHUFFLE post per seat. (The deck is already shuffled; here we
  //    record the chain on the transcript so the board carries N shuffle posts.)
  for (let i = 0; i < n; i++) {
    await postStep(board.transcript, seats[i]!.signer, { kind: 'SHUFFLE', seat: i, round: { deck, proof: '0x' } }, board)
    postCount++
  }

  // 2) Hole cards: for each hole slot, each of the N-1 PEERS posts its share (one post
  //    each), the OWNER computes its own share locally, we verify ALL shares (peers +
  //    own) FIRST, then the owner combines via revealHole.
  const holeCards: Record<number, number[]> = {}
  for (let s = 0; s < n; s++) holeCards[s] = []
  for (let s = 0; s < n; s++) {
    for (const slot of plan.holeSlots[s]!) {
      const peers = seats.filter((_, i) => i !== s)
      let peerShares = await collectShares(provider, peers, deck, slot, tableId)
      peerShares = await maybeForge(peerShares, slot, forgeShare)
      // each peer posts its hole share (one envelope per peer per slot)
      for (let pi = 0; pi < peers.length; pi++) {
        await postStep(board.transcript, peers[pi]!.signer, { kind: 'HOLE_SHARE', target: s, slot, share: peerShares[pi]! }, board)
        postCount++
      }
      // owner's own share (computed locally; not a separate broadcast — the owner keeps it)
      const ownShare = await provider.share(seats[s]!.secret, deck[slot]!, ctxFor(tableId, slot))
      const allForSlot: RevealShare[] = [...peerShares, { from: seats[s]!.pub, share: ownShare }]
      // verify-then-combine, with seat attribution on failure
      await verifyAttributed(provider, pubs, deck, slot, tableId, allForSlot)
      holeCards[s]!.push(revealHole(provider, deck, slot, ownShare, peerShares))
    }
  }

  // 3) Community: flop(3) + turn + river. Each seat posts its share for each community
  //    slot (one post per seat per slot); all N shares are verified, then combined for all.
  const community: number[] = []
  const communityGroups: { group: 'FLOP' | 'TURN' | 'RIVER'; slot: number }[] = [
    ...plan.flop.map((slot) => ({ group: 'FLOP' as const, slot })),
    { group: 'TURN' as const, slot: plan.turn },
    { group: 'RIVER' as const, slot: plan.river },
  ]
  for (const { group, slot } of communityGroups) {
    let shares = await collectShares(provider, seats, deck, slot, tableId)
    shares = await maybeForge(shares, slot, forgeShare)
    for (let i = 0; i < seats.length; i++) {
      await postStep(board.transcript, seats[i]!.signer, { kind: 'COMMUNITY_SHARE', group, slot, share: shares[i]! }, board)
      postCount++
    }
    await verifyAttributed(provider, pubs, deck, slot, tableId, shares)
    community.push(revealCommunity(provider, deck, slot, shares))
  }

  return { holeCards, community, postCount }
}
