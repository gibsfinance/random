# Task 7 — Showdown settlement + rake — report

Branch: `feat/holdem-nparty` (main clone `/Users/michaelmclaughlin/Documents/gibs-finance/random`).
Scope: Task 7 only (showdown distribution + rake + channel-settle bridge + TS↔Sol parity). No other
task touched; zk-core / 2-party games untouched.

## What was built

Replaced the multiway-showdown STUB (`stubWinner=-1`, pots left unswept) with real distribution.

### Showdown distribution (the `SHOWDOWN` move)

New `Move`: `{ kind:'SHOWDOWN'; holes:number[][]; board:number[] }` — the session supplies every
seat's 2 unmasked hole indices and the 5 community indices. Accepted only from `phase===SHOWDOWN`.

Resolution order (`rules.ts` `resolveShowdown` + pure `showdownPayouts`, mirrored byte-for-byte by
`HoldemRules.sol` `_showdown`/`_splitInto`):

1. **Pots to award**, in order: main pot first, then each side pot (lowest layer to highest). Each
   pot's eligible set = its `eligible` list (main = all seats) **intersected with non-folded seats**
   (a folded seat that contributed never wins — its chips stay for the live contestants).
2. **Per pot**: evaluate each eligible seat's best 5-of-7 via Task-6 `evaluate7(hole∪board)`
   (memoized per seat), find the max score, the winners = all eligible seats tying that max.
3. **Split** the pot's distributable amount equally among the winners using the Task-5
   `splitPot(amount, winners, button, nSeats)` — the **odd-chip rule** (remainder chips to the
   earliest winners scanning clockwise from `button+1`) is reused verbatim, not reimplemented.

### Rake construction + cap + conservation

`rake = min(rakeCap, rakeBps · rakeBase / 10000)` where `rakeBase = Σ amounts of CONTESTED pots`
(pots with **≥2** eligible seats). A pot with a single eligible seat is an **uncalled return** and is
**never raked** (plan concern: "no rake on uncalled returns") — it is paid back in full.

Rake is taken **before** the split: `rakeRemaining` starts at `rake`, and for each contested pot in
order (main first) `take = min(rakeRemaining, potAmount)` is deducted from that pot before it is
split. Cap bounds the total.

**Conservation (exact, by construction):** `Σ take == rake` and `Σ winnings == Σ distributable`, so
`Σ winnings + rake == Σ pot amounts == totalPot`. Final per-seat balances = `stacks` (uncommitted
behind, unchanged) + winnings; the state then sets `pot=0`, `sidePots=[]`, `rakeAccrued=rake`,
`phase=SETTLED`. Hence `Σ stacks_final + rakeAccrued == Σ stacks_pre + totalPot == Σ escrow`.

`conserved(state)` was extended to include `rakeAccrued` (so the post-SETTLED invariant holds).

**Uncontested (fold-to-win) path:** `finishHand` already sweeps the whole pot into the lone live
seat's stack during betting (`stubWinner≥0`). The `SHOWDOWN` move on such a state applies rake on the
collected pot (`Σ totalContributed`, uncalled already returned), deducts it from the swept stack, and
reaches SETTLED — no hand evaluation.

### eligible → mask bridge + channel settle state

- `encoding.ts` `eligibleToMask` (existing) converts `SidePot.eligible:number[]` → `eligibleMask:bigint`.
- New `toChannelSettleState(s, {tableId, nonce, deckCommitment})` bridges a SETTLED `HoldemState` to
  the channel's `ChannelStateN`: `stacks → balances`, `pot=0`, `sidePots=[]` (empty after showdown,
  any residual mapped via `eligibleToMask`), `rakeAccrued` carried, `gameStateHash = hashGameState(s)`.
- `GAME_STATE_TUPLE` gained a trailing `uint256 rakeAccrued` field; the Solidity `Holdem` struct
  mirrors it. `MOVE_KIND.SHOWDOWN=7`; the move encodes `(uint8[2][] holes, uint8[5] board)`.

### TS↔Solidity mirror

- `HoldemRules` now `is HoldemHandEval`; `HoldemHandEval` got an internal `_evaluate7(uint8[7] memory)`
  (the external calldata `evaluate7` now delegates to it — HandEval parity re-verified, unchanged).
- `_showdown` mirrors `resolveShowdown`/`showdownPayouts` exactly: same pot order, same
  contested-≥2 rake base, same main-first rake deduction, same `_splitInto` odd-chip clockwise rule.

## Tests (TDD: RED shown, then GREEN)

