# Track 1 — Trust-Minimized Settle via On-Chain Recompute (Implementation Plan)

**Status:** ready to execute (TDD)
**Date:** 2026-06-23
**Source of truth:** `docs/superpowers/specs/2026-06-23-recompute-settle-design.md`
**Repo:** `/Users/michaelmclaughlin/Documents/gibs-finance/random`

## Goal

Add a **permissionless** settlement path to `HouseChannel`: anyone submits the two revealed
seeds (server + client); the contract verifies they match the commits fixed in the house-signed
`OpenTerms` at open, recomputes the round randomness (single-draw nonce **fixed at 1** — never a
caller input) and the game payout **itself** in Solidity (`GamePayouts.sol`), and pays out the
conserved escrow — **with no signature from either party**. The winner (the party motivated to
settle) calls it; the house cannot withhold a payout. M1 covers **dice + limbo only**.

## Architecture (2-3 sentences)

`OpenTerms` gains two house-signed bindings — `clientSeedCommit` and `paramsHash` — and the `Table`
struct now persists `rngCommit`, `clientSeedCommit`, and `paramsHash` at `open()` so the new path can
authorize off the stored commits. A new pure library `GamePayouts.sol` reproduces the TS reference
game math exactly (dispatch on `gameId`), and `settleWithSeeds(...)` checks the three commits, derives
`r = uint256(keccak256(abi.encode(serverSeed, clientSeed, uint64(1))))` (nonce hardcoded to 1 to close
a nonce-grinding vector — see Security note), calls `GamePayouts.settle`, and routes the result through
the existing `_payout` helper. The co-sign `settle(state, sigP, sigH)` path is untouched — the new path
is purely additive.

## Tech Stack

- **Contracts:** Solidity `^0.8.24` (solc `0.8.25`, `via_ir`, `evm_version = shanghai`), Solady utils.
- **Contract tests:** Foundry (`forge test`), run from `packages/contracts` (default profile).
- **Off-chain mirror + vectors:** TypeScript / viem, package `@gibs/msgboard-games` (ESM, `type: module`)
  and `@gibs/msgboard-settle`; tested with `vitest run`; scripts run with `tsx`.
- **Live E2E:** `examples/games/house-service` (`tsx scripts/…`) against PulseChain Testnet v4 (chain 943).

## Global Constraints (binding values — copy verbatim into code)

**Constants (from `examples/games/msgboard-games/src/game.ts`):**
- `EDGE_BPS = 100` (1% house edge, basis points)
- `HUNDREDTHS = 100` (fixed-point scale: `1.00x` == `100`)

**Dice math (port of `src/games/dice.ts`, `gameId = 1`):**
- `ROLL_SPACE = 10_000`; valid `targetX100 ∈ [1, 9899]`
- `roll = r % 10_000`
- `win = roll < targetX100`
- `multX100 = (ROLL_SPACE - EDGE_BPS) * ROLL_SPACE / targetX100 / HUNDREDTHS = 9_900 * 10_000 / targetX100 / 100 = 99_000_000 / targetX100`
- `payout = win ? stake * multX100 / 100 : 0`  (stake = `escrowPlayer`)

  NOTE: the canonical TS form is `(10000-100)*10000 / target / 100`. With integer truncation that is
  **not** always equal to `99_000_000 / target` (the TS applies two sequential floors: first
  `99_000_000/target`, then `/100`… actually `9900*10000=99_000_000` then `/target` then `/100`).
  The plan ports the **exact TS operation order** — see Task 2 — and pins it with a parity vector so
  any divergence is caught, rather than trusting the algebraic simplification.

**Limbo math (port of `src/games/limbo.ts`, `gameId = 2`):**
- `U_SPACE = 1_000_000`; `ONE_MINUS_EDGE_X100 = (10_000 - EDGE_BPS) / HUNDREDTHS = 99`
- valid `targetX100 ∈ [100, 99_000_000]` (i.e. `ONE_MINUS_EDGE_X100 * U_SPACE`)
- `u = r % 1_000_000`
- `resultX100 = (ONE_MINUS_EDGE_X100 * U_SPACE) / (U_SPACE - u) = (99 * 1_000_000) / (1_000_000 - u)`
- `win = resultX100 >= targetX100`
- `payout = win ? stake * targetX100 / 100 : 0`

**Conservation (both games):** `balancePlayer = payout`; `balanceHouse = escrowPlayer + escrowHouse - payout`.
ASSERT `payout <= escrowPlayer + escrowHouse` (escrow ceiling guarantees it; assert for safety).

**Round randomness (port of `src/rng.ts` `roundRandom`):**
`r = uint256(keccak256(abi.encode(serverSeed /*bytes32*/, clientSeed /*bytes32*/, nonce /*uint64*/)))`.
Solidity `abi.encode(bytes32,bytes32,uint64)` == viem `encodeAbiParameters([bytes32,bytes32,uint64])`
(structural parity; pin with a vector anyway).

**SECURITY — `nonce` is FIXED at `1` inside `settleWithSeeds`; it is NOT a caller parameter.** `nonce`
is folded into `r`. If it were a free input, a settler could **grind** it to choose the outcome (a
player-caller picks a `nonce` that wins; a house-caller picks one where the player loses). The
commit-bound seeds do NOT constrain `nonce`, so a loose `nonce` makes `r` attacker-selectable — a
critical outcome-manipulation vector. The legitimate single-draw round is always `nonce 1` (matches the
co-sign flow, where the one round is nonce 1), so the function hardcodes `uint64(1)`. A future
multi-round mechanism MUST bind a per-round `nonce`/`roundId` in the house-signed `OpenTerms` at open —
never accept it loose at settle.

**Commit preimages (port of `src/rng.ts` `commitSeed`):**
`commitSeed(seed) = keccak256(seed)` where `seed` is a `bytes32`. On-chain:
`keccak256(abi.encodePacked(serverSeed))` and `keccak256(abi.encodePacked(clientSeed))` — for a
`bytes32`, `abi.encodePacked` is the bare 32 bytes, identical to viem `keccak256(bytes32)`.

**Params encoding (dice + limbo):** params is a single `uint256 targetX100`.
- On-chain decode: `uint256 targetX100 = abi.decode(params, (uint256))`.
- `paramsHash = keccak256(abi.encode(uint256(targetX100)))` — i.e. `keccak256(params)`.
- Off-chain (viem): `params = encodeAbiParameters([{ type: 'uint256' }], [targetX100])`;
  `paramsHash = keccak256(params)`. Both sides MUST use `abi.encode(uint256)` (32-byte padded), NOT
  `encodePacked`, so the hashes match.

**EIP-712 `OpenTerms` typehash (NEW — appends two fields at the end, preserving existing order):**
```
OpenTerms(bytes32 tableId,address player,address playerKey,uint256 escrowPlayer,uint256 escrowHouse,uint8 gameId,bytes32 rngCommit,uint64 clockBlocks,uint64 expiry,bytes32 clientSeedCommit,bytes32 paramsHash)
```

