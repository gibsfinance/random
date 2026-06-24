# Task 4 Report — `settleWithSeeds` (permissionless on-chain recompute settle)

**Plan:** `docs/superpowers/plans/2026-06-23-recompute-settle.md` (Task 4)
**Branch:** `feat/recompute-settle`
**Date:** 2026-06-24
**Scope:** Task 4 ONLY (the security-critical core settlement function). No deploy. No other tasks.

## Status: DONE

## What was done (TDD: RED → GREEN)

### 1. Failing tests first (RED)
Created `packages/contracts/test/foundry/SettleWithSeeds.t.sol` — the full Task 4 matrix.
- Setup mirrors `HouseChannel.t.sol` (Chips mint/approve, `fundHouse(10_000)`, `setHouseKey`,
  house-signed `OpenTerms` via `vm.sign(pkHouse, ch.openTermsDigest(t))`).
- Real `open()` of a new-shape `OpenTerms` (carries `clientSeedCommit` + `paramsHash`):
  `rngCommit = keccak256(abi.encodePacked(serverSeed))`,
  `clientSeedCommit = keccak256(abi.encodePacked(clientSeed))`,
  `paramsHash = keccak256(abi.encode(uint256(5000)))`, `gameId = 1`.
- Seed triples reuse the **Task 2 dice vectors** so the on-chain recompute is anchored to a KNOWN
  nonce-1 outcome:
  - dice-WIN  = `serverSeed=bytes32(1)`, `clientSeed=bytes32(2)` → win  @ nonce 1, payout **396**
  - dice-LOSS = `serverSeed=bytes32(3)`, `clientSeed=bytes32(4)` → loss @ nonce 1, payout **0**
- Escrows: `escrowPlayer=200`, `escrowHouse=196` (dice@5000 mult=198 → max win profit 196 → pot 396
  == win payout; escrow ceiling exactly met).

First compile (RED) failed exactly as expected — `settleWithSeeds`, `BadReveal`, `BadParams` undefined:
```
Error (9582): Member "settleWithSeeds" not found ... in contract HouseChannel.
Error: Compilation failed
```
(A spurious NatSpec parse error from an `@gibs/...` token in a `///` doc-comment was fixed by
demoting that comment block to `//`, leaving the clean RED above.)

### 2. Implementation (GREEN) — `packages/contracts/contracts/games/HouseChannel.sol`
Additive only — the co-sign `settle(SessionState,sigP,sigH)` and all dispute paths are untouched.
- `import {GamePayouts} from "./GamePayouts.sol";`
- Two new errors: `error BadReveal();` `error BadParams();`
- New external function `settleWithSeeds(bytes32 tableId, bytes32 serverSeed, bytes32 clientSeed,
  bytes calldata params)` — **no `nonce` parameter** (exact signature per the plan):
  ```solidity
  Table storage t = tables[tableId];
  if (t.status != Status.Live) revert BadStatus();
  if (keccak256(abi.encodePacked(serverSeed)) != t.rngCommit) revert BadReveal();
  if (keccak256(abi.encodePacked(clientSeed)) != t.clientSeedCommit) revert BadReveal();
  if (keccak256(params) != t.paramsHash) revert BadParams();
  uint256 r = uint256(keccak256(abi.encode(serverSeed, clientSeed, uint64(1)))); // nonce HARDCODED to 1
  (uint256 balancePlayer, uint256 balanceHouse) =
      GamePayouts.settle(t.gameId, r, params, t.escrowPlayer, t.escrowHouse);
  _payout(t, tableId, balancePlayer, balanceHouse);
  ```

### SECURITY — nonce hardcoded to 1
`nonce` is folded into `r = keccak256(serverSeed, clientSeed, uint64(1))` and is **NOT** a caller
input. A free nonce would let the settler grind the outcome (a player-caller picks a winning value; a
house-caller picks a losing one) — the commit-bound seeds do not constrain the nonce, so `r` would be
attacker-selectable. The legitimate single-draw round is always nonce 1 (matches the co-sign flow), so
the function hardcodes `uint64(1)`. There is consequently **no "wrong nonce" test case** (the parameter
does not exist); `test_outcomeFixedByNonceOne` instead pins that the outcome is fixed by the committed
seeds + params alone.

## Test commands + output

