# Track-3 N-party Hold'em — Task 5 report (betting rounds + side-pots)

- **Plan:** `docs/superpowers/plans/2026-06-24-uzkge-holdem.md` (Task 5).
- **Clone/branch:** main clone `/Users/michaelmclaughlin/Documents/gibs-finance/random`, branch
  `feat/holdem-nparty` (confirmed; the sibling `random-zk` worktree was NOT touched).
- **Scope:** Task 5 ONLY — Texas Hold'em betting state machine (4 streets, blinds, check/bet/
  call/raise/fold, min-raise, all-in, incomplete-raise rule) + the standard side-pot algorithm,
  behind `IGameRulesN`, mirrored in `HoldemRules.sol`. The 5-card hand evaluator (Task 6) and
  showdown settlement/rake (Task 7) are NOT implemented; showdown winner selection is STUBBED
  (uncontested-hand sweep only), clearly marked.

## What was built

### TS (package `@gibs/holdem`)
- `src/sidePots.ts`
  - `buildSidePots(totalContributed, folded)` — pure, dependency-free standard side-pot
    construction. Walks distinct contribution levels ascending; each layer's amount is
    `(level - prevLevel) × #contributors(folded or not)`; a layer is contested only by the
    NON-folded seats that reached it. Two refinements that are the classic bug surface:
    - **Merge** of adjacent layers with an identical eligible set (a *new* side pot forms only
      when eligibility actually shrinks among LIVE seats — a folded seat's distinct level does
      not by itself split the pot).
    - **Dead-money carry**: a layer with no live claimant (all its contributors folded) rolls
      its chips forward into the next live layer (or into the last live pot), so nothing
      vanishes and `Σ pots == Σ totalContributed` always.
  - `splitPot(amount, winners, button, nSeats)` — deterministic even split with the odd-chip
    remainder rule: the first `remainder` winners scanning clockwise from the seat left of the
    button (button+1, button+2, … mod n) each get +1 chip. Reproducible from (button, nSeats)
    alone; mirrored by the (future) Solidity settlement. Conserves `Σ shares == amount`.
- `src/rules.ts`
  - `Phase` enum (SETUP…SETTLED; the 4 BET_* streets interleaved with DEAL_* phases),
    `HoldemState`, `Move`, `initHoldem`, `applyMove`, and `conserved(state)` (the channel
    invariant `Σ stacks + pot + Σ sidePots (+ rake=0) == Σ escrow`).
  - The betting state machine: blind posting (heads-up: button is SB and acts first preflop;
    N≥3: SB=button+1, BB=button+2, UTG opens preflop; post-flop first-to-act is the first live
    seat left of the button), in-turn enforcement, `currentBet`/`minRaise` tracking, round
    closure when every actable seat has matched and acted since the last full aggression,
    street advance with `committed` reset + uncalled-bet return + side-pot recompute, all-in
    detection, and the **incomplete-raise rule** (an all-in for less than a full raise raises
    `currentBet` for calling but does NOT reopen the betting for seats that already acted).