**Invariants that DO NOT change:**
- The co-sign `settle(SessionState, sigPlayer, sigHouse)` path and all dispute paths stay **unchanged**.
- `escrowPlayer` already equals the player's stake (`escrowFor` in `src/escrow.ts`); do not re-derive it.
- `_payout(t, tableId, toPlayer, toHouse)` is the single payout primitive — `settleWithSeeds` reuses it.
- M1 = **dice + limbo only**. Plinko/keno are deferred (no `GamePayouts` branch; reverting default).
- EIP-712 domain is unchanged: `{ name: 'MsgBoardGames', version: '1' }`.

## Critical pre-existing gap (drives Task 1 + Task 4)

The current `Table` struct (HouseChannel.sol L65-78) stores `player, playerKey, escrowPlayer,
escrowHouse, gameId, status, clockBlocks, checkpointNonce, hasCheckpoint, disputeDeadline,
disputant, disputeState`. It does **NOT** store `rngCommit`, `clientSeedCommit`, or `paramsHash`.
The spec's `settleWithSeeds` reads `t.rngCommit` / `t.clientSeedCommit` / `t.paramsHash` — **none
exist on `Table` yet**. Therefore `open()` must persist all three into the table. Task 1 adds the
fields to `Table` and writes them in `open()`; Task 4 reads them. (`gameId` and the escrows are
already persisted.)

---

## File Structure

### Created
| File | Responsibility |
| --- | --- |
| `packages/contracts/contracts/games/GamePayouts.sol` | Pure library: `settle(uint8 gameId, uint256 r, bytes params, uint256 escrowPlayer, uint256 escrowHouse) → (uint256 balancePlayer, uint256 balanceHouse)`. Dispatches on `gameId` (1 dice, 2 limbo); reverts on others. Reproduces TS math exactly + conservation. |
| `packages/contracts/test/foundry/GamePayouts.t.sol` | Foundry parity tests for dice + limbo (win + loss + `r` vector + escrow-ceiling assert). |
| `packages/contracts/test/foundry/SettleWithSeeds.t.sol` | Foundry tests for the new `settleWithSeeds` path (honest win/loss, all revert cases, double-settle). |
| `examples/games/msgboard-settle/scripts/gen-recompute-vectors.ts` | `tsx` script importing the REAL `@gibs/msgboard-games` dice/limbo + `roundRandom`; prints fixed-seed vectors (`r`, `roll`/`u`, `win`, `payout`) consumed by the foundry parity tests. Single source of the numbers hardcoded in `GamePayouts.t.sol`. |
| `examples/games/house-service/scripts/recompute-round.ts` | Off-chain driver + live E2E on 943: open with the new terms, exchange seeds, call `settleWithSeeds`, assert balances + conservation. Mirrors `scripts/live-round.ts`. |

### Modified
| File | Change |
| --- | --- |
| `packages/contracts/contracts/games/HouseChannel.sol` | `OpenTerms` struct + `OpenTermsLib.TYPEHASH` + both `structHash`/`structHashMem` gain `clientSeedCommit, paramsHash`. `Table` struct gains `rngCommit, clientSeedCommit, paramsHash`. `open()` persists them. NEW `settleWithSeeds(...)`. NEW errors `BadReveal`, `BadParams`. Import `GamePayouts`. |
| `examples/games/msgboard-settle/src/openTerms.ts` | `OpenTerms` TS interface + `OPEN_TERMS_TYPES` gain `clientSeedCommit: bytes32` and `paramsHash: bytes32`. Add `paramsHashOf(params)` helper. |
| `examples/games/house-service/src/openReview.ts` | `reviewOpen` writes `clientSeedCommit` (already on `req`) + `paramsHash` (from `req.params`) into the signed `terms`. |
| `packages/contracts/test/foundry/HouseChannel.t.sol` | `_terms()` sets the two new fields so existing co-sign tests still build the digest correctly. |
| `examples/games/msgboard-settle/test/openTerms.test.ts` | Extend the round-trip fixture with the two new fields. |

---

## Task 1 — Extend `OpenTerms` (struct + typehash + digest + Table persistence + TS mirror + open-signing)

**Files:**
- `packages/contracts/contracts/games/HouseChannel.sol`
- `packages/contracts/test/foundry/HouseChannel.t.sol`
- `examples/games/msgboard-settle/src/openTerms.ts`
- `examples/games/msgboard-settle/test/openTerms.test.ts`
- `examples/games/house-service/src/openReview.ts`

**Interfaces:**
- **Produces (Solidity):** `OpenTerms` with trailing `bytes32 clientSeedCommit; bytes32 paramsHash;`.
  `Table` with trailing `bytes32 rngCommit; bytes32 clientSeedCommit; bytes32 paramsHash;`.
  `openTermsDigest(OpenTerms) → bytes32` (unchanged signature, new field coverage).
- **Produces (TS):** `OpenTerms` interface + `OPEN_TERMS_TYPES` with the two new `bytes32` fields;
  `paramsHashOf(params: Hex): Hex`.
- **Consumes:** `reviewOpen` consumes `req.clientSeedCommit` (already present) + `req.params`.

### Step 1.1 — Failing TS test (round-trip with new fields)

Edit `examples/games/msgboard-settle/test/openTerms.test.ts` — add the two fields to the fixture and
assert the digest still round-trips:

```ts
const terms: OpenTerms = {
  tableId: `0x${'ab'.repeat(32)}`,
  player: player.address,
  playerKey: player.address,
  escrowPlayer: 200n,
  escrowHouse: 200n,
  gameId: 1,
  rngCommit: `0x${'cd'.repeat(32)}`,
  clockBlocks: 30n,
  expiry: 9_999_999_999n,
  clientSeedCommit: `0x${'ef'.repeat(32)}`,
  paramsHash: `0x${'12'.repeat(32)}`,
}
```

Run (fails — `OpenTerms` type lacks the fields, `OPEN_TERMS_TYPES` omits them so the digest mismatches):
```
cd examples/games/msgboard-settle && pnpm exec vitest run test/openTerms.test.ts
```
Expected: TypeScript / assertion error (missing properties `clientSeedCommit`, `paramsHash`).

### Step 1.2 — Implement TS mirror

Edit `examples/games/msgboard-settle/src/openTerms.ts`:

```ts
export interface OpenTerms {
  tableId: Hex
  player: Hex
  playerKey: Hex
  escrowPlayer: bigint
  escrowHouse: bigint
  gameId: number
  rngCommit: Hex
  clockBlocks: bigint
  expiry: bigint
  clientSeedCommit: Hex
  paramsHash: Hex
}

export const OPEN_TERMS_TYPES = {
  OpenTerms: [
    { name: 'tableId', type: 'bytes32' },
    { name: 'player', type: 'address' },
    { name: 'playerKey', type: 'address' },
    { name: 'escrowPlayer', type: 'uint256' },
    { name: 'escrowHouse', type: 'uint256' },
    { name: 'gameId', type: 'uint8' },
    { name: 'rngCommit', type: 'bytes32' },
    { name: 'clockBlocks', type: 'uint64' },
    { name: 'expiry', type: 'uint64' },
    { name: 'clientSeedCommit', type: 'bytes32' },
    { name: 'paramsHash', type: 'bytes32' },
  ],
} as const
```

