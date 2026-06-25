# Track 3 — Task 3 report: board-coordinated deal sequence

- **Date:** 2026-06-25
- **Branch:** `feat/holdem-nparty` (main clone `/Users/michaelmclaughlin/Documents/gibs-finance/random`)
- **Plan:** `docs/superpowers/plans/2026-06-24-uzkge-holdem.md` — Task 3 only.
- **Status:** DONE_WITH_CONCERNS (the O(N²) hole-share post budget — a tempo concern flagged in the plan, not a security issue).

## What shipped

- `examples/games/holdem/src/dealSeq.ts` — the deal sequencer.
- `examples/games/holdem/test/dealSeq.test.ts` — 8 tests.
- `examples/games/holdem/src/index.ts` — exports `./dealSeq`.

TDD: RED first (`Failed to load url ../src/dealSeq`), then GREEN. No crypto rewritten — drives
Task-1 (`runShuffleChain`) and Task-2 (`collectShares`/`verifyAllShares`/`revealCommunity`/`revealHole`/`ctxFor`)
primitives plus the zk-core `Transcript`/`makeEnvelope`/`verifyEnvelope` transport. No live RPC.

## Deal protocol / message shapes

`DealStep` is a discriminated union, ONE per board post (one transcript envelope):

```ts
type DealStep =
  | { kind: 'SHUFFLE'; seat: number; round: WireShuffle }
  | { kind: 'HOLE_SHARE'; target: number; slot: number; share: RevealShare }
  | { kind: 'COMMUNITY_SHARE'; group: 'FLOP'|'TURN'|'RIVER'; slot: number; share: RevealShare }
```

Each step encodes whose turn / which share / which slot:
- `SHUFFLE` — `seat` is the shuffler index; `round` is that seat's `WireShuffle`.
- `HOLE_SHARE` — a peer seat's decryption share for hole `slot` destined for owner `target`.
- `COMMUNITY_SHARE` — a seat's share for community `slot`, grouped FLOP/TURN/RIVER.

`postStep(transcript, signer, step, board)` mints the PoW stamp (`board.stamp()`), builds the
envelope (`makeEnvelope` → EIP-191 sig over the entry digest), and appends it to the hash-chained
transcript (which enforces `seq` and `prev` chaining). One step = one stamp = one post.

## Turn order / slot assignment (`dealPlan(nSeats)`)

Standard one-card-at-a-time Texas Hold'em:
- Hole: round 1 deals seat `s` slot `s`; round 2 deals seat `s` slot `N+s` ⇒ `holeSlots[s] = [s, N+s]`.
- Flop = `[2N, 2N+1, 2N+2]`, turn = `2N+3`, river = `2N+4`.
- Dealt slots = `2N+5`, all distinct; the remaining `52-(2N+5)` slots are NEVER revealed (asserted:
  the transcript carries no share envelope for any undealt slot).

## Verify-then-combine sequencing (Task-2 carry-forward, honored)

The sequencer ALWAYS calls `verifyAllShares` BEFORE `revealCommunity`/`revealHole`. The single
chokepoint is `verifyAttributed()`:
1. run the aggregate `verifyAllShares`; if true → combine.
2. on failure, re-check each share individually and throw `ShareAttributionFault { slot, seat }`,
   naming WHICH seat's share failed (its deck pub) — not just a slot-level fault.

