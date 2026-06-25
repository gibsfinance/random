# Track 3 Hold'em — Task 1 Report — N-party joint key + sequential N-party shuffle

- **Date:** 2026-06-25
- **Plan:** `docs/superpowers/plans/2026-06-24-uzkge-holdem.md` (Global Constraints + Task 1)
- **Branch:** `feat/holdem-nparty`
- **Base:** `dice-onchain-settlement` (the games mainline that carries `examples/games/zk-core` and
  predates the Track 1/Track 2 specs). Explicitly NOT `feat/recompute-settle` / `feat/zk-privacy`
  (those two point at the same commit `3af42de` — the unrelated recompute work).
- **Scope shipped:** Task 1 ONLY. No other task touched. No push, no deploy.

---

## What I reused (consumed as-is) vs added (new)

### Reused — `@gibs/zk-cards-core` (`examples/games/zk-core`), unchanged

The plan's premise held exactly: the off-chain crypto is already N-agnostic, so Task 1 LEVERAGES
it rather than rewriting it. Verified by reading the source:

- `elgamal.ts` — `aggregatePubKeys(pks)` reduces an arbitrary-length list via a commutative point
  sum (so N≥3 and order-independence are free); `maskCard` / `remask` (ElGamal re-encryption);
  `decryptionShare`; `unmaskWithShares(m, shares)` subtracts an arbitrary number of N shares from
  `c2` and decodes against the 52-entry card table.
- `chaumPedersen.ts` — share-soundness proof/verify (not directly invoked in Task 1, but underlies
  `provider.share`/`verifyShare` used by the round-trip tests).
- `maskedDeck.ts` — the `MaskedDeckProvider` seam + wire types (`WireMasked`, `WireShuffle`,
  `WireShare`, `ShuffleSigner`).
- `attestedDeck.ts` — `AttestedElGamalDeck`: real ElGamal hiding + real Chaum–Pedersen share
  soundness, with an **attested** (secp256k1 signature over `keccak(before‖after)`) shuffle. Its
  `aggregate`, `initialDeck`, `shuffle`, `verifyShuffle`, `share`, `unmask` are all the N-party
  primitives; I orchestrate them, I do not touch them.

No file under `zk-core/` was modified. Regression check: `@gibs/zk-cards-core` still **47/47 green**.

### Added — new package `@gibs/holdem` (`examples/games/holdem`)

- `package.json`, `vitest.config.ts`, `tsconfig.json` — copied from `examples/games/hilo-war`,
  renamed `@gibs/holdem`, dep `@gibs/zk-cards-core: workspace:*` (and `@noble/curves`, `viem`,
  `vitest`, `typescript`, `@types/node` matching the sibling packages). Auto-discovered by the
  existing `examples/**` glob in `pnpm-workspace.yaml` (no workspace edit needed).
- `src/deckN.ts` — the thin N-party orchestration (below).
- `src/index.ts` — `export * from './deckN'`.
- `test/deckN.test.ts` — the Task-1 tests (RED→GREEN).

`pnpm-lock.yaml` gained the `@gibs/holdem` importer entry (the only lock change; +255 lines), a
direct consequence of adding the workspace package.

---

## N-party shuffle design (`src/deckN.ts`)

Three exports, all delegating to the existing provider:

```ts
export function jointKey(provider, pubs): Hex                 // = provider.aggregate(pubs)
export async function runShuffleChain(provider, agg, seats)   // seat 0 shuffles initialDeck;
  : { initial; finalDeck; rounds }                            //   seat i shuffles seat i-1's output
export async function verifyShuffleChain(provider, agg, initial, rounds, signerAddrs): boolean
```

- **Joint key** is `provider.aggregate(pubs)` — a single line. Because aggregation is a commutative
  EC point sum, the joint key is independent of seat order and accepts any N≥1.
- **Sequential shuffle chain:** `runShuffleChain` masks the initial 52-card deck under the joint key,
  then folds `provider.shuffle(agg, deck, seat.signer)` over the seat list, threading each round's
  output `deck` into the next seat's input. Each `provider.shuffle` is a real ElGamal re-encryption
  of every card plus a Fisher–Yates permutation, attested by that seat's wallet signature over
  `keccak(before‖after)`. After N rounds the deck is a permutation+re-encryption no single seat knows
  the order of — **one honest shuffler suffices** (an adversary would have to know *every* seat's
  permutation+remask randomness).
- **Verification:** `verifyShuffleChain` replays the chain, calling
  `provider.verifyShuffle(agg, before, round_i, signerAddrs[i])` with `before` starting at the
  initial deck and advancing to each round's output. Round/signer count mismatch ⇒ `false`.

### One design note worth flagging (not a deviation from intent)