Add the params-hash helper (import `encodeAbiParameters` + `keccak256` from viem at the top):

```ts
import { encodeAbiParameters, keccak256, recoverTypedDataAddress, type Hex } from 'viem'

/** paramsHash for a single-uint256-target game (dice/limbo). MUST match Solidity
 *  keccak256(abi.encode(uint256 targetX100)) — abi.encode (32-byte padded), NOT encodePacked. */
export function paramsHashOf(targetX100: bigint): Hex {
  const encoded = encodeAbiParameters([{ type: 'uint256' }], [targetX100])
  return keccak256(encoded)
}
```

Run — passes:
```
cd examples/games/msgboard-settle && pnpm exec vitest run test/openTerms.test.ts
```
Expected: `1 passed`.

### Step 1.3 — Failing Solidity test (digest + persistence)

Add to `packages/contracts/test/foundry/HouseChannel.t.sol` (and update `_terms()` to set the two
new fields). First update `_terms()`:

```solidity
function _terms() internal view returns (OpenTerms memory t) {
    t.tableId = TID;
    t.player = playerWallet;
    t.playerKey = playerKey;
    t.escrowPlayer = 200;
    t.escrowHouse = 200;
    t.gameId = 1;
    t.rngCommit = keccak256("commit");
    t.clockBlocks = CLOCK;
    t.expiry = uint64(block.timestamp + 1 hours);
    t.clientSeedCommit = keccak256("client-commit");
    t.paramsHash = keccak256(abi.encode(uint256(5000)));
}
```

Add a test asserting `open()` persists the three commits into the table. The public `tables(bytes32)`
getter returns the struct fields positionally; add a typed reader via the contract's generated getter.
Because `Table` contains a nested `SessionState disputeState` (a struct), Solidity will NOT
auto-generate a public getter that returns it — so add an explicit view in the contract (Step 1.4)
named `tableCommits(bytes32) returns (bytes32 rngCommit, bytes32 clientSeedCommit, bytes32 paramsHash)`.
The failing test:

```solidity
function test_openPersistsCommits() public {
    OpenTerms memory t = _terms();
    bytes memory sig = _signHouseTerms(t);
    vm.prank(playerWallet);
    ch.open(t, sig);
    (bytes32 rng, bytes32 csc, bytes32 ph) = ch.tableCommits(TID);
    assertEq(rng, keccak256("commit"));
    assertEq(csc, keccak256("client-commit"));
    assertEq(ph, keccak256(abi.encode(uint256(5000))));
}
```

Run (fails to compile — `OpenTerms` has no `clientSeedCommit`, `tableCommits` undefined):
```
cd packages/contracts && forge test --match-path 'test/foundry/HouseChannel.t.sol' -vvv
```
Expected: compilation error (members not found).

### Step 1.4 — Implement Solidity changes

In `packages/contracts/contracts/games/HouseChannel.sol`:

(a) Extend the `OpenTerms` struct (append, preserving order):
```solidity
struct OpenTerms {
    bytes32 tableId;
    address player;
    address playerKey;
    uint256 escrowPlayer;
    uint256 escrowHouse;
    uint8 gameId;
    bytes32 rngCommit;
    uint64 clockBlocks;
    uint64 expiry;
    bytes32 clientSeedCommit;
    bytes32 paramsHash;
}
```

(b) Update `OpenTermsLib.TYPEHASH` and both struct-hash helpers:
```solidity
bytes32 internal constant TYPEHASH = keccak256(
    "OpenTerms(bytes32 tableId,address player,address playerKey,uint256 escrowPlayer,uint256 escrowHouse,uint8 gameId,bytes32 rngCommit,uint64 clockBlocks,uint64 expiry,bytes32 clientSeedCommit,bytes32 paramsHash)"
);

function structHash(OpenTerms calldata t) internal pure returns (bytes32) {
    return keccak256(abi.encode(
        TYPEHASH, t.tableId, t.player, t.playerKey, t.escrowPlayer, t.escrowHouse,
        t.gameId, t.rngCommit, t.clockBlocks, t.expiry, t.clientSeedCommit, t.paramsHash
    ));
}

function structHashMem(OpenTerms memory t) internal pure returns (bytes32) {
    return keccak256(abi.encode(
        TYPEHASH, t.tableId, t.player, t.playerKey, t.escrowPlayer, t.escrowHouse,
        t.gameId, t.rngCommit, t.clockBlocks, t.expiry, t.clientSeedCommit, t.paramsHash
    ));
}
```

(c) Extend the `Table` struct (append three commit fields after `disputeState`, or anywhere after the
existing layout — appended is cleanest; this is a fresh deploy so storage-layout churn is fine):
```solidity
struct Table {
    address player;
    address playerKey;
    uint256 escrowPlayer;
    uint256 escrowHouse;
    uint8 gameId;
    Status status;
    uint64 clockBlocks;
    uint64 checkpointNonce;
    bool hasCheckpoint;
    uint64 disputeDeadline;
    uint8 disputant;
    SessionState disputeState;
    bytes32 rngCommit;
    bytes32 clientSeedCommit;
    bytes32 paramsHash;
}
```

(d) Persist the commits in `open()` (add three assignments alongside the existing field writes,
before the `safeTransferFrom`):
```solidity
t.rngCommit = terms.rngCommit;
t.clientSeedCommit = terms.clientSeedCommit;
t.paramsHash = terms.paramsHash;
```

