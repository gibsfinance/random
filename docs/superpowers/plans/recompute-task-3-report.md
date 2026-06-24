# Task 3 Report — `GamePayouts.sol` limbo branch + parity test

**Plan:** `docs/superpowers/plans/2026-06-23-recompute-settle.md` (Task 3)
**Branch:** `feat/recompute-settle`
**Status:** DONE
**Date:** 2026-06-24

## Summary

Added the **limbo** (`gameId == 2`) branch to `GamePayouts.settle(...)` reproducing the exact TS
math from `examples/games/msgboard-games/src/games/limbo.ts`, plus foundry parity tests (win + loss +
an r-parity pin) cross-checked against vectors generated from the REAL `@gibs/msgboard-games`. Also
handled the two Task-2-review flags: fixed the swapped limbo seed labels in the vector script and the
broken `tsx` invocation comment. Additive only — the dice branch, `settleWithSeeds` (Task 4), and the
co-sign path are untouched.

## Task-2-review flags handled

### 1. Swapped limbo seed labels (CONFIRMED + FIXED)

The original script labeled `s(5)/s(6)` as `limbo-win` and `s(7)/s(8)` as `limbo-loss`. Running it
showed the labels were backwards at **target 200, nonce 1**:

| seeds | original label | REAL outcome @ nonce 1 |
| --- | --- | --- |
| `s(5)/s(6)` | limbo-win | **LOSS** (win:false, payout 0) |
| `s(7)/s(8)` | limbo-loss | **WIN** (win:true, payout 400) |

Fix: swapped the seed pairs in `gen-recompute-vectors.ts` so each label matches reality —
`limbo-win` now uses `s(7)/s(8)` (the genuine winner) and `limbo-loss` uses `s(5)/s(6)` (the genuine
loser). Verified by re-running the script (output below). The win test uses the genuinely-winning
triple; the loss test uses the genuinely-losing triple.

### 2. `tsx` invocation (FIXED — cosmetic comment)

`pnpm --filter @gibs/msgboard-settle exec tsx ...` fails: `tsx` is not a dependency of
`@gibs/msgboard-settle`. The script's header comment was corrected to the working sibling-binary
invocation used in Task 2:

```
cd examples/games/msgboard-settle && ../house-service/node_modules/.bin/tsx scripts/gen-recompute-vectors.ts
```

## Corrected limbo vectors (target 200 / nonce 1, stake 200)

| label | serverSeed | clientSeed | win | payout | r |
| --- | --- | --- | --- | --- | --- |
| limbo-win  | `0x..07` | `0x..08` | true  | 400 | `108174256589026683124305912205446370618204099420522125478345491452742619876089` |
| limbo-loss | `0x..05` | `0x..06` | false | 0   | `84157554483925481790078325868819927141269412419533080553588607633004150223059` |

These exact `r`/payout values are hardcoded into `GamePayouts.t.sol`.

## Changes

- **`examples/games/msgboard-settle/scripts/gen-recompute-vectors.ts`** — swapped limbo seed pairs so
  `limbo-win` = `s(7)/s(8)` and `limbo-loss` = `s(5)/s(6)`; added an explanatory NOTE; fixed the
  header command comment to the working tsx invocation.
- **`packages/contracts/contracts/games/GamePayouts.sol`** — added limbo constants
  (`LIMBO_U_SPACE=1_000_000`, `LIMBO_ONE_MINUS_EDGE_X100=99`, `LIMBO_MIN_TARGET=100`,
  `LIMBO_MAX_TARGET=99_000_000`), added the `gameId == 2` dispatch arm, and added the `_limbo(...)`
  function: `u = r % 1_000_000`; `resultX100 = (99 * 1_000_000)/(1_000_000 - u)`;
  `win = resultX100 >= targetX100`; `payout = win ? stake*targetX100/100 : 0`. Same conservation +
  `payout <= pot` ceiling assert as dice. `targetX100` decoded via `abi.decode(params,(uint256))`.
- **`packages/contracts/test/foundry/GamePayouts.t.sol`** — added `LIMBO_ESCROW_HOUSE=200`,
  `R_LIMBO_WIN`, `R_LIMBO_LOSS`, `PAYOUT_LIMBO_WIN=400`; added `test_limbo_win_matchesTs`,
  `test_limbo_loss_matchesTs`, and `test_r_limbo_matchesTs`.

## Exact commands + output

### Vector generation (after label fix)
```
cd examples/games/msgboard-settle && ../house-service/node_modules/.bin/tsx scripts/gen-recompute-vectors.ts
```
```
{"label":"limbo-win","gameId":2,"serverSeed":"0x..07","clientSeed":"0x..08","nonce":"1","targetX100":"200","r":"108174256589026683124305912205446370618204099420522125478345491452742619876089","win":true,"payout":"400"}
{"label":"limbo-loss","gameId":2,"serverSeed":"0x..05","clientSeed":"0x..06","nonce":"1","targetX100":"200","r":"84157554483925481790078325868819927141269412419533080553588607633004150223059","win":false,"payout":"0"}
```
(dice-win/dice-loss lines unchanged from Task 2.)

### RED (limbo tests before impl)
```
cd packages/contracts && forge test --match-path 'test/foundry/GamePayouts.t.sol' -vv
```
```
[PASS] test_dice_loss_matchesTs
[PASS] test_dice_win_matchesTs
[FAIL: UnknownGame()] test_limbo_loss_matchesTs
[FAIL: UnknownGame()] test_limbo_win_matchesTs
[PASS] test_r_limbo_matchesTs
[PASS] test_r_matchesTs
Suite result: FAILED. 4 passed; 2 failed; 0 skipped
```

### GREEN (after limbo branch impl)
```
[PASS] test_dice_loss_matchesTs
[PASS] test_dice_win_matchesTs
[PASS] test_limbo_loss_matchesTs
[PASS] test_limbo_win_matchesTs
[PASS] test_r_limbo_matchesTs
[PASS] test_r_matchesTs
Suite result: ok. 6 passed; 0 failed; 0 skipped
```

### Full contract suite (regression)
```
cd packages/contracts && forge test
```
```
Ran 12 test suites: 56 tests passed, 0 failed, 0 skipped (56 total tests)
```

## Deviations

- None from the plan's Task 3 spec. The plan's example test omitted an r-parity test for limbo;
  I added `test_r_limbo_matchesTs` (mirroring the dice `test_r_matchesTs`) to pin the limbo-win
  triple's `r`, since the win/loss vectors depend on it being correct.

## Concerns

- The `limbo-loss` vector (s(5)/s(6)) has `u = r % 1_000_000` landing far from the `u = 999_999`
  boundary, so it is a comfortable loss (not a near-miss). The win vector pays exactly the escrow
  ceiling (pot 400 == payout 400), which is the right boundary case to pin (conservation leaves the
  house 0). No edge-of-range target tests (target 100 / 99_000_000) are included — Task 3 scope is
  win+loss at target 200 only; range-boundary tests could be a future hardening add.
- Did NOT deploy and did NOT touch `settleWithSeeds` / Task 4 — as instructed.