`examples/games/holdem/test/showdown.test.ts` (9 tests) — RED first (all 8 original failed with "no
betting in phase 10" / SHOWDOWN unrecognized), GREEN after implementation:
- single-pot winner gets `pot − rake`, rake accrued, conservation
- rake=0 (whole pot), rake at cap (bounded)
- 2-way tie even split, 3-way tie with odd chip to earliest seat left of button
- multi side-pot: short all-in wins only the main pot
- fold-to-win (uncontested, no evaluation)
- SHOWDOWN rejected outside SHOWDOWN phase
- no rake on an uncalled-return side pot (single eligible seat)
- every case asserts `Σ balances + rake == Σ pot` exactly

`packages/contracts/test/HoldemParity.test.ts` — extended the 180 seeded walks (N∈{2,3,6}) to run the
`SHOWDOWN` move through to SETTLED (deals distinct holes+board), asserting TS and Solidity agree on the
final encoded-state keccak (= the balances vector + rakeAccrued). ~half the walks carry rakeBps=500,
rakeCap=3 so the cap path is hit. New coverage asserts (>0): `settledStates`, `contestedShowdowns`
(multiway, evaluator ran), `rakedShowdowns`. Result: **2 passing** (parity + whoseTurn), 0 failing.

`packages/contracts/test/foundry/HoldemTableNShowdown.t.sol` (3 tests) — channel-settle acceptance:
drives the **real** `HoldemRules` SHOWDOWN, decodes the resulting `Holdem`, bridges `stacks→balances`
+ `rakeAccrued` into a `ChannelStateN`, co-signs N-of-N and submits to `HoldemTableN.settle`. Asserts
winner paid, treasury got the rake, exactly Σ escrow left the contract, **zero residue**. Covers
rake=0, rake at bps (250 = MAX_RAKE_BPS), rake capped to 1 wei. All pass; full `HoldemTableN*` foundry
suite = 19 passing (incl. solvency invariant).

`HandEvalParity.test.ts` re-run after the `_evaluate7` refactor: **2 passing** (≥2000-case score +
ordering parity intact).

### Commands
```
pnpm --filter @gibs/holdem test            # 111 passing (9 showdown)
pnpm --filter @gibs/holdem typecheck       # clean
(cd packages/contracts && forge test --match-path 'test/foundry/HoldemTableN*')   # 19 passing
(cd packages/contracts && pnpm hardhat test test/HoldemParity.test.ts --grep "Holdem TS<->Solidity parity")  # 2 passing
(cd packages/contracts && pnpm hardhat test test/HandEvalParity.test.ts --grep "HandEval")  # 2 passing
```

## Deviations / notes

- The parity hardhat run is invoked with an explicit `test/HoldemParity.test.ts` path (not bare
  `--grep`) because Mocha eagerly loads ALL test files and `test/MsgBoardSettleE2E.test.ts` fails to
  load (pre-existing ESM/CJS issue in `msgboard-games/src/stamper.ts`, unrelated to this task). Passing
  the file path scopes the load. Same for HandEvalParity.
- `MAX_RAKE_BPS = 250` (2.5%) is enforced by `HoldemTableN.create`, so the on-chain settle tests use
  bps ≤ 250. The pure `rules.ts`/`HoldemRules.applyMove` distribution is not bps-capped (it just
  applies the configured bps), so the TS-only distribution tests freely use 5%/10% to exercise the
  arithmetic — those states are not settled on a real table.
- `_popcount` in Solidity is a simple bit-loop (n ≤ 9 seats; cheap). Eligible masks are recomputed
  from the side-pot `eligibleMask` intersected with `!folded`.

## Concerns

- **Rake-on-uncalled definition.** I rake only pots with ≥2 eligible seats; a single-eligible side pot
  is treated as an uncalled return (no rake). This matches the plan's stated concern. If the product
  later wants rake on *every* collected chip, both the TS `rakeBase` and the Solidity mirror must
  change together (the parity gate will catch a one-sided change).
- **Uncontested rake base = Σ totalContributed.** For a fold-to-win hand the rake is on the whole
  collected pot. Standard live poker often doesn't rake an unraised/uncontested pot; if that policy is
  wanted, gate the uncontested rake on "saw a flop" or "pot was raised" — a one-line change mirrored
  on both sides.
- Showdown input validity (cards actually distinct / actually the revealed deck cards) is trusted: the
  channel only ever feeds a co-signed state's revealed indices, exactly as the betting half trusts
  structural validity (the Task-4 trust boundary). The rules enforce only *transition* legality
  (2 holes/seat, 5-card board, correct phase).