(e) Add the explicit reader (the auto-getter can't return the nested `disputeState`):
```solidity
/// Read the three open-time commits a permissionless settle authorizes against.
function tableCommits(bytes32 tableId)
    external view returns (bytes32 rngCommit, bytes32 clientSeedCommit, bytes32 paramsHash)
{
    Table storage t = tables[tableId];
    return (t.rngCommit, t.clientSeedCommit, t.paramsHash);
}
```

Run — passes (all existing HouseChannel tests + the new one):
```
cd packages/contracts && forge test --match-path 'test/foundry/HouseChannel.t.sol' -vvv
```
Expected: all tests pass (existing co-sign / dispute tests + `test_openPersistsCommits`).

### Step 1.5 — Wire the house open-signing path

Edit `examples/games/house-service/src/openReview.ts` — import `paramsHashOf` and write both new fields
into `terms`. `req.clientSeedCommit` already exists on `OpenRequest`; `paramsHash` comes from the
single-target params:

```ts
import { signOpenTerms, paramsHashOf, type OpenTerms } from '@gibs/msgboard-settle'
// ...
const terms: OpenTerms = {
  tableId: req.tableId, player: req.player, playerKey: req.playerKey,
  escrowPlayer, escrowHouse, gameId: req.gameId, rngCommit: ctx.rngCommit,
  clockBlocks: ctx.limits.clockBlocks, expiry: ctx.headBlock + ctx.limits.expiryBlocks,
  clientSeedCommit: req.clientSeedCommit,
  paramsHash: paramsHashOf((req.params as { targetX100: bigint }).targetX100),
}
```

Run the house-service open-review test (it should still pass; if it constructs terms it now needs the
fields — update the fixture if so):
```
cd examples/games/house-service && pnpm exec vitest run test/openReview.test.ts
```
Expected: passes.

### Step 1.6 — Commit

```
git add -A && git commit -m "feat(house-channel): extend OpenTerms with clientSeedCommit + paramsHash; persist commits on open"
```

---

## Task 2 — `GamePayouts.sol`: dice branch + parity test (win + loss + r vector)

**Files:**
- `packages/contracts/contracts/games/GamePayouts.sol` (new)
- `packages/contracts/test/foundry/GamePayouts.t.sol` (new)
- `examples/games/msgboard-settle/scripts/gen-recompute-vectors.ts` (new — used to source the numbers)

**Interfaces:**
- **Produces:** `library GamePayouts { function settle(uint8 gameId, uint256 r, bytes memory params, uint256 escrowPlayer, uint256 escrowHouse) internal pure returns (uint256 balancePlayer, uint256 balanceHouse); }`
- **Consumes (test):** fixed-seed vectors from `gen-recompute-vectors.ts`.

### Step 2.1 — Generate the parity vectors (do this first; the numbers go into the test)

Create `examples/games/msgboard-settle/scripts/gen-recompute-vectors.ts`:

```ts
/**
 * gen-recompute-vectors.ts — print fixed-seed parity vectors from the REAL TS game reference.
 * The numbers it prints are hardcoded into packages/contracts/test/foundry/GamePayouts.t.sol so the
 * Solidity port is checked against the canonical math (not a re-derivation).
 *
 *   pnpm --filter @gibs/msgboard-settle exec tsx scripts/gen-recompute-vectors.ts
 */
import { dice, limbo, roundRandom } from '@gibs/msgboard-games'

// Two fixed (serverSeed, clientSeed, nonce) triples chosen to land a WIN and a LOSS for each game.
// Adjust the seeds until both outcomes appear (the script prints win/loss so you can tune).
const stake = 200n

function show(label: string, serverSeed: `0x${string}`, clientSeed: `0x${string}`, nonce: bigint,
             game: typeof dice | typeof limbo, targetX100: bigint) {
  const r = roundRandom(serverSeed, clientSeed, nonce)
  const outcome = game.settleRound(stake, { targetX100 } as never, r)
  const payout = outcome.win ? outcome.playerDelta + stake : 0n // playerDelta = payout - stake
  console.log(JSON.stringify({
    label, gameId: game.gameId, serverSeed, clientSeed, nonce: nonce.toString(),
    targetX100: targetX100.toString(), r: r.toString(),
    win: outcome.win, payout: payout.toString(),
  }))
}

const s = (n: number) => (`0x${n.toString(16).padStart(64, '0')}`) as `0x${string}`

// dice (gameId 1), target 5000 (50.00% roll-under)
show('dice-win',  s(1), s(2), 1n, dice, 5000n)
show('dice-loss', s(3), s(4), 1n, dice, 5000n)
// limbo (gameId 2), target 200 (2.00x)
show('limbo-win',  s(5), s(6), 1n, limbo, 200n)
show('limbo-loss', s(7), s(8), 1n, limbo, 200n)
```

Run it and CAPTURE the output (these exact numbers go into the foundry test):
```
cd /Users/michaelmclaughlin/Documents/gibs-finance/random && pnpm --filter @gibs/msgboard-settle exec tsx scripts/gen-recompute-vectors.ts
```
Expected: 4 JSON lines. If `dice-win`/`dice-loss` (or limbo) both show the same `win`, change the seed
ints (`s(1)…`) until you have one win and one loss per game, then re-capture. **Record the printed
`r`, `targetX100`, `win`, and `payout` for all four lines** — they are pasted into Step 2.3 / Task 3.

### Step 2.2 — Failing dice parity test

Create `packages/contracts/test/foundry/GamePayouts.t.sol` with the dice vectors from Step 2.1. Use the
captured `r` and `payout` values (the placeholders `<R_DICE_WIN>` etc. below are replaced with the real
decimals from the script output):

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GamePayouts} from "../../contracts/games/GamePayouts.sol";

contract GamePayoutsTest is Test {
    uint256 internal constant ESCROW_PLAYER = 200;
    // escrowHouse for dice target 5000: stake*(mult-100)/100; mult=99_000_000/5000/... (see Task 1).
    // Use a ceiling large enough to never trip the payout<=pot assert; the parity test only checks
    // the payout number, so size escrowHouse from the TS escrowFor for the same target.
    uint256 internal constant ESCROW_HOUSE = 196; // = 200*(198-100)/100 for ~1.98x dice@5000

    function _params(uint256 targetX100) internal pure returns (bytes memory) {
        return abi.encode(targetX100);
    }

    function test_dice_win_matchesTs() public pure {
        uint256 r = <R_DICE_WIN>;          // from gen-recompute-vectors (dice-win)
        (uint256 bP, uint256 bH) =
            GamePayouts.settle(1, r, _params(5000), ESCROW_PLAYER, ESCROW_HOUSE);
        assertEq(bP, <PAYOUT_DICE_WIN>);   // from gen-recompute-vectors (dice-win)
        assertEq(bP + bH, ESCROW_PLAYER + ESCROW_HOUSE); // conservation
    }

    function test_dice_loss_matchesTs() public pure {
        uint256 r = <R_DICE_LOSS>;         // from gen-recompute-vectors (dice-loss)
        (uint256 bP, uint256 bH) =
            GamePayouts.settle(1, r, _params(5000), ESCROW_PLAYER, ESCROW_HOUSE);
        assertEq(bP, 0);
        assertEq(bH, ESCROW_PLAYER + ESCROW_HOUSE);
    }

    // r parity is structural; pin it with one known triple == the dice-win triple's r.
    function test_r_matchesTs() public pure {
        bytes32 serverSeed = bytes32(uint256(1));
        bytes32 clientSeed = bytes32(uint256(2));
        uint64 nonce = 1;
        uint256 r = uint256(keccak256(abi.encode(serverSeed, clientSeed, nonce)));
        assertEq(r, <R_DICE_WIN>); // identical to viem roundRandom(s(1), s(2), 1)
    }
}
```

Run (fails — `GamePayouts.sol` doesn't exist):
```
cd packages/contracts && forge test --match-path 'test/foundry/GamePayouts.t.sol' -vvv
```
Expected: compilation/import error (`GamePayouts` not found).

### Step 2.3 — Implement `GamePayouts.sol` (dice branch only)

Create `packages/contracts/contracts/games/GamePayouts.sol`:

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// Pure on-chain reproduction of the @gibs/msgboard-games settlement math (dice + limbo for M1).
/// Returns the conserved (balancePlayer, balanceHouse) split for a single-draw round. Parity with
/// the TS reference is pinned by foundry vectors generated from the canonical game code.
library GamePayouts {
    error UnknownGame();

    // shared constants — mirror examples/games/msgboard-games/src/game.ts
    uint256 internal constant EDGE_BPS = 100;     // 1% house edge (bps)
    uint256 internal constant HUNDREDTHS = 100;   // 1.00x == 100

    // dice — mirror src/games/dice.ts
    uint256 internal constant DICE_ROLL_SPACE = 10_000;
    uint256 internal constant DICE_MIN_TARGET = 1;
    uint256 internal constant DICE_MAX_TARGET = 9899;

    function settle(
        uint8 gameId,
        uint256 r,
        bytes memory params,
        uint256 escrowPlayer,
        uint256 escrowHouse
    ) internal pure returns (uint256 balancePlayer, uint256 balanceHouse) {
        uint256 stake = escrowPlayer; // escrowFor: escrowPlayer == stake
        uint256 payout;

        if (gameId == 1) {
            payout = _dice(r, params, stake);
        } else {
            revert UnknownGame();
        }

        uint256 pot = escrowPlayer + escrowHouse;
        require(payout <= pot, "payout exceeds pot"); // escrow ceiling guarantees this; assert for safety
        balancePlayer = payout;
        balanceHouse = pot - payout;
    }

    /// dice (gameId 1): roll-under target in hundredths of a percent. Ports diceMultiplierX100 +
    /// settleRound from src/games/dice.ts using the EXACT TS operation order:
    ///   multX100 = (ROLL_SPACE - EDGE_BPS) * ROLL_SPACE / targetX100 / HUNDREDTHS
    ///   payout   = win ? stake * multX100 / HUNDREDTHS : 0
    function _dice(uint256 r, bytes memory params, uint256 stake) private pure returns (uint256) {
        uint256 targetX100 = abi.decode(params, (uint256));
        require(targetX100 >= DICE_MIN_TARGET && targetX100 <= DICE_MAX_TARGET, "dice: target out of range");
        uint256 roll = r % DICE_ROLL_SPACE;
        if (roll >= targetX100) return 0; // loss
        uint256 multX100 = (DICE_ROLL_SPACE - EDGE_BPS) * DICE_ROLL_SPACE / targetX100 / HUNDREDTHS;
        return stake * multX100 / HUNDREDTHS;
    }
}
```

