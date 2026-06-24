# Task 2 Report — `GamePayouts.sol` dice branch + parity test

**Plan:** `docs/superpowers/plans/2026-06-23-recompute-settle.md` (Task 2)
**Branch:** `feat/recompute-settle`
**Status:** DONE

## Scope delivered (Task 2 only)
Purely additive. Created the `GamePayouts` library with the **dice** branch (gameId 1) only, plus the
foundry dice parity test (win + loss + structural `r`-at-nonce-1) and the vector generator script.
Did NOT touch `settleWithSeeds` (Task 4), the limbo branch (Task 3), the co-sign path, or limbo math.

## Files
- **Created** `examples/games/msgboard-settle/scripts/gen-recompute-vectors.ts` — exact script from the
  plan (imports REAL `@gibs/msgboard-games` `dice`/`limbo`/`roundRandom`; prints fixed-seed vectors).
- **Created** `packages/contracts/contracts/games/GamePayouts.sol` — `library GamePayouts` with
  `settle(uint8 gameId, uint256 r, bytes memory params, uint256 escrowPlayer, uint256 escrowHouse)`.
  Dice branch ports the TS math in the EXACT left-to-right order
  `(DICE_ROLL_SPACE - EDGE_BPS) * DICE_ROLL_SPACE / targetX100 / HUNDREDTHS` (two sequential floors,
  NOT pre-simplified to `99_000_000/target`). Conservation + `require(payout <= pot)` ceiling assert.
  Non-dice gameIds `revert UnknownGame()` (limbo arm added in Task 3).
- **Created** `packages/contracts/test/foundry/GamePayouts.t.sol` — dice win/loss/r parity tests with
  hardcoded vectors from the script.

## Vectors generated (from the REAL TS game, nonce 1, target 5000)
Command: `cd examples/games/msgboard-settle && ../house-service/node_modules/.bin/tsx scripts/gen-recompute-vectors.ts`

```
dice-win : serverSeed=0x..01 clientSeed=0x..02 nonce=1 target=5000 win=true  payout=396
  r = 20349940423862035287868699599764962454537984981628200184279725786303353984557
dice-loss: serverSeed=0x..03 clientSeed=0x..04 nonce=1 target=5000 win=false payout=0
  r = 68053564258556317150349243837902514818945326343711789649774590383616699827597
limbo-win : serverSeed=0x..05 clientSeed=0x..06 nonce=1 target=200 win=FALSE payout=0   (label vs outcome swapped)
  r = 84157554483925481790078325868819927141269412419533080553588607633004150223059
limbo-loss: serverSeed=0x..07 clientSeed=0x..08 nonce=1 target=200 win=TRUE  payout=400  (label vs outcome swapped)
  r = 108174256589026683124305912205446370618204099420522125478345491452742619876089
```

The dice payout of **396** is consistent with the math: `multX100 = (10000-100)*10000/5000/100 = 198`,
`payout = 200*198/100 = 396`. The parity vector pins the operation order regardless of this incidental
algebraic agreement.

### Seed tuning
- **Dice (this task): NO tuning needed.** The plan's default seeds `s(1)/s(2)` (win) and `s(3)/s(4)`
  (loss) already produce one win + one loss at nonce 1 with target 5000.
- **Limbo (Task 3 note only, not implemented here):** the plan's labels are reversed for limbo —
  seeds `s(5)/s(6)` ("limbo-win") actually LOSE and `s(7)/s(8)` ("limbo-loss") actually WIN at target
  200. Task 3 should either swap the seed pairs or the labels so the foundry constants match the
  intended outcome. Flagged for Task 3; out of scope for Task 2.

## Deviations from the plan
1. **tsx invocation.** The plan's command `pnpm --filter @gibs/msgboard-settle exec tsx scripts/...`
   fails because `tsx` is NOT a dependency of `@gibs/msgboard-settle` (`Command "tsx" not found`). I ran
   the IDENTICAL script via a sibling package's tsx binary:
   `cd examples/games/msgboard-settle && ../house-service/node_modules/.bin/tsx scripts/gen-recompute-vectors.ts`.
   Same module resolution (workspace `@gibs/msgboard-games`), same output. I did NOT add tsx to the
   settle package to avoid an out-of-scope `package.json`/lockfile change. If the canonical pnpm
   command is required, add `"tsx": "^4.19.0"` to `examples/games/msgboard-settle` devDependencies.
2. **Natspec `@gibs` clash.** solc 0.8.25 parses `@gibs/...` in a `///` doc comment as an invalid
   documentation tag (`Documentation tag @gibs/msgboard-games not valid`). Changed the top contract
   comment from `@gibs/msgboard-games` to `msgboard-games`. No semantic change.

## TDD evidence (exact commands + output)

RED — failing test before implementation (`GamePayouts.sol` absent):
```
cd packages/contracts && forge test --match-path 'test/foundry/GamePayouts.t.sol' -vvv
=> Error (6275): Source "contracts/games/GamePayouts.sol" not found ... Compilation failed
```

GREEN — after implementing the dice branch:
```
cd packages/contracts && forge test --match-path 'test/foundry/GamePayouts.t.sol' -vvv
=>
[PASS] test_dice_loss_matchesTs() (gas: 817)
[PASS] test_dice_win_matchesTs() (gas: 908)
[PASS] test_r_matchesTs() (gas: 625)
Suite result: ok. 3 passed; 0 failed; 0 skipped
```

`forge build` for the whole contracts project: compiles successfully (only pre-existing
`unsafe-typecast` lint warnings in unrelated files; no errors).

## Concerns / handoffs
- **Limbo label/outcome mismatch** (above) is the one thing Task 3 must reconcile before hardcoding
  limbo constants.
- The `tsx` resolution gap will also bite Task 3 / Task 5 if they use the plan's literal pnpm command;
  consider adding tsx to the settle package devDeps in a later task.
- The full `forge test` suite was NOT run for this task (the plan reserves that for Task 4 Step 4.3);
  scoped `--match-path` run only, per Task 2's instructions.
