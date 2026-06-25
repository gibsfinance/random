# Track-3 Hold'em — Task 4 report: N-party channel (thin chain)

- **Status:** DONE
- **Branch:** `feat/holdem-nparty` (main clone `/Users/michaelmclaughlin/Documents/gibs-finance/random`)
- **Date:** 2026-06-25
- **Scope:** Task 4 ONLY — the N-seat escrow/settle/dispute contract + off-chain co-signing
  mirror, with NO poker rules (uses `MockGameRulesN`). No betting/side-pot/hand-ranking logic
  (Tasks 5–7). The 2-party `ZkTable`/`HiLoWar`/`zk-core` were not modified.

## What was built

### Off-chain (`@gibs/holdem`)
- `examples/games/holdem/src/stateSigN.ts` — `ChannelStateN` (N balances vector, main pot,
  `SidePot[]`, `rakeAccrued`), the EIP-712 type set `CHANNEL_STATE_N_TYPES` (incl. the `SidePot`
  typed struct), `hashStateN`/`signStateN`/`verifyStateSigN`, `makeDomainN` (domain
  `HoldemTableN`/`1`), and `totalLocked` (Σ balances + pot + Σ sidePots + rake).
- `examples/games/holdem/src/channelN.ts` — `ChannelN`, the N-of-N co-signing channel:
  `propose` (author + self-sign) → `countersign` (each peer validates all present sigs, adds
  its own) → `finalize` (proposer adopts the fully-signed state) → `adopt` (fan-out: every peer
  adopts the completed N-of-N state; idempotent). Enforces genesis nonce 0, monotone nonce,
  per-seat balances length == N, and the N-conservation invariant on every state.
- Exported via `src/index.ts`.

### On-chain (`packages/contracts`)
- `contracts/zk/ChannelStateN.sol` — `SidePot` + `ChannelStateN` structs and
  `ChannelStateNLib` (EIP-712 struct hashing with the dynamic-array rules; `totalLocked`).
- `contracts/zk/IGameRulesN.sol` — N-seat rules seam; `whoseTurn` returns a `uint256` **bitmask**
  (bit i => seat i owes) so a misbehaving seat can be named at seat-level granularity.
- `contracts/test/MockGameRulesN.sol` — permissive configurable stub (mirror of `MockGameRules`).
- `contracts/zk/HoldemTableN.sol` — the N-party table.

## N-party channel design (the thin chain)

`HoldemTableN` generalizes `ZkTable` from 2 fixed seats (A/B) to an N-seat dynamic table:

- **State:** per-table `seats[]`, `channelKeys[]`, `escrow[]` vectors (replacing
  `playerA/B`, `keyA/B`, `escrowA/B`). Status machine `Forming → Live → (Disputed) → Settled /
  Cancelled`.
- **Lifecycle:** `create(rules, buyIn, maxSeats, rakeBps, rakeCap, clockBlocks, channelKey)`
  seats the creator (seat 0); `join` appends a seat (exact `buyIn`, rejects any wallet/key
  collision by scanning the arrays — the N-seat generalization of ZkTable's binary collision
  guard); `start` flips `Forming → Live` once ≥2 seats; `leaveBeforeStart` (swap-and-pop refund,
  only while Forming so no co-signed state has pinned seat order) and `cancel` (sole-creator
  refund) via `forceSafeTransferETH`.
- **Settle:** `settle(state, sigs[])` requires `sigs.length == seats.length`, every
  `ECDSA.recoverCalldata` matches `channelKeys[i]`, `rules.isFinal(phase)`, `pot == 0` AND
  `sidePots` empty, conservation, and `nonce > checkpoint`; then `_payoutVector(balances)` pays
  each seat and `rakeAccrued` to a constructor-set `treasury`.
- **`_payoutVector`** loops `forceSafeTransferETH` per seat so one griefing receiver cannot block
  the others (ZkTable pattern, generalized to N).

`respondWithShare` is a `pure revert ShareDisputeDeferred()` stub — the Groth16 SNARK reveal-
dispute path is **deferred in v1** (Constraint 6). The `deckKeys` mapping is omitted entirely
(re-add when the SNARK path lands). SHARE demands resolve via `respondWithState` (a strictly-newer
co-signed state) or run the clock to forced-fold.

## Forced-fold-on-timeout + solvency proof approach

This is the highest-risk surface (N-party liveness). The mechanism:

- `openDispute(state, sigs[], gameState, demandSeat, demandKind, demandSlot)` does the N-of-N
  co-sign check, verifies `hashGameState(gameState) == state.gameStateHash`, and the per-seat
  guard `whoseTurn(gameState) & (1 << demandSeat) != 0`. The demand names **exactly one**
  `demandSeat` — this is the seat-level-attribution hook: a seat surfaced by the deal layer's
  `ShareAttributionFault{slot, seat}` can be demanded-of here.