> Operation-order note: the TS `diceMultiplierX100` is `(ROLL_SPACE - EDGE_BPS) * ROLL_SPACE /
> targetX100 / HUNDREDTHS` — two sequential integer divisions. The Solidity above replicates that
> exact left-to-right order, so the truncation matches bit-for-bit. The parity vector (Step 2.2)
> is what guarantees it; do NOT pre-simplify to `99_000_000 / targetX100`.

Run — passes:
```
cd packages/contracts && forge test --match-path 'test/foundry/GamePayouts.t.sol' -vvv
```
Expected: `test_dice_win_matchesTs`, `test_dice_loss_matchesTs`, `test_r_matchesTs` pass.

### Step 2.4 — Commit

```
git add -A && git commit -m "feat(game-payouts): dice branch + TS parity vectors (win/loss/r)"
```

---

## Task 3 — `GamePayouts.sol`: limbo branch + parity test (win + loss)

**Files:**
- `packages/contracts/contracts/games/GamePayouts.sol`
- `packages/contracts/test/foundry/GamePayouts.t.sol`

**Interfaces:** extends `GamePayouts.settle` to dispatch `gameId == 2`.

### Step 3.1 — Failing limbo parity test

Append to `GamePayoutsTest` (use the limbo vectors captured in Step 2.1; limbo target 200 → win pays
`stake*200/100 = 400`; size `escrowHouse` so `pot >= 400`):

```solidity
uint256 internal constant LIMBO_ESCROW_HOUSE = 200; // pot = 400 == stake*target/100 for target 200

function test_limbo_win_matchesTs() public pure {
    uint256 r = <R_LIMBO_WIN>;            // gen-recompute-vectors (limbo-win)
    (uint256 bP, uint256 bH) =
        GamePayouts.settle(2, r, _params(200), ESCROW_PLAYER, LIMBO_ESCROW_HOUSE);
    assertEq(bP, <PAYOUT_LIMBO_WIN>);     // gen-recompute-vectors (limbo-win) == 400
    assertEq(bP + bH, ESCROW_PLAYER + LIMBO_ESCROW_HOUSE);
}

function test_limbo_loss_matchesTs() public pure {
    uint256 r = <R_LIMBO_LOSS>;           // gen-recompute-vectors (limbo-loss)
    (uint256 bP, uint256 bH) =
        GamePayouts.settle(2, r, _params(200), ESCROW_PLAYER, LIMBO_ESCROW_HOUSE);
    assertEq(bP, 0);
    assertEq(bH, ESCROW_PLAYER + LIMBO_ESCROW_HOUSE);
}
```

Run (fails — `gameId == 2` hits `revert UnknownGame()`):
```
cd packages/contracts && forge test --match-path 'test/foundry/GamePayouts.t.sol' -vvv
```
Expected: `test_limbo_*` revert with `UnknownGame`.

### Step 3.2 — Implement the limbo branch

In `GamePayouts.sol`, add the constants and the `_limbo` function, and add the dispatch arm:

```solidity
// limbo — mirror src/games/limbo.ts
uint256 internal constant LIMBO_U_SPACE = 1_000_000;
uint256 internal constant LIMBO_ONE_MINUS_EDGE_X100 = (10_000 - EDGE_BPS) / HUNDREDTHS; // 99
uint256 internal constant LIMBO_MIN_TARGET = 100;
uint256 internal constant LIMBO_MAX_TARGET = LIMBO_ONE_MINUS_EDGE_X100 * LIMBO_U_SPACE;  // 99_000_000
```

Dispatch (replace the `else revert`):
```solidity
if (gameId == 1) {
    payout = _dice(r, params, stake);
} else if (gameId == 2) {
    payout = _limbo(r, params, stake);
} else {
    revert UnknownGame();
}
```

```solidity
/// limbo (gameId 2): result = (1-edge)/(1-U). Ports limboResultX100 + settleRound from
/// src/games/limbo.ts:  resultX100 = (ONE_MINUS_EDGE_X100 * U_SPACE) / (U_SPACE - u)
///                      payout     = win ? stake * targetX100 / HUNDREDTHS : 0
function _limbo(uint256 r, bytes memory params, uint256 stake) private pure returns (uint256) {
    uint256 targetX100 = abi.decode(params, (uint256));
    require(targetX100 >= LIMBO_MIN_TARGET && targetX100 <= LIMBO_MAX_TARGET, "limbo: target out of range");
    uint256 u = r % LIMBO_U_SPACE;
    uint256 resultX100 = (LIMBO_ONE_MINUS_EDGE_X100 * LIMBO_U_SPACE) / (LIMBO_U_SPACE - u);
    if (resultX100 < targetX100) return 0; // loss
    return stake * targetX100 / HUNDREDTHS;
}
```