### `settleWithSeeds` suite (the Task 4 matrix)
```
cd packages/contracts && forge test --match-path 'test/foundry/SettleWithSeeds.t.sol' -vvv
```
```
Ran 7 tests for test/foundry/SettleWithSeeds.t.sol:SettleWithSeedsTest
[PASS] test_badClientSeedReverts() (gas: 232781)
[PASS] test_badParamsReverts() (gas: 233220)
[PASS] test_badServerSeedReverts() (gas: 232726)
[PASS] test_doubleSettleReverts() (gas: 198721)
[PASS] test_honestLossPaysHouse() (gas: 202555)
[PASS] test_honestWinPaysPlayer() (gas: 206229)
[PASS] test_outcomeFixedByNonceOne() (gas: 204635)
Suite result: ok. 7 passed; 0 failed; 0 skipped
```

**Revert matrix (4 revert cases, all asserting the exact selector):**
| Test | Trigger | Expected revert |
| --- | --- | --- |
| `test_badServerSeedReverts` | wrong serverSeed | `HouseChannel.BadReveal` |
| `test_badClientSeedReverts` | wrong clientSeed (the grind attempt) | `HouseChannel.BadReveal` |
| `test_badParamsReverts` | wrong params (`abi.encode(1234)` vs committed 5000) | `HouseChannel.BadParams` |
| `test_doubleSettleReverts` | settle twice (status no longer Live) | `HouseChannel.BadStatus` |

**Honest-outcome cases:**
| Test | Assertion |
| --- | --- |
| `test_honestWinPaysPlayer` | player balance += 396; housePool += (396−396)=0; conservation `396 + 0 == 200 + 196` |
| `test_honestLossPaysHouse` | player balance unchanged; housePool += full pot (200+196=396) |
| `test_outcomeFixedByNonceOne` | dice-win triple @ nonce 1 deterministically pays player += 396 (no nonce input to vary) |

### Full contract suite (regression)
```
cd packages/contracts && forge test
```
```
Ran 13 test suites in 3.13s: 63 tests passed, 0 failed, 0 skipped (63 total tests)
```
Includes the unchanged co-sign / dispute paths (`HouseChannel.t.sol` 16/16 pass, e.g.
`test_settlePaysFromEscrow`, `test_disputeTimeoutPaysPostedState`, `test_respondWithNewerStateOverrides`)
plus `GamePayouts.t.sol` (7/7), `SettleWithSeeds.t.sol` (7/7), CoinFlip, Raffle, HiLoWar, ZkTable, etc.
`ShuffleVerifier52` is the zk-profile suite and is not part of the default run.

## Deviations from the plan
- **NatSpec comment demotion (cosmetic):** the file-level test comment that referenced the
  `@gibs/msgboard-games` package was written as a `///` doc comment in the plan's scaffold; solc 0.8.25
  rejects an unknown `@gibs` NatSpec tag on a contract. Demoted that block to a plain `//` comment. No
  behavioural change; the test logic is byte-for-byte the plan's.
- **`test_honestWinPaysPlayer` tightened:** the plan's scaffold used `assertGt(balance, before)` and a
  prose note about conservation. I made it `assertEq(balance, before + 396)` and added an explicit
  `housePool` + conservation assertion (`396 + toHouse == escrowPlayer + escrowHouse`) so the win path
  proves exact balances + conservation, not just "rose". Strictly stronger than the plan; same intent.
- Everything else matches the plan verbatim (signature, body, error names, seed triples, escrow sizing).

## Concerns
- **Escrow ceiling is exactly met** for dice@5000 (pot 396 == max payout 396). `GamePayouts.settle`
  asserts `payout <= pot`; this holds with zero slack here, which is intended (the house signs
  `escrowFor`-derived escrows off-chain). Not a Task 4 bug, but worth noting: the on-chain path trusts
  the house-signed `escrowHouse` to cover the max payout — if the house ever signed terms with an
  under-sized `escrowHouse`, a winning recompute would revert in `GamePayouts` (`"payout exceeds pot"`)
  and the table would be stuck Live until a dispute/timeout. The off-chain signer (Task 1 `openReview`)
  is responsible for sizing `escrowHouse` from `maxMultiplierX100`; that is enforced off-chain, not here.
- **Anyone can settle.** By design (permissionless) — there is no caller check. The commit checks +
  hardcoded nonce make the outcome deterministic regardless of who calls, so this is safe.
- No live/E2E performed (Task 5 is explicitly out of scope and deploy-gated).

## Files
- Modified: `packages/contracts/contracts/games/HouseChannel.sol` (import, 2 errors, `settleWithSeeds`).
- Created:  `packages/contracts/test/foundry/SettleWithSeeds.t.sol` (7 tests).
