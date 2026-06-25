# Track 3 — Task 8 report: End-to-end multi-seat Hold'em hand + on-chain settle

- **Status:** DONE (+ Task-8 review fixes applied 2026-06-25 — see final section)
- **Date:** 2026-06-25
- **Branch / clone:** `feat/holdem-nparty` in the main clone
  `/Users/michaelmclaughlin/Documents/gibs-finance/random` (no worktree touched).
- **Scope:** Task 8 only — the full Texas Hold'em hand wired end-to-end over the
  fake/in-memory board for N=2 and N=3, including the on-chain `HoldemTableN.settle`
  acceptance. No other task implemented. No push, no deploy.

---

## What was built

### 1. M1 carry-forward fix — SHUFFLE posts now carry REAL `WireShuffle`s

`examples/games/holdem/src/dealSeq.ts` (Task 3) previously stubbed the on-board SHUFFLE
posts as `{ deck: <final deck>, proof: '0x' }` — re-posting the post-shuffle deck with a
placeholder proof, so the board transcript was **not** a verifiable shuffle record.

`runDeal` now accepts the real per-round `rounds: WireShuffle[]` from
`runShuffleChain` (Task 1) and posts `rounds[i]` on each SHUFFLE envelope (with a length
guard `rounds.length === seatCount`). A legacy fallback (final-deck placeholder) is kept
only for older callers that omit `rounds`; the session and e2e always pass the real rounds.

New RED→GREEN tests in `dealSeq.test.ts`:
- *"SHUFFLE posts carry the REAL per-round WireShuffles (M1 carry-forward)"* — extracts the
  `WireShuffle` from each SHUFFLE transcript post and asserts:
  - each `round.proof` is a real signature (not `'0x'`);
  - `verifyShuffleChain(provider, agg, initial, postedRounds, signerAddrs)` returns **true**
    — i.e. the board transcript replays as a verifiable shuffle chain over the masked
    initial deck;
  - the last posted round's deck commitment equals the final deck the deal dealt from.
- a guard test that a wrong-length `rounds` list is rejected.

**Confirmed: the SHUFFLE posts now carry real WireShuffles** — the transcript is a
verifiable shuffle record, not a placeholder.

### 2. `examples/games/holdem/src/session.ts` — N-seat orchestration (`runHand`)

`runHand` wires every prior task into one full hand and returns the SETTLED game state, the
on-chain settle `ChannelStateN` + N-of-N signatures, the whole co-signed-state history, the
revealed hole/community cards, and the board transcript. It does **not** re-implement
crypto, rules, side-pots, or the evaluator — it sequences the already-proven modules:

| Stage | Module exercised |
|---|---|
| Deck (Task 1) | `jointKey` over all seats' deck pubs + `runShuffleChain` (each seat shuffles+re-encrypts in turn, attested) |
| Deal (Task 3) | `runDeal` over the fake board — SHUFFLE chain (real `WireShuffle`s, M1) + hole/flop/turn/river reveals, each a board post, verify-then-combine on every share. Each seat learns exactly its 2 hole cards; community is public; undealt slots stay hidden |
| Betting (Task 5) | auto-posts blinds (SB→BB), then drives the four streets via per-seat scripted action tokens (`CHECK/CALL/FOLD/BET:n/RAISE:n/ALLIN`) through `rules.ts` `applyMove`; `DEAL_DONE` advances each DEAL_* phase |
| Showdown (Task 7) | feeds the REAL revealed holes + 5 community cards into the `SHOWDOWN` move → per-pot winners + rake (uncontested sweeps need no evaluation) |
| Settle bridge | `toChannelSettleState` turns the SETTLED `HoldemState` into the `ChannelStateN` the chain verifies |
| Channel (Task 4) | one `ChannelN` per seat; every step (genesis → blinds → each betting action → each DEAL_DONE → settle) is an **N-of-N co-signed** `ChannelStateN`. The channel's own `validate` enforces conservation (`Σ balances + pot + Σ sidePots + rake == escrow`) and monotone nonce at **every** accepted state |