Run — passes:
```
cd packages/contracts && forge test --match-path 'test/foundry/GamePayouts.t.sol' -vvv
```
Expected: all dice + limbo parity tests pass.

### Step 3.3 — Commit

```
git add -A && git commit -m "feat(game-payouts): limbo branch + TS parity vectors (win/loss)"
```

---

## Task 4 — `settleWithSeeds`: wire the permissionless path + foundry tests

**Files:**
- `packages/contracts/contracts/games/HouseChannel.sol`
- `packages/contracts/test/foundry/SettleWithSeeds.t.sol` (new)

**Interfaces:**
- **Produces:** `function settleWithSeeds(bytes32 tableId, bytes32 serverSeed, bytes32 clientSeed, bytes calldata params) external;`
  — **no `nonce` parameter** (hardcoded to 1 internally; see the Security note in Global Constraints).
- **Consumes:** `t.status`, `t.rngCommit`, `t.clientSeedCommit`, `t.paramsHash`, `t.gameId`,
  `t.escrowPlayer`, `t.escrowHouse` (all persisted in Task 1); `GamePayouts.settle`; `_payout`.

### Step 4.1 — Failing tests

Create `packages/contracts/test/foundry/SettleWithSeeds.t.sol`. Mirror `HouseChannel.t.sol`'s setup
(Chips mint/approve/fund, `setHouseKey`, house-signed terms). Use **the same dice-win / dice-loss
seed triples** from the Task 2 vector script so the on-chain recompute is anchored to known outcomes.
Build `terms` with `clientSeedCommit = keccak256(clientSeed)`, `rngCommit = keccak256(serverSeed)`,
`paramsHash = keccak256(abi.encode(uint256(5000)))`, `gameId = 1`. Size escrows so the win pays
(`escrowPlayer = 200`, `escrowHouse` ≥ dice max profit for target 5000).

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Chips} from "../../contracts/games/Chips.sol";
import {HouseChannel, OpenTerms} from "../../contracts/games/HouseChannel.sol";