Every share is bound to `ctxFor(tableId, slot)` (replay-binding). Hole reveals verify the full set
(N-1 peer shares + the owner's own share) before the owner combines; community reveals verify all N.

## Board-post mapping

| step | post(s) | signer |
|---|---|---|
| shuffle round (seat i) | 1 `SHUFFLE` | seat i |
| hole slot (owner s) | N-1 `HOLE_SHARE` (one per peer) | each peer |
| community slot | N `COMMUNITY_SHARE` (one per seat) | each seat |

The owner's own hole share is computed locally and kept private (never broadcast) — only the N-1
peer shares are posted, which is correct: a peer share alone reveals nothing without the owner's
secret (Task-2 passive-observer privacy).

## Post-count table (PoW-tempo budget; the plan's Concern)

`posts = N (shuffle) + 2N·(N-1) (hole) + 5N (community)`:

| N | shuffle | hole | community | TOTAL |
|---|---|---|---|---|
| 2 | 2 | 4 | 10 | 16 |
| 3 | 3 | 12 | 15 | 30 |
| 4 | 4 | 24 | 20 | 48 |
| 5 | 5 | 40 | 25 | 70 |
| 6 | 6 | 60 | 30 | 96 |
| 7 | 7 | 84 | 35 | 126 |
| 8 | 8 | 112 | 40 | 160 |
| 9 | 9 | 144 | 45 | 198 |

Hole-share posts grow O(N²). At ~1-2s PoW/post on the live board, a 9-seat hand's deal alone is
~198 posts ≈ 3-7 min of serial PoW wall-clock. **Recommendation (Concern, deferred to Task 8 / a
tempo optimization, NOT a security change):** batch one seat's shares for a reveal group into a
single `share[]`-body envelope. That collapses a hole round from `2N·(N-1)` to ~`N` posts (each
peer posts all its hole shares for the round at once) and community to `N`. The security model is
unchanged — same shares, same verify-then-combine, fewer envelopes. v1 keeps one-share-per-post for
clarity and per-share attribution simplicity; batching is the documented next step.

## Tests (all green; `pnpm --filter @gibs/holdem test`, 27 passed incl. 8 new)

- `dealPlan` slot layout for N=6 and N=2 (no reuse, count `2N+5`).
- `deckCommitment` mirrors `keccak(flatten(c1,c2))`.
- **Full deal N=2 and N=3:** each seat learns exactly its 2 hole cards; 5 community cards revealed
  to all; union is `2N+5` DISTINCT indices; no undealt slot ever appears in a share envelope; exact
  post count == stamps (one PoW per post); every envelope `verifyEnvelope`s and every signer is a
  seated wallet; independent re-derivation of holes/community matches.
- **Bad share with seat attribution:** seat 2 forges a share from a different secret for its first
  hole slot ⇒ `runDeal` rejects with `ShareAttributionFault { slot, seat: seat2.pub }` (proves
  verify-FIRST + attribution).
- **Wrong-signer post:** tampering `from` makes `verifyEnvelope` false.
- **Non-canonical prev-chain:** a stale `prev` throws `chain break` on append.

`pnpm --filter @gibs/holdem typecheck` → clean (it caught a real test typo — `shares` vs `share` —
mid-development, fixed).

## Deviations

- Added a test-only `forgeShare?` seam to `RunDealArgs` to inject a forged share deterministically
  for the attribution test, rather than monkey-patching the provider. Production callers pass nothing.
- `runDeal` takes the already-post-shuffle `deck` (output of `runShuffleChain`) and still emits N
  `SHUFFLE` posts to model the shuffle chain on the board (the plan's "each shuffle round = one
  post"). The shuffle crypto itself is Task 1; Task 3 only sequences/posts it.
- Used per-entry `verifyEnvelope` + a seat-address membership check in the test instead of a
  `Transcript.verify({A,B})` (that method is 2-party only; N-party transcript verification belongs
  to a later task / would require a zk-core change out of Task-3 scope).

## Concerns

- **O(N²) hole-share post budget** (above) — tempo, not security; batch in a follow-up.
- v1 attested-shuffle posture (Task-1/2 carry): reveal is the real integrity gate; a corrupt slot
  surfaces as `RevealFault`/`ShareAttributionFault`, never a bogus card. Unchanged here.
- `Transcript` N-party membership verification is not yet a first-class zk-core API; the sequencer
  relies on per-envelope signer recovery. Fine for Task 3; worth a `verifyN(addrs[])` later.