Co-signing uses the real `ChannelN.propose → countersign (every peer) → finalize → adopt`
fan-out, so each snapshot in `res.coSigned` is fully signed by all N seats.

### 3. Tests

**`examples/games/holdem/test/session.test.ts`** (vitest, fake in-memory board):
- **N=2 heads-up CONTESTED** — deck→deal→betting→showdown→SETTLED; asserts each seat learns
  exactly its 2 hole cards, community is 5 distinct cards, every co-signed state conserves
  against escrow, the showdown winner matches `evaluate7`, and the SHUFFLE posts replay as a
  valid shuffle chain.
- **N=3 CONTESTED multiway** — everyone calls/checks to a 3-way showdown; the evaluator's
  max-score seat(s) win; conservation (Σ balances + rake == Σ escrow) holds; fully co-signed
  (3 sigs). **Rake is 0 in this vitest case** (pot 30, 2.5% floors to 0), so it does NOT
  exercise a non-zero rake — it only asserts the conservation field carries the (zero) rake.
  The genuine **non-zero** rake coverage is the hardhat e2e (`rakeBps=250`, ether-scale blinds,
  `rakeAccrued > 0` asserted, rake paid to the treasury).
- **N=3 UNCONTESTED sweep** — seat 0 and SB fold, BB wins uncontested (`stubWinner == 2`),
  no hand evaluation; pot − rake to the last seat; conserves.