- If the demanded seat responds in its window (`respondWithMove` judged by `rules.applyMove`, or
  any seat posts a newer co-signed state via `respondWithState`), the table returns to `Live`.
- If the chess clock expires, `resolveTimeout` **force-folds** `demandSeat`:
  - every seat keeps its co-signed `balances[i]` (the staller keeps its stack);
  - the staller **forfeits its in-pot stake**: the main pot and every side-pot it was eligible
    for are redistributed to the still-eligible **non-forfeiting** seats by `_distribute`
    (equal split; odd-chip remainder to the lowest-index eligible seat — deterministic);
  - the hand settles among the honest seats; the table never freezes for the N−1.

**Solvency / conservation proof.** Every state accepted by `_checkCoSigned` satisfies
`Σ balances + pot + Σ sidePots + rakeAccrued == Σ escrow` (the conservation guard). On settle,
`pot`/`sidePots` are zero so `Σ balances + rake == Σ escrow` is paid exactly. On forced-fold,
`_payoutVector` pays `Σ balances` (unchanged) + the entire `pot` + every `sidePot.amount`
(redistributed, none dropped — `_distribute` assigns every wei incl. the remainder) + `rake`,
which by the invariant is exactly `Σ escrow`. So **every** terminal transition consumes exactly
the table's escrow. Three properties hold by construction:
- the staller never **gains** by stalling (it only ever forfeits its in-pot stake, never receives
  pot — `test_forcedFoldStallerNeverGains`);
- honest seats are never **frozen** (resolveTimeout settles unilaterally after the clock);
- funds are always **conserved** (the solvency invariant test, 16384 calls, 0 reverts).

