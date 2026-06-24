# Task 1 Report — Extend `OpenTerms` (clientSeedCommit + paramsHash)

**Branch:** `feat/recompute-settle` (off `dice-onchain-settlement`)
**Plan:** `docs/superpowers/plans/2026-06-23-recompute-settle.md` — Task 1 only
**Date:** 2026-06-24
**Status:** DONE

## Scope

Additive extension of `OpenTerms` so the (future) permissionless `settleWithSeeds` path can
authorize off the three open-time commits. No co-sign / dispute path was touched. Tasks 2–5 were
NOT implemented (out of scope).

## Changes

### Solidity — `packages/contracts/contracts/games/HouseChannel.sol`
- `OpenTerms` struct: appended `bytes32 clientSeedCommit; bytes32 paramsHash;` (after `expiry`,
  preserving existing field order).
- `OpenTermsLib.TYPEHASH`: updated to the exact string from Global Constraints, appending the two
  new fields at the end:
  `OpenTerms(bytes32 tableId,address player,address playerKey,uint256 escrowPlayer,uint256 escrowHouse,uint8 gameId,bytes32 rngCommit,uint64 clockBlocks,uint64 expiry,bytes32 clientSeedCommit,bytes32 paramsHash)`
- `structHash` (calldata) and `structHashMem` (memory): both now include
  `t.clientSeedCommit, t.paramsHash` in the `abi.encode(...)`.
- `Table` struct: appended `bytes32 rngCommit; bytes32 clientSeedCommit; bytes32 paramsHash;`
  after the nested `disputeState`.
- `open()`: persists `t.rngCommit = terms.rngCommit; t.clientSeedCommit = terms.clientSeedCommit;
  t.paramsHash = terms.paramsHash;` (written before the `safeTransferFrom`, alongside the existing
  field writes).
- Added `tableCommits(bytes32) external view returns (bytes32 rngCommit, bytes32 clientSeedCommit,
  bytes32 paramsHash)` — the auto-getter cannot return the nested `disputeState`, so an explicit
  reader is required.

### Solidity test — `packages/contracts/test/foundry/HouseChannel.t.sol`
- `_terms()`: sets the two new fields (`clientSeedCommit = keccak256("client-commit")`,
  `paramsHash = keccak256(abi.encode(uint256(5000)))`) so all existing co-sign/dispute tests still
  build a valid digest.
- Added `test_openPersistsCommits()` asserting `open()` persists all three commits, read back via
  `tableCommits(TID)`.

### TS mirror — `examples/games/msgboard-settle/src/openTerms.ts`
- `OpenTerms` interface: added `clientSeedCommit: Hex` and `paramsHash: Hex`.
- `OPEN_TERMS_TYPES.OpenTerms`: appended `{ name: 'clientSeedCommit', type: 'bytes32' }` and
  `{ name: 'paramsHash', type: 'bytes32' }`.
- Imported `encodeAbiParameters, keccak256` from viem; added `paramsHashOf(targetX100: bigint): Hex`
  = `keccak256(encodeAbiParameters([{ type: 'uint256' }], [targetX100]))` (32-byte padded
  `abi.encode`, NOT `encodePacked` — matches the Solidity `keccak256(abi.encode(uint256))`).
- `paramsHashOf` is re-exported via the existing `export * from './openTerms'` in `src/index.ts`.

### TS test — `examples/games/msgboard-settle/test/openTerms.test.ts`
- Extended the round-trip fixture with `clientSeedCommit` and `paramsHash`.

### House open-signing — `examples/games/house-service/src/openReview.ts`
- Imported `paramsHashOf`.
- `reviewOpen` now writes `clientSeedCommit: req.clientSeedCommit` (already on `OpenRequest`) and
  `paramsHash: paramsHashOf((req.params as { targetX100: bigint }).targetX100)` into the signed
  `terms`.

## TDD steps + exact commands run

### Step 1.1 — failing TS test
`cd examples/games/msgboard-settle && pnpm exec vitest run test/openTerms.test.ts`
- Vitest itself **passed** (it does not typecheck, and viem's `signTypedData` only hashes the
  fields declared in `OPEN_TERMS_TYPES`, so the extra fixture fields were ignored and the digest
  still round-tripped). The *failing signal* the plan intends surfaces at the type level instead:
  `pnpm exec tsc --noEmit` →
  `test/openTerms.test.ts(20,3): error TS2353: Object literal may only specify known properties, and
  'clientSeedCommit' does not exist in type 'OpenTerms'.`
  This matches the plan's "TypeScript / assertion error (missing properties)" expectation.

### Step 1.2 — implement TS mirror → passes
`cd examples/games/msgboard-settle && pnpm exec vitest run test/openTerms.test.ts` → **1 passed**.
`pnpm exec tsc --noEmit` → clean.

### Step 1.3 — failing Solidity test
`cd packages/contracts && forge test --match-path 'test/foundry/HouseChannel.t.sol' -vvv`
- Compilation failed as expected:
  `Error (9582): Member "clientSeedCommit" not found or not visible after argument-dependent lookup
  in struct OpenTerms memory.` (HouseChannel.t.sol:48).

### Step 1.4 — implement Solidity → passes
`cd packages/contracts && forge test --match-path 'test/foundry/HouseChannel.t.sol'`
→ **16 passed; 0 failed; 0 skipped** (all existing co-sign/dispute tests + new
`test_openPersistsCommits`).

### Step 1.5 — wire house open-signing → passes
`cd examples/games/house-service && pnpm exec vitest run test/openReview.test.ts` → **3 passed**.
`cd examples/games/house-service && pnpm exec tsc --noEmit` → clean.

## Test summary
- `forge test --match-path test/foundry/HouseChannel.t.sol`: **16 passed, 0 failed**.
- `vitest run test/openTerms.test.ts` (msgboard-settle): **1 passed**.
- `vitest run test/openReview.test.ts` (house-service): **3 passed**.
- `tsc --noEmit` for both TS packages: clean.

## Deviations from the plan
1. **Step 1.1 failing signal is at `tsc`, not `vitest`.** The plan said the vitest run would fail
   with a "TypeScript / assertion error". In practice vitest does not typecheck and viem ignores
   message fields not declared in the EIP-712 types, so the runtime round-trip passed even before
   the mirror was updated. I confirmed the intended RED state via `tsc --noEmit` (TS2353 on the two
   missing properties). The mirror was then implemented; both vitest and tsc are green. No code
   behaviour changed as a result — this is purely a note about where the failing signal appears.

## Concerns / notes for downstream tasks
- `paramsHashOf` takes a `bigint targetX100` (single-uint256-target games: dice/limbo). When
  Task 5's driver or any non-{dice,limbo} game needs a different params shape, this helper will need
  a sibling. For M1 (dice + limbo) it is correct.
- `Table` now has the nested `disputeState` struct plus three trailing `bytes32` fields; the public
  `tables(bytes32)` auto-getter still omits the nested struct (unchanged behaviour). `tableCommits`
  is the typed reader for the new commits, as the plan specified.
- This is a storage-layout change to `Table` (additive). Per the plan this is a fresh deploy, so
  layout churn is acceptable; the live 943 `HouseChannel` will need redeploy + repoint before
  Task 5's E2E (a separate user-gated step — not done here).
- The co-sign `settle(SessionState, sigPlayer, sigHouse)` path and all dispute paths are unchanged.