**`packages/contracts/test/HoldemSettleE2E.test.ts`** (hardhat + viem, anvil, on-chain
settle — template `MsgBoardSettleE2E.test.ts`):
- **N=2 contested** — deploy `HoldemTableN` + `HoldemRules`, create/join/start with the
  on-chain-derived `tableId`, run `runHand` against the **deployed EIP-712 domain**, submit
  the N-of-N co-signed SETTLED state to `settle`. Asserts: table reaches **Settled** (status
  4), zero contract residue, each seat's wallet changes by exactly its co-signed `balances[i]`
  (the submitting seat's gas added back), exactly Σ escrow left the contract.
- **N=3 contested with rake** — `rakeBps=250`, `rakeCap=0.1 ETH`; asserts `rakeAccrued > 0`,
  the rake is paid to the **treasury**, each seat paid its payout, Σ payouts + rake == Σ escrow.
- **N=3 uncontested sweep** — fold-to-one; settle pays the last seat; conserves.

The settle is **gated on `_seatOf(msg.sender)`**, so a seat submits it (seat 0's local viem
wallet client); the seat's gas cost is added back in the payout assertion.

---

## Commands + results

```
pnpm --filter @gibs/holdem test            # 9 files, 116 tests PASS (incl. 3 session + 2 new dealSeq M1)
pnpm --filter @gibs/holdem typecheck       # tsc --noEmit, exit 0
cd packages/contracts && forge test --match-path 'test/foundry/HoldemTableN*'
                                           # 19 tests PASS (3 suites)
# hardhat+viem (run by file path — see "Deviation" below):
npx hardhat test test/HoldemSettleE2E.test.ts        # 3 passing (N=2 contested, N=3 rake, N=3 sweep)
npx hardhat test test/HoldemParity.test.ts test/HandEvalParity.test.ts test/ZkChannelNSig.test.ts
                                           # prior-task parity suites — green (no regression)
```

Full-hand wall-clock with the in-memory transport is sub-second per hand (the PoW-tempo
figure is the Task-3 per-post measurement projected onto the live board; the fake board's
`stamp()` is a no-op counter, not a grind).

---

## Deviations / concerns

1. **`@gibs/contracts` filter does not exist.** The plan's command
   `pnpm --filter @gibs/contracts test` names a package that isn't in the workspace — the
   contracts package is **`@gibs/random`** (`packages/contracts/package.json`). The hardhat
   tests are therefore run via `@gibs/random`'s `test` script.

2. **Pre-existing loader breakage blocks the whole-suite hardhat run.**
   `packages/contracts/test/MsgBoardSettleE2E.test.ts` imports `@gibs/msgboard-games`, whose
   `stamper.ts`/`board.ts` throw `ReferenceError: exports is not defined in ES module scope`
   under hardhat's ts-node CJS loader. This is **pre-existing and unrelated to Task 8** — it
   breaks even the already-committed `ChannelN digest` (Task 4) test, and it is triggered at
   module-load time before any test body runs. To run the Task-8 e2e (and the other holdem
   parity suites) I invoked hardhat with explicit **file paths** so mocha never loads the
   broken MsgBoard file. The grep'd whole-suite `--grep "Holdem|HandEval|ChannelN"` from the
   plan's step 8 cannot run until that loader issue is fixed separately. Recommend a follow-up
   to make `@gibs/msgboard-games` load cleanly under the hardhat ts-node CJS loader (e.g. an
   ESM-safe build or a mocha ignore), independent of this track.

3. **Off-chain co-sign domain.** The session's default co-sign domain is `TEST_DOMAIN_N`
   (a fixed 20-byte placeholder `verifyingContract`); the e2e overrides it with
   `makeDomainN(chainId, deployedAddress)` so the off-chain signatures recover correctly
   on-chain. `runHand` accepts an optional `domain` for exactly this.

4. **Attested-shuffle posture (carried from Task 1, spec §12).** v1 is entirely on
   secp256k1 + an **attested** (signature) shuffle — not zero-knowledge. The reveal is the
   real integrity gate (a corrupt slot surfaces as a `RevealFault`/`ShareAttributionFault`).
   The board transcript is now a verifiable *attribution* record (who shuffled, M1), but the
   permutation correctness still rests on "one honest shuffler ⇒ unknown order." The
   `MaskedDeckProvider` seam remains the drop-in point for the later SNARK shuffle.

5. **No live board / RPC.** Per the plan, the session uses the fake in-memory board (a
   `Transcript` + a no-op `stamp()` counter). The live `msgboard-games/board.ts` PoW path is
   not wired here (it is the same broken-loader package as concern 2); the security model is
   identical — only the per-post latency differs.

---

## Task-8 review fixes (2026-06-25)

The Task-8 review found 2 Important coverage gaps, 2 cosmetic type errors, and one overstated
report claim. All closed on `feat/holdem-nparty` (main clone), TDD, reusing the real modules +
the real on-chain dispute path. No reimplementation.

### Fix 1 (Important) — All-in → multi-level side pot through the FULL session e2e

New vitest case **"N=3 ALL-IN → multi-level side pot"** in
`examples/games/holdem/test/session.test.ts`. It drives a REAL all-in through `runHand` using
the `ALLIN` token and **uneven per-seat stacks** (new `RunHandArgs.buyIns` override, length ==
seat count): seat 0 (50) shoves all-in for less, seat 1 (100) shoves over it, seat 2 (200)
calls — producing a genuine two-layer pot: **main pot 150 eligible {0,1,2}** + **side pot 100
eligible {1,2}** (the short stack is NOT eligible for the side pot). The test asserts:
- a co-signed snapshot carried a non-empty `sidePots` on the all-in street (the side pot formed
  mid-hand, not just at settle);
- the layered structure matches the REAL `buildSidePots` on the final `totalContributed`;
- the showdown distributed **exactly per pot** — the final stacks equal the independently
  recomputed `showdownPayouts(...)` over the real revealed cards;
- the short stack is eligible **only** for the main pot (`winnings[0] <= 150`, can never receive
  a chip of the side pot);
- conservation holds at **every** co-signed step and whole-table against escrow.

Drive-through is the real modules end-to-end (deck→deal→betting→showdown→settle); no side-pot
logic is reimplemented in the test — it cross-checks against `buildSidePots` + `showdownPayouts`.

### Fix 2 (Important) — Forced-fold liveness e2e (highest-risk mechanism)

New on-chain e2e **"forced-fold liveness: a silent seat is force-folded on the chess clock"** in
`packages/contracts/test/HoldemSettleE2E.test.ts`. It exercises the REAL Task-4
`HoldemTableN` dispute path through the channel e2e (not just the foundry fuzz):
1. create/join/start a real table → **Live** (N=3, real escrow).
2. run `runHand` only to **harvest a legitimately co-signed mid-hand checkpoint** whose
   `gameStateHash` preimage is a BET-phase state where exactly one seat owes the next action
   and the pot is non-empty. (To make this possible, `runHand` now returns `gameStates` — the
   `HoldemState` preimage aligned 1:1 with each `coSigned` snapshot — so the on-chain side can
   recompute `encodeGameState(...)`; the test sanity-checks `keccak256(gameState) ===
   state.gameStateHash` and that `whoseTurn` names the demand seat.)
3. a non-silent seat calls **`openDispute`** naming the silent seat (DEMAND_MOVE) → **Disputed**.
4. `helpers.mine(CLOCK + 1)` advances past the chess clock.
5. **`resolveTimeout`** force-folds the silent seat.

Asserts: table reaches **Settled**, zero contract residue; the silent seat keeps **exactly** its
out-of-pot `balances[demandSeat]` (forfeits its in-pot stake, cannot gain by stalling); the
pot + side pots are redistributed to the still-eligible honest seats per the contract's
`_distribute` (mirrored in JS for the exact expected vector); conservation (Σ payouts + rake ==
Σ escrow) holds. This proves the dispute/forced-fold mechanism works through the channel e2e on
the **real `HoldemRules`** (`whoseTurn`/`hashGameState` over the canonical game-state tuple), not
only the foundry stub.

### Fix 3 (Minor) — type errors in `HoldemSettleE2E.test.ts`

- `:68` (`receipt.gasUsed * receipt.effectiveGasPrice` typed `number`) — the receipt is now
  typed `viem.TransactionReceipt`, so the product is `bigint`.
- `:105` (`Property 'args' does not exist` on the `getContractEvents` decoded log) — the result
  is now cast to a typed `{ args: { tableId } }[]` shape.

The contracts test file **typechecks cleanly** under the project tsconfig
(`npx tsc --noEmit -p tsconfig.json` reports no `HoldemSettleE2E.test.ts` errors).

### Fix 4 (Minor) — report correction

The earlier claim that the N=3 vitest case "exercises rake" was overstated — rake is **0** there
(pot 30, 2.5% floors to 0). The "Tests" section above now states this accurately: the genuine
non-zero rake coverage is the hardhat e2e.

### Verify (review fixes)

```
pnpm --filter @gibs/holdem test         # 9 files, 117 tests PASS (incl. the new all-in/side-pot case)
pnpm --filter @gibs/holdem typecheck    # tsc --noEmit, exit 0
cd packages/contracts && npx hardhat test test/HoldemSettleE2E.test.ts
                                        # 4 passing (N=2, N=3 rake, N=3 sweep, + forced-fold liveness)
npx tsc --noEmit -p tsconfig.json       # no HoldemSettleE2E.test.ts (:68/:105) errors
```

Whole-suite hardhat remains blocked by the **pre-existing** `stamper.ts` ESM loader issue
(concern 2 above) — not in scope; the Task-8 e2e is run by file path in isolation, as before.

---

## Whole-branch review fix: deck well-formedness + trust-model framing

**Finding (Important).** The attested N-party shuffle (`zk-core/src/attestedDeck.ts`
`verifyShuffle` = signature + deck-length only) does NOT prove the deck is a valid
PERMUTATION. A malicious shuffler can COPY one slot's ElGamal ciphertext `(c1,c2)` into
another slot during its `shuffle` turn — just two curve points, no plaintext knowledge.
Both slots then decrypt to the SAME valid card: every per-slot reveal passes
(`unmaskWithShares` finds a real card → no `RevealFault`), `runDeal` did not dedup, and the
evaluator treats a duplicate index as an ordinary pair. So a cheater could duplicate a
community card or pair the board with a hole card to manufacture a winning hand and steal
pot equity. Empirically reproduced: copying slot 0 → slot 5 yields both = card 0 with no
fault.

This is the documented v1 attested-shuffle limitation, but it is closable **cheaply in v1
WITHOUT the deferred SNARK shuffle** — a deck well-formedness guard. The previous "one
honest shuffler ⇒ unknown order" framing was misleading: one honest shuffler protects ORDER
SECRECY but NOT deck WELL-FORMEDNESS (a single malicious shuffler among N-1 honest ones
still injects a duplicate).

### Fix 1 (core) — cross-slot uniqueness check in `runDeal`

`holdem/src/dealSeq.ts`: `runDeal` now accumulates every DEALT slot's revealed card index
into a `revealedBySlot` map (across ALL hole slots for every seat AND every community slot),
and after the full dealt set is known calls `assertNoDuplicateCards`, which raises a new
attributable **`DuplicateCardFault`** (`{ card, slots: [earlier, later] }`) if any two slots
revealed the same card. The check runs over the FULL revealed multiset — not per-seat — so a
duplicate that spans a hole↔community boundary (or two seats' holes) is caught.

**Where it runs / why.** The check runs at **deal time**, at the end of `runDeal` — the
soundest available point, because `runDeal` is the sequencer that legitimately learns the
complete `2N+5` revealed set (every seat's holes + community) as it drives the deal. This is
strictly cleaner than deferring to showdown: it catches a duplicated card the instant the
deal completes, before any betting, and it needs no extra cross-seat hole disclosure beyond
what the sequencer already combines. (In the live protocol the same sequencer role runs the
deal; the duplicate is attributable — the SHUFFLE posts on the transcript replay via
`verifyShuffleChain`, so the injecting shuffle round/seat can be traced.)

### Fix 2 — re-scope the trust-model comments

`holdem/src/deckN.ts`: the module + `verifyShuffleChain` doc comments now split the trust
model into two DISTINCT properties and stop overclaiming:
  - **(a) ORDER SECRECY** — one honest shuffler suffices (attested chain, spec §12).
  - **(b) DECK WELL-FORMEDNESS** (no duplicates) — the attested shuffle does NOT prove this
    (`verifyShuffle` checks signature + length only); enforced SEPARATELY in v1 by the
    deal-time uniqueness check (`runDeal` → `DuplicateCardFault`). The `MaskedDeckProvider`
    SNARK seam would later prove both at once and make the deal-time check redundant.

### Fix 3 (cheap hardening) — uniform rake ceiling at `openDispute`

`packages/contracts/contracts/zk/HoldemTableN.sol`: `openDispute` now enforces
`state.rakeAccrued <= rakeCap` (mirroring settle's cap check), so the rake ceiling is uniform
across settle/timeout — the `disputeState` carried into a dispute is exactly what
`resolveTimeout` pays rake from, and without this an over-cap `rakeAccrued` could be paid out
via the timeout path. (The full bps reconstruction stays settle-only, since a mid-hand
disputeState may carry a non-zero pot.)

### Tests (RED → GREEN)

`holdem/test/dealSeq.test.ts`:
  - **duplicate-injection** — copies slot 0's ciphertext into slot 5 (the review's repro;
    slot 5 = seat 2's 2nd hole, N=3), asserts both slots individually reveal the SAME card
    (the old silent duplicate), then asserts `runDeal` now throws `DuplicateCardFault` with
    `card` and `slots: [0, 5]`. RED on old code (dealt silently, no fault), GREEN after.
  - **no false positive** — a legitimate deck still deals `2N+5` DISTINCT cards, no fault.

`packages/contracts/test/foundry/HoldemTableN.t.sol`:
  - **`test_openDisputeRejectsOverCapRake`** — a conserving CONTESTED disputeState with
    `rakeAccrued = 30 > rakeCap = 20` is rejected with `RakeTooHigh`; at/under the cap
    (rake 20) the same shape opens the dispute. RED without the require (openDispute did not
    revert), GREEN after.

### Verify (review fixes)

```
pnpm --filter @gibs/holdem test                          # 9 files, 119 tests PASS (117 + 2 new)
cd packages/contracts && forge test --match-contract HoldemTableN
                                                         # 20 tests PASS (19 + 1 new)
cd packages/contracts && npx hardhat test test/HoldemSettleE2E.test.ts
                                                         # 4 passing (e2e green)
```

Stays within the attested v1 model — this is the cheap well-formedness guard, NOT the
deferred SNARK shuffle.
