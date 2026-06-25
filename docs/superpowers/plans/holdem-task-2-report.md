# Track 3 — Task 2 report: N-party selective reveal (hole-to-one, community-to-all)

- **Status:** DONE_WITH_CONCERNS (work complete + green; one ENVIRONMENT concern surfaced mid-run — a
  concurrent branch switch — see "Deviations / environment").
- **Branch:** `feat/holdem-nparty`
- **Plan:** `docs/superpowers/plans/2026-06-24-uzkge-holdem.md` (Global Constraints + Task 2).
- **Files added:** `examples/games/holdem/src/revealN.ts`, `examples/games/holdem/test/revealN.test.ts`;
  `examples/games/holdem/src/index.ts` re-exports `revealN`.

## What was built

`revealN.ts` is a **thin orchestration** over the already-N-agnostic `@gibs/zk-cards-core` crypto. It
does NOT reimplement anything — `provider.share` (Chaum–Pedersen `proveShare`), `provider.verifyShare`
(`cpVerify`), and `provider.unmask` (`unmaskWithShares`) are consumed as-is from `attestedDeck.ts` /
`chaumPedersen.ts` / `elgamal.ts`.

Exports (matching the plan's surface, with one deliberate refinement noted below):

```ts
export interface RevealShare { from: Hex; share: WireShare }          // from = seat deck-pub, for CP verify
export class RevealFault extends Error { readonly slot: number }       // attributable reveal-time fault
export function ctxFor(tableId: Hex, slot: number): string             // 'holdem/<tableId>/slot/<slot>'
export function collectShares(provider, seats, deck, slot, tableId): Promise<RevealShare[]>
export function verifyAllShares(provider, pubs, deck, slot, tableId, shares): Promise<boolean>  // see note
export function revealCommunity(provider, deck, slot, shares): number  // requires ALL N shares
export function revealHole(provider, deck, slot, ownShare, peerShares): number  // own + N-1 peers
```

### Reveal design — how hole-to-one vs community-to-all is enforced

A reveal is the collection + combination of one Chaum–Pedersen decryption share **per seat** over one
masked slot. `unmaskWithShares` computes `M = c2 − Σ shares` and decodes `M` against the 52-card table.
The combine succeeds **only when exactly the right set of shares is summed** — this is what distinguishes
the two modes, which differ ONLY by *which seats contribute*:

- **Community (flop/turn/river):** every one of the N seats contributes a share. `revealCommunity`
  combines all N → the public card, readable by all. Each seat's share is broadcast on the transport.
- **Hole (a seat's private cards):** the N−1 **other** seats each contribute a share (broadcast on the
  transport), but that set is short **exactly the owner's share**. Only the owner can compute its own
  share (it alone holds its deck secret), so only the owner can complete `M = c2 − Σpeers − own` and
  learn the card. `revealHole(provider, deck, slot, ownShare, peerShares)` is the owner-only entry
  point. A passive observer holding only the N−1 peer shares gets a non-card point → `RevealFault`;
  the card stays hidden. This is the **passive-observer privacy** posture from the plan's Task-2
  Concerns: peer shares are public, but a peer share alone reveals nothing without the owner's secret.

Replay binding: every share is bound to `ctxFor(tableId, slot)` = `holdem/<tableId>/slot/<slot>`, which
includes BOTH `tableId` and `slot`, so a share proven for slot X can't be replayed to verify slot Y.
(Task 3 further scopes per-hand uniqueness via a hand counter folded into `tableId`.)

`verifyAllShares` checks each contributed share is a sound CP share for the RIGHT seat: each share's
`from` must be in the authoritative `pubs` set AND its proof must verify against that pubkey over this
slot's ctx. Any forged / proof-tampered / cross-slot-replayed / unknown-seat share ⇒ `false`.

## CRITICAL — the v1 reveal-time integrity gate (carry-forward from Task 1 review)

Task-1 attestation proves **attribution** (who shuffled) but NOT permutation-correctness: a malicious
shuffler could duplicate or drop a card and still sign a valid attestation over `keccak(before‖after)`.
In v1 (attested, pre-SNARK) the **reveal is the real integrity gate**. The implementation enforces this:

- `unmaskWithShares` throws when the combined point isn't a genuine card point. `revealN.combine`
  wraps `provider.unmask` and **rethrows that as a `RevealFault` carrying the offending `slot`** — it
  never swallows the error and never returns a bogus card. Both `revealCommunity` and `revealHole`
  route through `combine`, so a corrupted slot surfaces identically in both modes.

### Reveal-time fault-detection test (the integrity-gate test)

`reveal-time integrity gate — corrupted (non-permutation) deck is DETECTED` (2 cases):

1. **Community case.** A slot's `c2` is corrupted by adding the joint-key point: `cardPoint(i)=G·(i+1)`
   and the joint key is `G·Σsk` (a large ~random scalar), so the new plaintext is provably NOT any of
   the 52 card points (a "passed attestation but isn't a real card" deck). `c1` is left untouched, so
   the seats' shares are **honest CP shares over the corrupted ciphertext** — the test asserts
   `verifyAllShares === true` (shares are sound) **yet** `revealCommunity` throws a `RevealFault` whose
   `.slot === 1` and whose message matches `/slot 1/`. It then asserts an UNCORRUPTED slot still reveals
   correctly — the fault is **localized and attributable**, not a whole-deck failure.
2. **Hole case.** The same corruption on a hole slot: `revealHole` (owner path, own + peer shares) also
   throws `RevealFault` with the right `.slot`, proving the gate works in the private-reveal path too —
   the owner gets a detectable fault, never a silent mis-deal.

This is the requested proof that a deck which passed shuffle-attestation but isn't a real permutation is
DETECTED at reveal.

### Hiding test

`HIDING: the N-1 peer shares alone do NOT reveal the card to a non-owner`: collects the N−1 peer shares
(everyone except the target seat) and asserts that combining only those (`revealCommunity(deck, slot,
peerShares)`) throws `RevealFault` — a non-owner cannot learn the card. The same test then supplies the
owner's own share and asserts `revealHole` returns the correct index `33`. So: (N−1) shares hide the
card; only with the owner's own share does the owner learn it.

## Exact commands + output

RED (before `revealN.ts` existed):
```
pnpm --filter @gibs/holdem test -- revealN
# FAIL test/revealN.test.ts
# Error: Failed to load url ../src/revealN (resolved id: ../src/revealN) ... Does the file exist?
```

GREEN (final, on `feat/holdem-nparty`):
```
pnpm --filter @gibs/holdem test
#  ✓ test/revealN.test.ts (10 tests)
#  ✓ test/deckN.test.ts  (9 tests)
#  Test Files  2 passed (2)
#       Tests  19 passed (19)

pnpm --filter @gibs/holdem typecheck
#  $ tsc --noEmit   → EXIT 0
```

`revealN.test.ts` cases (10): community combines all N; community throws on a missing share;
verifyAllShares accepts honest set; rejects forged share (wrong secret); rejects tampered proof; rejects
cross-slot replay; hole owner reveals; **hiding (N−1 hides, own share reveals)**; **integrity gate —
community corrupted slot detected (attributable)**; **integrity gate — hole corrupted slot detected**.

## Deviations from the plan

- **`verifyAllShares` is `async` (returns `Promise<boolean>`)**, not the sync `boolean` in the plan's
  signature sketch. The underlying `provider.verifyShare` is genuinely async; a sync wrapper silently
  returned a truthy Promise and made rejection tests pass-by-accident. Making it async is the correct
  fix (callers `await` it). This is a signature refinement, not a security change.
- Added a small `dealtDeck` test helper that masks a 6-card deck under the joint key with a chosen card
  at a chosen slot, instead of running a full `runShuffleChain` per reveal test. Reveal operates on
  whatever masked card sits in a slot, so this is faithful AND keeps the suite fast/deterministic. The
  full-chain round-trip is already covered by Task 1's `deckN.test.ts`.
- Added `RevealFault` (an exported error class carrying `.slot`) beyond the plan's listed exports —
  required to satisfy the carry-forward mandate that the fault be a *clear, attributable* surface
  (which position failed), not a swallowed/bogus result.

## Deviations / environment (the DONE_WITH_CONCERNS reason)

Mid-session the working tree was switched OFF `feat/holdem-nparty` onto `feat/zk-privacy` by a
concurrent process (not by this task). On `feat/zk-privacy` the holdem package doesn't exist in HEAD, so
`package.json`/`vitest.config.ts`/`tsconfig.json` vanished and `pnpm --filter @gibs/holdem` reported
"No projects matched". Diagnosed via `git branch --show-current`, switched back with
`git checkout feat/holdem-nparty` (my new files were untracked and survived; the tracked `index.ts`
re-export was reverted by the checkout and re-applied), then re-ran the full suite + typecheck GREEN on
the correct branch before committing. No code concern — flagged so reviewers know the branch was briefly
contended and the final verification was done after returning to `feat/holdem-nparty`.

## Concerns (carried forward to later tasks)

- **`ctx` is the only replay defense for shares.** Every reveal MUST use `ctxFor(tableId, slot)` (both
  fields). Task 3 must additionally fold a per-hand counter into `tableId` so a share from hand H can't
  be replayed in hand H+1 at the same slot.
- **Attested, not ZK (v1 posture).** The integrity gate is reveal-time fault detection, not a shuffle
  SNARK: a corrupted deck is *detected* but only *after* the shuffle is accepted, and the cost is a
  re-deal/dispute. A duplicate that happens to map to another valid card point would NOT be caught at
  reveal (it decrypts to a real card) — the gate catches non-card corruptions, which is what a dropped
  card / structurally-broken permutation produces. Full permutation-correctness is the deferred SNARK
  shuffle prover's job (Constraint 2 / out-of-scope). Flagged for the dispute design (Task 4) and the
  later SNARK spike.
- **Hole privacy is passive-observer privacy.** Peer shares are broadcast; they reveal nothing without
  the owner's secret. A peer that withholds/forges its share is caught by `verifyAllShares`; a peer that
  refuses to share at all is a liveness issue handled by the per-seat timeout (Task 4), not here.