`AttestedElGamalDeck.initialDeck` / `shuffle` use `r = randomScalar()` by default, so the initial
masked deck is **non-deterministic**. The plan's `runShuffleChain` signature returns
`{ finalDeck, rounds }`; but `verifyShuffleChain` needs the *exact* initial deck the chain masked
(the first round's attest signature is over `keccak(thatInitial ‖ round0.deck)`). I therefore made
`runShuffleChain` **also return `initial`** (additive — the plan's `finalDeck`/`rounds` fields are
unchanged) and the verify tests consume that returned `initial`. This is the only signature
refinement; it is required for honest-chain verification to be meaningful and does not change the
crypto.

---

## TDD record (RED → GREEN)

### RED (step 1 — module not found)

```
$ pnpm --filter @gibs/holdem test -- deckN
 ❯ test/deckN.test.ts (0 test)
FAIL test/deckN.test.ts [ test/deckN.test.ts ]
Error: Failed to load url ../src/deckN (resolved id: ../src/deckN) ... Does the file exist?
 Test Files  1 failed (1)
```

### GREEN (after implementing `src/deckN.ts`)

```
$ pnpm --filter @gibs/holdem test -- deckN
 ✓ test/deckN.test.ts (9 tests) 12115ms
   ✓ N-party joint key > aggregation is order-independent and yields a valid compressed point (N=5)
   ✓ N-party joint key > joint key equals the provider aggregate (delegation, not a re-impl)
   ✓ N-party sequential shuffle chain > N=5 shuffle chain is a permutation that round-trips under all shares
   ✓ N-party sequential shuffle chain > N=3 shuffle chain also round-trips (small table)
   ✓ shuffle chain verification + tamper rejection > verifies an honest chain (N=4)
   ✓ shuffle chain verification + tamper rejection > rejects a chain whose round deck has been tampered (one byte of c2)
   ✓ shuffle chain verification + tamper rejection > rejects a wrong signerAddrs order
   ✓ shuffle chain verification + tamper rejection > rejects when a round count mismatches the signer list
   ✓ hiding property — one honest shuffler suffices > re-running a seat shuffle with fresh randomness changes the final order but still round-trips
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

### Typecheck

```
$ pnpm --filter @gibs/holdem typecheck
$ tsc --noEmit
EXIT=0
```

### Regression (zk-core untouched)

```
$ pnpm --filter @gibs/zk-cards-core test
 Test Files  8 passed (8)
      Tests  47 passed (47)
```

### Test → Task-step mapping

| Plan step | Test(s) | Asserts |
|---|---|---|
| 1 (RED joint key) / 2 (GREEN) | "aggregation is order-independent…", "joint key equals the provider aggregate" | order-independence, valid 33-byte compressed point (`02`/`03` prefix), delegation to `aggregate` |
| 3 (RED chain round-trip) / 4 (GREEN) | "N=5 … round-trips under all shares", "N=3 … round-trips" | final deck is a permutation of `{0..51}` recovered via all-N decryption shares (the plan's exact N=5 test, plus N=3) |
| 5 (RED verify + tamper) / 6 (GREEN) | "verifies an honest chain", "rejects … tampered … c2", "rejects a wrong signerAddrs order", "rejects … round count mismatch" | honest chain verifies; one flipped `c2` nibble breaks the attest-sig recovery; wrong signer order ⇒ false; arity guard |
| 7 (RED hiding) | "one honest shuffler suffices" | two independent runs of the same seats over the same agg yield different final decks (the order depends on every shuffler's secret randomness) while both still decrypt to all 52 cards |

---

## Deviations from the plan

1. **`runShuffleChain` returns `initial` in addition to `{ finalDeck, rounds }`** — required so
   `verifyShuffleChain` can validate the first round against the exact (random-masked) initial deck.
   Additive; the plan's named fields are intact. (Detailed above.)
2. **Hiding test (step 7) operationalized as the plan's own suggestion** — "re-running … with a
   fresh RNG yields a different `finalDeck` digest while still round-tripping." This documents the
   attested-path trust model (spec §12); it is NOT a zero-knowledge proof (see Concerns).
3. No `initialDeck` is computed separately in the verify tests (the plan sketched
   `await p.initialDeck(agg)`); using the chain's returned `initial` is mandatory because masking is
   randomized — computing a *fresh* initial deck would never match the attested first round.

No `it.skip`, no `TODO`, no placeholder shipped.

---

## Concerns (carried forward)

- **Attested, not ZK (spec Constraint 2 / §12).** The shuffle's only integrity guarantee is the
  shuffler's secp256k1 signature over `keccak(before‖after)`. Security rests on "all N shufflers
  would have to collude to know the order." This is the accepted v1 posture. The real Baby-JubJub
  SNARK shuffle is a separate later spike; `MaskedDeckProvider` is the drop-in seam and nothing in
  `deckN.ts` assumes the attested provider beyond the interface.
- **Fisher–Yates modulo bias.** `AttestedElGamalDeck.shuffle` uses `randomScalar() % (i+1)`; over a
  256-bit scalar vs ≤52 the bias is negligible (already noted in the source). The hiding test
  asserts only that order *changes* run-to-run, not a distributional claim — deliberately loose, per
  the plan's concern note.
- **Performance.** Each `provider.shuffle` re-encrypts all 52 cards (EC ops); a 5-seat chain plus
  full all-N reveal of all 52 slots in a test runs ~3s. Fine for tests; on the live board each
  shuffle round is one PoW-gated post (the tempo budget is measured in Task 3, not here).
- **Seat key separation.** `SeatKeys` keeps the deck keypair (ElGamal, `@noble/curves`) distinct
  from the wallet/attest key (`viem` account `addr`), matching the provider's contract that the
  shuffle signer is the *wallet*, not the deck key. The round-trip/hiding tests use the deck
  `secret` for shares and the wallet `signer` for attestation — never mixed.

---

## Status

**DONE** — Task 1 complete: N-party joint key + sequential N-party shuffle, built entirely on the
existing N-agnostic `zk-core` primitives, with the plan-specified tests (N=3 and N=5 round-trip,
each-seat-shuffle soundness/verification, tamper + wrong-order rejection, and the one-honest-shuffler
hiding property) all green; typecheck clean; zk-core regression clean.