- `src/encoding.ts` — canonical ABI tuple `GAME_STATE_TUPLE` (the whole state encoded as ONE
  dynamic `tuple` so it matches Solidity `abi.decode(bytes,(Holdem))` byte-for-byte — a flat
  parameter list would mis-place the dynamic-array offsets; this was a real parity bug found and
  fixed), `encodeGameState`/`hashGameState`/`encodeMove`, `eligibleToMask`/`maskToEligible`
  (bridge between the rules' `eligible:number[]` and the channel/Solidity `eligibleMask:uint256`),
  and `whoseTurn(state)` (bit i => seat i owes; exactly `toAct` in a BET_* phase, every live seat
  in a DEAL_* phase, nobody at SHOWDOWN/SETTLED).
- `src/index.ts` — re-exports the three new modules.

### Solidity (`packages/contracts/contracts/zk/HoldemRules.sol`)
- `IGameRulesN` implementation (`gameId`=2, `hashGameState`, `isFinal`, `whoseTurn`, `applyMove`).
- Pure mirror of `rules.ts applyMove` (betting half) + an in-contract `_recomputePots` that
  mirrors `buildSidePots` exactly (levels, widths, dead-money carry, eligible-set merge). The
  `Holdem` struct mirrors `GAME_STATE_TUPLE` field-for-field. Compiles clean under the default
  (viaIR) profile; deploy ~1.6M gas.

## Conservation evidence (the channel invariant)
- `rules.test.ts` asserts `conserved(state) == Σ escrow` after EVERY accepted transition via the
  `step()` helper, across blinds, calls, raises, folds, all-ins, multi-level all-in side pots,
  the incomplete-raise case, the folded-seat-forfeits case, and the uncontested hand sweep.
- `sidePots.test.ts` asserts `Σ pots == Σ totalContributed` for the classic cases and over 2000
  randomized contribution/fold vectors (N=2..9), plus `Σ splitPot shares == amount` over 1000
  random splits.

## Side-pot edge cases covered (the classic poker bug surface)
- (a) no all-in → single main pot, all non-folded eligible.
- (b) one short all-in → main pot capped at the all-in level + a side pot for the remainder.
- (c) multiple all-ins at different levels → N layered pots with shrinking eligibility.
- (d) folded contributors leave their chips in the pots but are ineligible; their distinct level
  does NOT split the pot when the live eligible set is unchanged (merge).
- (d3) a folded seat at a distinct level DOES split when a live seat is capped below it.
- (e) odd-chip remainder assigned deterministically (first eligible seat left of the button),
  including wrap-around the button and the multi-odd-chip case.
- ties across pots are handled by `splitPot` per eligible set (winner selection is Task 6/7).
- all-in for less than a full raise does NOT reopen betting — tested in both the betting unit
  test and exercised in the parity fuzz.

## Stubbed showdown boundary (explicitly marked)
- `finishHand` (TS) / `_finishHand` (Sol): an **uncontested** hand (exactly one live seat) sweeps
  every pot to that seat and records `stubWinner`; conservation still holds. A true **multiway**
  SHOWDOWN leaves the pots unswept and `stubWinner = -1` — the winner(s)/rake belong to the Task
  6 evaluator + Task 7 settlement. The parity fuzz terminates each walk at SHOWDOWN.
- Rake is carried in state (`rakeBps`/`rakeCap`) but is 0 throughout Task 5 (settle-time deduction
  is Task 7). Conservation uses rake=0.

## Tests + commands
- `pnpm --filter @gibs/holdem test -- rules sidePots` → 61 passing (betting state machine +
  side-pot algorithm + splitPot + conservation + randomized property tests). N=2 (heads-up blind
  order) and N=3/4 covered.
- `pnpm --filter @gibs/holdem typecheck` → clean.
- `pnpm --filter @gibs/contracts test --grep "Holdem TS<->Solidity parity"` (hardhat+viem):
  - 180 seeded random walks over N∈{2,3,6} asserting TS `applyMove` and `HoldemRules.applyMove`
    agree on accept/reject AND on the post-move `keccak(encode(state))` at every step.
  - Coverage assertions (all > 0): every interior street (BET_PREFLOP/FLOP/TURN/RIVER + SHOWDOWN)
    reached by an accepted transition, ≥1 all-in, ≥1 fold, ≥1 multi-way side pot, ≥1 showdown.
    Verified via a TS-only mirror of the generator: phase counts {PREFLOP 1099, BET_FLOP 819,
    BET_TURN 645, BET_RIVER 486, SHOWDOWN 180}, allIns 127, folds 1562, sidePots 1774.
  - `whoseTurn` spot-state test agrees TS↔Sol (preflop UTG owes; after a call the SB owes; a
    DEAL_FLOP state names every live seat; an uncontested SHOWDOWN names nobody).

## Deviations from the plan
- **Walk count 180, not 500.** The full `HoldemState` is a ~1.5KB dynamic struct whose ABI-decode
  costs ~1.6M gas per `eth_call`; 500 walks against the single-threaded in-process EDR node
  blew the mocha timeout (5–9 min, no divergence — pure throughput). 180 independent seeded walks
  drive full phase/all-in/fold/side-pot coverage (the coverage assertions FAIL the test if depth
  is ever lost), so the count was sized for signal. No parity divergence was ever observed at any
  count; the only failures during development were generator/coverage issues, all fixed.
- `splitPot` (deterministic odd-chip distribution) was added in `sidePots.ts` to make the
  odd-chip rule testable in Task 5 without the hand evaluator; the actual winner selection that
  consumes it is Task 6/7.

## Concerns / carry-forwards
- The parity suite is slow (~5 min) because of the heavyweight struct decode. Task 7 may want a
  leaner on-chain encoding (e.g. drop `actedSinceAggression` from the co-signed encoding and
  recompute, or pack bool[] into a bitmask) to cut decode gas; flagged, not done here.
- `HoldemState.sidePots` uses `eligible:number[]` while the channel `SidePot` uses
  `eligibleMask:bigint`; `encoding.ts` bridges them. Task 7 settle must convert the game-state
  side pots into the channel's `SidePot[]` (mask form) when producing the co-signed settle state.
- Showdown winner + rake are stubbed (see boundary above) — Task 6/7.

## Task-5 review fix: C1 short-blind all-in

Fixed C1 (Critical) from the Task-5 review: a seat owing a blind larger than its remaining
stack used to throw an uncaught `Error('insufficient stack')` from `putIn` (violating the
`MoveResult` never-throw contract), while Solidity `_postBlind` cleanly reverted — a TS(throw)
vs Solidity(reject) desync the parity gate structurally could not see (the fuzzer's stack floor
of `20 + rnd*80` never generated a short blind, and `runWalk` called TS `applyMove` with no
try/catch, so the path would have *crashed* the gate rather than logged a divergence).

Resolution — the standard live-poker **short all-in blind**, mirrored on both sides:

- **TS** (`examples/games/holdem/src/rules.ts`, POST_BLIND): the expected blind is now
  `min(stack, requiredBlind)`; a seat that can't cover its blind posts its whole stack and is
  marked all-in by `putIn` (which empties the stack). The big blind still opens the action at
  the FULL `bigBlind` level even when the BB is short (later seats owe the full blind to call).
- **Solidity** (`packages/contracts/contracts/zk/HoldemRules.sol`, `_postBlind`): mirrored
  exactly — `expected = min(stack, requiredBlind)`, same resulting state, so
  `keccak(encode(state))` matches TS.
- **Latent bug also surfaced by widening the fuzz** (and fixed on both sides): a BET/RAISE
  whose *stack-capped* all-in target falls at or below `currentBet` (e.g. a 1-chip stack
  "raising" while facing a bet of 2) was accepted by TS as a raise that LOWERED `currentBet`,
  while Solidity underflowed `actualTarget - currentBet` (uint256) and reverted. Added a guard
  on both sides: an all-in that does not exceed the current bet is rejected as a BET/RAISE
  (it is an all-in call for less — the caller must CALL). This keeps `increment` non-negative.
- **Parity fuzzer** (`packages/contracts/test/HoldemParity.test.ts`): lowered the per-seat
  stack floor from 20 to 1 (`1 + rnd*100`) so short blinds are generated; `genLegalMove` now
  posts `min(stack, blind)`; added a `shortBlinds` coverage counter with an assertion that the
  short-all-in-blind path is actually exercised (TS+Solidity agreeing on accept/reject +
  post-move state hash). Hardened `runWalk`: the TS `applyMove` call is wrapped so a thrown
  exception is recorded as a DIVERGENCE (test failure with detail), not an uncaught crash —
  defense in depth so a future never-throw violation is caught, not hidden.

Tests: a new short-blind describe block in `examples/games/holdem/test/rules.test.ts` (short BB,
short SB, heads-up short button, all-in seat ineligible to act + conservation) — RED on the old
code (throw / "blind must be 2"), GREEN after. Full holdem vitest = 65 pass (61 prior + 4 new),
conservation holds at every step. `npx hardhat test test/HoldemParity.test.ts` = 2 passing with
the short-blind coverage assertion now reached.