**v1 simplification (flagged):** `openDispute` demands from exactly ONE seat. A coordinated
multi-seat stall degrades to **serial** dispute rounds (honest seats re-open against the next
staller); this is bounded by escrow and can never become insolvent, but is slower than a
hypothetical multi-seat demand. Documented as acceptable for v1; revisit with a multi-seat demand
in a follow-up (matches the plan's Concerns note).

## EIP-712 dynamic-array vector hashing + parity

The likeliest silent parity bug, per the plan. `ChannelStateN` carries `uint256[] balances` and
`SidePot[] sidePots`. Per EIP-712:
- `uint256[]` is hashed as `keccak256(abi.encodePacked(words))` (Solidity
  `_hashBalances`) — viem does the identical packed encoding.
- `SidePot[]` is hashed as `keccak256(concat(structHash(SidePot[i])))` where
  `structHash(SidePot) = keccak256(SIDEPOT_TYPEHASH, amount, eligibleMask)` (Solidity
  `_hashSidePots`).
- The primary type string appends the referenced `SidePot` type:
  `ChannelStateN(...)SidePot(uint256 amount,uint256 eligibleMask)`.

`test/ZkChannelNSig.test.ts` (hardhat+viem) pins `hashStateN(domain, state)` to the on-chain
`HoldemTableN.stateDigest(state)` for: a fully-populated N=3 state with two side-pots; an empty
edge (N=2, no side-pots); and **40 fuzzed N-seat states** (N=2..9, 0–3 side-pots, random masks /
amounts / nonces). All pass — the vector hashing is byte-for-byte identical TS↔Sol.

## Dispute model

ForceMove-style adjudication generalized to N seats: post your latest N-of-N co-signed state +
the owed-action demand against one named seat; the seat answers (move/newer-state) or the clock
forfeits it. A stale state (nonce ≤ contested) is rejected (`StaleNonce`); a forged signature is
rejected (`BadSig` — `test_settleRejectsForgedSig`, signed by a non-seat key); a demand against a
seat that does not owe is rejected (`NotYourTurn` — `test_cannotDemandNonOwingSeat`). No seat can
steal (forced-fold only forfeits) or freeze (unilateral timeout resolution).

## Tests (all green)

- **vitest** `pnpm --filter @gibs/holdem test` → **37 passed** (Tasks 1–4 combined; 10 are the
  Task-4 `channelN.test.ts`): genesis N=2/N=3 co-sign + conservation; monotone nonce; rejects
  conservation violation **with side-pots + rake**; accepts a conserving side-pots+rake state;
  rejects forged sig; rejects wrong balances-vector length; legality veto; **forced-fold
  transition conserves** (off-chain mirror). `tsc --noEmit` exits 0.
- **foundry (default profile)** `forge test --match-path 'test/foundry/HoldemTableN*'` →
  **16 passed** (13 lifecycle/dispute + 3 invariants):
  - `testFuzz_settleVectorConserves` / `test_createJoinSettle_N{2,3,5,9}` — N-of-N co-signed final
    state settles + pays the conserved vector; zero residue.
  - `testFuzz_settleRejectsNonConserving` / `test_conservationCountsSidePotsAndRake` — conservation
    incl. side-pots + rake.
  - `testFuzz_forcedFold` (512 runs, N∈{2,3,5}, fuzzed forfeit seat + pot) +
    `test_forcedFoldStallerNeverGains` — per-seat timeout → forced-fold; staller keeps balance,
    loses in-pot stake; Σ escrow distributed; staller never gains.
  - `test_respondWithShareReverts` (`ShareDisputeDeferred`), `test_respondWithStateClearsDispute`,
    `test_settleRejectsForgedSig`, `test_cannotDemandNonOwingSeat`.
  - **`HoldemTableNInvariant`** — `invariant_solvent` (balance == in − out),
    `invariant_payoutNeverExceedsEscrow`, `invariant_terminalTablesHoldNothing` over randomized
    create/join/start/settle/dispute/respond/timeout/cancel: **256 runs × 64 depth = 16384 calls,
    0 reverts**. Solvency holds across every transition incl. forced-fold.
- **digest parity (hardhat+viem)** `npx hardhat test test/ZkChannelNSig.test.ts` → **3 passing**
  (TS↔Sol vector-hashing parity, incl. 40 fuzzed N-seat states).

## Foundry config

`HoldemTableN.t.sol`/`HoldemTableNInvariant.t.sol` added to the `[profile.zk]` `skip` list in
`foundry.toml` (so the viaIR-requiring suite never reaches the non-viaIR zk profile, exactly as
`ZkTable.t.sol` is handled). Hardhat per-contract overrides added for `ChannelStateN`,
`IGameRulesN`, `HoldemTableN`, `MockGameRulesN` (shanghai / viaIR / 1000 runs, matching the
ZkTable family). `@gibs/holdem` added to the contracts package `devDependencies` and the
`ts-node.moduleTypes` cjs map in `packages/contracts/tsconfig.json` (the established mechanism for
consuming the ESM workspace packages from hardhat's ts-node — same entry already exists for
`zk-core`/`hilo-war`/`msgboard-games`).

## Deviations from the plan

- **Package name:** the contracts package is `@gibs/random`, not `@gibs/contracts` as the plan's
  commands say — used `pnpm --filter @gibs/random`.
- **Hardhat parity command:** the full `hardhat test` task cannot run end-to-end on this tree due
  to a **pre-existing** `exports is not defined in ES module scope` load error in
  `examples/games/msgboard-games/src/stamper.ts` (reproduced on the clean HEAD before any Task-4
  change, via `MsgBoardSettleE2E.test.ts`/`SessionStateSig.test.ts`). The Task-4 parity gate was
  run in isolation: `npx hardhat test test/ZkChannelNSig.test.ts` (3 passing). Not fixed here —
  it is unrelated to Task 4 and lives in the 2-party/transport code I was told not to touch.
- **No `topUp`:** ZkTable has `topUp`; the plan's Task-4 surface lists `leaveBeforeStart`/`cancel`
  but not `topUp`, and N-seat mid-hand top-up is out of scope for the thin-chain proof. The
  off-chain `ChannelN.applyTopUp` mirror is present for symmetry but no on-chain `topUp` was added
  (can be added when the betting layer needs it).

## Concerns / follow-ups

- **Multi-seat simultaneous stall** degrades to serial dispute rounds (flagged above; bounded by
  escrow, never insolvent). A `demandSeats` bitmask + multi-forfeit `resolveTimeout` is the
  follow-up if coordinated stalls become adversarially load-bearing.
- **`clockBlocks` sizing (composition concern, Task 8):** the chess clock must be a comfortable
  multiple of the measured per-post PoW wall-clock so an honest seat grinding a legitimate reveal
  isn't force-folded. Enforced only by the `MIN_CLOCK_BLOCKS` floor here; the real sizing is a
  Task-8 e2e concern.
- **Rake bound:** `_checkRake` bounds `rakeAccrued <= rakeCap` AND
  `rakeAccrued*10000 <= rakeBps*(Σ balances + rake)` (reconstructing the gross pot from the
  settled balances). This is a conservative settle-time guard; the precise rake-before-split
  ordering is defined/tested in Tasks 5/7 when real betting drives the pot.
- **Pre-existing zk-profile breakage:** `FOUNDRY_PROFILE=zk forge test` fails to compile
  `contracts/games/HouseBankroll.sol` (stack-too-deep without viaIR) — reproduced on the clean
  tree, unrelated to Task 4. The intended zk-profile invocation only ever targets
  `ShuffleVerifier52*`; Holdem is correctly skipped there.