contract SettleWithSeedsTest is Test {
    Chips internal chips;
    HouseChannel internal ch;

    uint256 internal pkHouse = 0xB0B;
    address internal playerWallet = address(uint160(uint256(keccak256("player-wallet"))));
    address internal playerKey = address(uint160(uint256(keccak256("player-key"))));
    address internal house;

    bytes32 internal constant TID = keccak256("sws1");
    uint64 internal constant CLOCK = 30;

    // dice-win / dice-loss triples (== gen-recompute-vectors seeds s(1)/s(2) and s(3)/s(4))
    bytes32 internal constant SERVER_WIN  = bytes32(uint256(1));
    bytes32 internal constant CLIENT_WIN  = bytes32(uint256(2));
    bytes32 internal constant SERVER_LOSS = bytes32(uint256(3));
    bytes32 internal constant CLIENT_LOSS = bytes32(uint256(4));
    uint256 internal constant TARGET = 5000;

    function setUp() public {
        chips = new Chips();
        ch = new HouseChannel(address(chips));
        house = vm.addr(pkHouse);
        ch.setHouseKey(house);
        chips.mint(playerWallet, 1_000);
        chips.mint(address(this), 10_000);
        chips.approve(address(ch), type(uint256).max);
        ch.fundHouse(10_000);
        vm.prank(playerWallet);
        chips.approve(address(ch), type(uint256).max);
    }

    function _params() internal pure returns (bytes memory) { return abi.encode(TARGET); }

    function _terms(bytes32 serverSeed, bytes32 clientSeed) internal view returns (OpenTerms memory t) {
        t.tableId = TID;
        t.player = playerWallet;
        t.playerKey = playerKey;
        t.escrowPlayer = 200;
        t.escrowHouse = 196;            // ~0.98*stake for dice@5000 (covers the win profit)
        t.gameId = 1;
        t.rngCommit = keccak256(abi.encodePacked(serverSeed));
        t.clockBlocks = CLOCK;
        t.expiry = uint64(block.timestamp + 1 hours);
        t.clientSeedCommit = keccak256(abi.encodePacked(clientSeed));
        t.paramsHash = keccak256(_params());
    }

    function _open(bytes32 serverSeed, bytes32 clientSeed) internal returns (OpenTerms memory t) {
        t = _terms(serverSeed, clientSeed);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pkHouse, ch.openTermsDigest(t));
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.prank(playerWallet);
        ch.open(t, sig);
    }

    function test_honestWinPaysPlayer() public {
        _open(SERVER_WIN, CLIENT_WIN);
        uint256 before = chips.balanceOf(playerWallet);
        ch.settleWithSeeds(TID, SERVER_WIN, CLIENT_WIN, _params());
        // payout == dice-win payout from gen-recompute-vectors; player balance rises by it.
        assertGt(chips.balanceOf(playerWallet), before);
        // pot fully distributed: player payout + housePool delta == escrowPlayer+escrowHouse
    }

    function test_honestLossPaysHouse() public {
        _open(SERVER_LOSS, CLIENT_LOSS);
        uint256 poolBefore = ch.housePool();
        uint256 playerBefore = chips.balanceOf(playerWallet);
        ch.settleWithSeeds(TID, SERVER_LOSS, CLIENT_LOSS, _params());
        assertEq(chips.balanceOf(playerWallet), playerBefore); // no payout
        assertEq(ch.housePool(), poolBefore + 200 + 196);      // whole pot returns to pool
    }

    function test_badServerSeedReverts() public {
        _open(SERVER_WIN, CLIENT_WIN);
        vm.expectRevert(HouseChannel.BadReveal.selector);
        ch.settleWithSeeds(TID, bytes32(uint256(99)), CLIENT_WIN, _params());
    }

    function test_badClientSeedReverts() public {
        _open(SERVER_WIN, CLIENT_WIN);
        vm.expectRevert(HouseChannel.BadReveal.selector);
        ch.settleWithSeeds(TID, SERVER_WIN, bytes32(uint256(99)), _params());
    }

    function test_badParamsReverts() public {
        _open(SERVER_WIN, CLIENT_WIN);
        vm.expectRevert(HouseChannel.BadParams.selector);
        ch.settleWithSeeds(TID, SERVER_WIN, CLIENT_WIN, abi.encode(uint256(1234)));
    }

    // SECURITY: nonce is NOT a caller input — it is hardcoded to 1 inside settleWithSeeds. The chosen
    // SERVER_WIN/CLIENT_WIN triple is the gen-recompute-vectors "dice-win" triple AT NONCE 1, so the
    // honest reveal pays the player; there is no way for a settler to pass a different nonce to grind a
    // different outcome (the param simply does not exist). This test pins that the win is realized from
    // ONLY the seeds + params — no nonce argument is available to manipulate.
    function test_outcomeFixedByNonceOne() public {
        _open(SERVER_WIN, CLIENT_WIN);
        uint256 before = chips.balanceOf(playerWallet);
        ch.settleWithSeeds(TID, SERVER_WIN, CLIENT_WIN, _params()); // dice-win @ nonce 1
        assertGt(chips.balanceOf(playerWallet), before);            // win realized, deterministically
    }

    function test_doubleSettleReverts() public {
        _open(SERVER_LOSS, CLIENT_LOSS);
        ch.settleWithSeeds(TID, SERVER_LOSS, CLIENT_LOSS, _params());
        vm.expectRevert(HouseChannel.BadStatus.selector);
        ch.settleWithSeeds(TID, SERVER_LOSS, CLIENT_LOSS, _params());
    }
}
```

> Nonce note (SECURITY): `settleWithSeeds` does NOT accept a `nonce` argument. `nonce` is folded into
> `r = keccak256(serverSeed, clientSeed, nonce)`, so a caller-supplied `nonce` would let a settler
> **grind** the outcome (player-caller picks a winning value; house-caller picks a losing one) — the
> commit-bound seeds do not constrain `nonce`. The function hardcodes `uint64(1)` (the single-draw
> round nonce, matching the co-sign flow). Therefore the test matrix has **no "wrong nonce" case** (the
> parameter doesn't exist); `test_outcomeFixedByNonceOne` instead pins that the outcome is fixed by the
> seeds alone. A future multi-round mechanism MUST bind a per-round `nonce`/`roundId` in the
> house-signed `OpenTerms` at open — never accept it loose at settle.

**Vector caveat:** the Task 2 `gen-recompute-vectors.ts` script must therefore generate its dice/limbo
win+loss vectors **at nonce 1** (it already passes `1n`). The `SERVER_WIN`/`CLIENT_WIN` and
`SERVER_LOSS`/`CLIENT_LOSS` seed pairs chosen there must land the intended outcome specifically at
nonce 1 (tune the seed ints until the script prints win@1 / loss@1), since the contract only ever
evaluates nonce 1.

Run (fails — `settleWithSeeds`, `BadReveal`, `BadParams` don't exist):
```
cd packages/contracts && forge test --match-path 'test/foundry/SettleWithSeeds.t.sol' -vvv
```
Expected: compilation error.

### Step 4.2 — Implement `settleWithSeeds`

In `HouseChannel.sol`: import the library, add the two errors, add the function.

```solidity
import {GamePayouts} from "./GamePayouts.sol";
```
```solidity
error BadReveal();
error BadParams();
```
```solidity
/// Permissionless trustless settle: anyone submits the two revealed seeds + the round params. The
/// seeds must match the commits the house signed at open (rngCommit, clientSeedCommit) and the
/// params must match paramsHash. The contract recomputes the round randomness and the payout itself
/// via GamePayouts — NO signature from either party is consulted.
///
/// SECURITY: the round nonce is HARDCODED to 1 (the single-draw round) and is NOT a caller input. If
/// it were, a settler could grind the nonce to choose the outcome — the commit-bound seeds do not
/// constrain the nonce, so `r` would be attacker-selectable. A future multi-round design must bind a
/// per-round nonce/roundId in the house-signed OpenTerms at open, never accept it loose here.
function settleWithSeeds(
    bytes32 tableId,
    bytes32 serverSeed,
    bytes32 clientSeed,
    bytes calldata params
) external {
    Table storage t = tables[tableId];
    if (t.status != Status.Live) revert BadStatus();
    if (keccak256(abi.encodePacked(serverSeed)) != t.rngCommit) revert BadReveal();
    if (keccak256(abi.encodePacked(clientSeed)) != t.clientSeedCommit) revert BadReveal();
    if (keccak256(params) != t.paramsHash) revert BadParams();

    uint256 r = uint256(keccak256(abi.encode(serverSeed, clientSeed, uint64(1))));
    (uint256 balancePlayer, uint256 balanceHouse) =
        GamePayouts.settle(t.gameId, r, params, t.escrowPlayer, t.escrowHouse);

    _payout(t, tableId, balancePlayer, balanceHouse);
}
```

Run — passes:
```
cd packages/contracts && forge test --match-path 'test/foundry/SettleWithSeeds.t.sol' -vvv
```
Expected: all `SettleWithSeedsTest` tests pass.

### Step 4.3 — Full contract suite (regression)

```
cd packages/contracts && forge test
```
Expected: every default-profile suite passes (HouseChannel, GamePayouts, SettleWithSeeds, CoinFlip,
Raffle, etc.). `ShuffleVerifier52` stays skipped (zk profile).

### Step 4.4 — Commit

```
git add -A && git commit -m "feat(house-channel): settleWithSeeds — permissionless on-chain recompute settle (dice+limbo)"
```

---

## Task 5 — Off-chain driver + live E2E on 943

**Files:**
- `examples/games/house-service/scripts/recompute-round.ts` (new)

**Interfaces:**
- **Consumes:** `@gibs/msgboard-games` (`dice`, `limbo`, `roundRandom`, `commitSeed`, `escrowFor`,
  `makeDomain`), `@gibs/msgboard-settle` (`signOpenTerms`, `paramsHashOf`, `houseChannelAbi`,
  `type OpenTerms`), `DEPLOYMENT_943` / chain config from `src/liveConfig.ts`.
- **Produces:** a script that DRY-RUNS by default and only sends txs under `LIVE_EXECUTE=1`
  (mirroring `live-round.ts`).

### Step 5.1 — Write the driver

Create `examples/games/house-service/scripts/recompute-round.ts`. It does NOT use the board co-sign
loop — the recompute path needs no co-signed `SessionState`. The house only needs to: build a fresh
server seed chain (length 1), sign `OpenTerms` carrying `clientSeedCommit` + `paramsHash`, then reveal
`serverSeed` so the player (or anyone) can call `settleWithSeeds`. Structure:

```ts
/**
 * recompute-round.ts — prove the trustless settleWithSeeds path end-to-end on 943.
 *
 * No board co-sign: the house signs OpenTerms (with clientSeedCommit + paramsHash), the player opens
 * + escrows, the house reveals serverSeed, then ANYONE calls settleWithSeeds(tableId, serverSeed,
 * clientSeed, params). The contract recomputes r (single-draw nonce fixed at 1, NOT a caller input)
 * + payout and pays the conserved pot.
 *
 *   Dry:  pnpm --filter @gibs/games-house-service exec tsx scripts/recompute-round.ts
 *   Live: LIVE_EXECUTE=1 pnpm --filter @gibs/games-house-service exec tsx scripts/recompute-round.ts
 *
 * REQUIRES a HouseChannel deployment whose OpenTerms ABI includes clientSeedCommit + paramsHash —
 * i.e. the contract from Tasks 1-4 must be deployed and DEPLOYMENT_943.houseChannel repointed FIRST
 * (a user-gated deploy step; see "Deploy gate" below).
 */
import {
  createPublicClient, createWalletClient, http, keccak256, stringToHex, parseEther, formatUnits,
  encodeAbiParameters, type Hex, type Abi,
} from 'viem'
import { mnemonicToAccount, generatePrivateKey } from 'viem/accounts'
import { dice, limbo, roundRandom, commitSeed, escrowFor, makeDomain, type Game } from '@gibs/msgboard-games'
import { signOpenTerms, paramsHashOf, houseChannelAbi, type OpenTerms } from '@gibs/msgboard-settle'
import { DEPLOYMENT_943, DEFAULT_LIMITS, pulsechainV4, readMnemonic, houseSignerFromMnemonic } from '../src/liveConfig'

const EXECUTE = process.env.LIVE_EXECUTE === '1'
const D = DEPLOYMENT_943
const GAME = (process.env.GAME ?? 'dice').toLowerCase()
const GAMES: Record<string, { game: Game<unknown>; targetX100: bigint }> = {
  dice:  { game: dice  as Game<unknown>, targetX100: 5000n },
  limbo: { game: limbo as Game<unknown>, targetX100: 200n },
}
```

The `main()` flow (reuse the `send()` legacy-tx helper + the gas trap pattern verbatim from
`live-round.ts`):

1. Derive `playerAcct` (index 0) + `houseSigner` (index 1); make clients on `D.txRpcUrl`.
2. Pick game + `targetX100`; `params = encodeAbiParameters([{type:'uint256'}],[targetX100])`;
   `paramsHash = paramsHashOf(targetX100)`.
3. House builds a length-1 server seed chain: `serverSeed = generatePrivateKey()` (a random bytes32),
   `rngCommit = commitSeed(serverSeed)`. Player picks `clientSeed = generatePrivateKey()`,
   `clientSeedCommit = commitSeed(clientSeed)`.
4. `mult = game.maxMultiplierX100({ targetX100 })`; `{ escrowPlayer, escrowHouse } = escrowFor(stake, mult)`
   with `stake = parseEther('0.1')`.
5. Build `OpenTerms` (the new shape) + `domain = makeDomain(D.chainId, D.houseChannel)`;
   `houseSig = await signOpenTerms(houseSigner, domain, terms)`.
6. **Off-chain recompute preview (always, even dry):** `r = roundRandom(serverSeed, clientSeed, 1n)`
   — nonce `1n` to mirror the contract's hardcoded single-draw nonce;
   `outcome = game.settleRound(stake, { targetX100 }, r)`; log win/loss + expected payout.
7. **LIVE only:** `approve(channel, escrowPlayer)` → `open(terms, houseSig)` (from playerAcct) →
   `settleWithSeeds(tableId, serverSeed, clientSeed, params)` (no nonce arg; any sender — use playerAcct).
8. **Assert conservation on-chain:** read `Settled` event args (`payoutPlayer`, `payoutHouse`) from the
   settle receipt logs (decode with `houseChannelAbi`), assert `payoutPlayer + payoutHouse ==
   escrowPlayer + escrowHouse` and that `payoutPlayer` equals the off-chain `outcome` payout.

Use `clockBlocks` clamped to the on-chain `MIN/MAX_CLOCK_BLOCKS` window exactly as `live-round.ts` does.

### Step 5.2 — Dry run (no chain writes; proves the off-chain recompute + terms build)

```
cd /Users/michaelmclaughlin/Documents/gibs-finance/random && pnpm --filter @gibs/games-house-service exec tsx scripts/recompute-round.ts
```
Expected: logs the game, `escrowPlayer`/`escrowHouse`, the off-chain `r`, win/loss, expected payout,
and `DRY — chain skipped`. No tx sent.

### Step 5.3 — Deploy gate (USER-GATED — do NOT run unattended)

The `OpenTerms` ABI changed, so the live 943 `HouseChannel` (`DEPLOYMENT_943.houseChannel`) is
incompatible — `settleWithSeeds` and the new terms need the Task 1-4 contract deployed. This is the
same gated workflow as the prior redeploy. The user runs:

```
# build artifacts (hardhat) so deploy-house.ts can read HouseChannel.json
cd packages/contracts && pnpm build
# dry-run the deploy (prints plan + gas; sends nothing)
MNEMONIC=… pnpm exec tsx scripts/deploy-house.ts
# broadcast (only when the user approves)
DEPLOY_EXECUTE=1 MNEMONIC=… pnpm exec tsx scripts/deploy-house.ts
```
Then repoint the new address in:
- `examples/games/house-service/src/liveConfig.ts` (`DEPLOYMENT_943.houseChannel`)
- `examples/games/web/src/config.ts` (943 `houseChannel`)
- `deploy/games-indexer/ponder.config.ts` (`HOUSE_CHANNEL` + start block)
- any `makeSettleDomain` `verifyingContract`

**This plan does NOT execute the deploy.** Flag it to the user; proceed to 5.4 only after they deploy.

### Step 5.4 — Live execute (USER-GATED, after deploy + repoint)

```
cd /Users/michaelmclaughlin/Documents/gibs-finance/random && LIVE_EXECUTE=1 pnpm --filter @gibs/games-house-service exec tsx scripts/recompute-round.ts
```
Expected: `approve` → `open` → `settleWithSeeds` all confirm; the script asserts on-chain
`payoutPlayer + payoutHouse == escrowPlayer + escrowHouse` and that `payoutPlayer` matches the
off-chain payout; prints the settle tx URL.

### Step 5.5 — Commit

```
git add -A && git commit -m "feat(house-service): recompute-round live E2E driver for settleWithSeeds on 943"
```

---

## Deferred (Track 1, M2+ — NOT in this plan)

- Plinko + keno `GamePayouts` branches (paytables not frozen; `gen-recompute-vectors.ts` extends to
  cover them once they are).
- Binding `nonce`/`roundId` on-chain at open (see Concerns) if multi-draw rounds are added.
- Privacy (Track 2 / Noir), Zypher cards (Track 3), on-chain randomness (Track 4).

## Test command summary

| Scope | Command (run from repo root unless noted) |
| --- | --- |
| OpenTerms TS mirror | `cd examples/games/msgboard-settle && pnpm exec vitest run test/openTerms.test.ts` |
| House open-review | `cd examples/games/house-service && pnpm exec vitest run test/openReview.test.ts` |
| HouseChannel foundry | `cd packages/contracts && forge test --match-path 'test/foundry/HouseChannel.t.sol' -vvv` |
| GamePayouts parity | `cd packages/contracts && forge test --match-path 'test/foundry/GamePayouts.t.sol' -vvv` |
| settleWithSeeds | `cd packages/contracts && forge test --match-path 'test/foundry/SettleWithSeeds.t.sol' -vvv` |
| Full contract suite | `cd packages/contracts && forge test` |
| Generate vectors | `pnpm --filter @gibs/msgboard-settle exec tsx scripts/gen-recompute-vectors.ts` |
| Live driver (dry) | `pnpm --filter @gibs/games-house-service exec tsx scripts/recompute-round.ts` |
| Live driver (execute) | `LIVE_EXECUTE=1 pnpm --filter @gibs/games-house-service exec tsx scripts/recompute-round.ts` (after deploy) |
