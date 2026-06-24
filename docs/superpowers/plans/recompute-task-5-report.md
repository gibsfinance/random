# Recompute-Settle Task 5 — Report

**Task:** Off-chain driver + live E2E for the permissionless `settleWithSeeds` recompute path on 943.
**Branch:** `feat/recompute-settle`
**Status:** DONE (dry path verified end-to-end; LIVE path implemented but USER-GATED behind a HouseChannel redeploy — NOT executed, NOT deployed, NOT pushed).
**Driver:** `examples/games/house-service/scripts/recompute-round.ts` (new)

---

## What the driver does

Mirrors `scripts/live-round.ts` conventions (legacy type-0 `send()` gas-trap helper, `redactRpc`,
`DEPLOYMENT_943`/`pulsechainV4` config, the `LIVE_EXECUTE=1` gate, `POLL_MS`, inline minimal ABIs)
but proves the NEW trustless flow rather than the co-sign flow:

1. Build `params = abi.encode(uint256 targetX100)` and `paramsHash = paramsHashOf(targetX100)`.
2. House mints a length-1 server seed (`generatePrivateKey()`), `rngCommit = commitSeed(serverSeed)`.
   Player picks `clientSeed`, `clientSeedCommit = commitSeed(clientSeed)`.
3. Size escrow from params only: `mult = game.maxMultiplierX100({targetX100})`,
   `{escrowPlayer, escrowHouse} = escrowFor(stake=0.1, mult)`.
4. Build the **NEW** `OpenTerms` (now carrying `clientSeedCommit` + `paramsHash`) and
   `houseSig = signOpenTerms(houseSigner, domain, terms)`.
5. **Off-chain recompute preview (always — the core of the dry verification):**
   `r = roundRandom(serverSeed, clientSeed, 1n)` (nonce `1n` mirrors the contract's hardcoded
   single-draw nonce), `outcome = game.settleRound(stake, {targetX100}, r)`,
   `expectedPayout = win ? playerDelta + stake : 0`, and assert conservation
   (`payoutPlayer + payoutHouse == pot`, `payout <= pot`).
6. **LIVE only (`LIVE_EXECUTE=1`):** `approve(channel, escrowPlayer)` → `open(terms, houseSig)` →
   `settleWithSeeds(tableId, serverSeed, clientSeed, params)` (NO nonce arg — any sender). Then decode
   the `Settled(tableId, payoutPlayer, payoutHouse)` event from the settle receipt and assert
   `payoutPlayer + payoutHouse == pot` AND `payoutPlayer == expectedPayout` (on-chain == off-chain).

No board co-sign loop, no `SessionState`, no co-sign `settle()` — the recompute settle needs only the
two revealed seeds + the params, exactly as the spec/plan require.

## DRY-run output (verified)

`GAME` selects dice (default) or limbo. Seeds are random each run, so outcomes vary — over several
runs both WIN and LOSS appeared for dice, and conservation held in every case:

```
== recompute-round on 943 (DRY — off-chain recompute only, chain skipped) ==
game=dice · 50% roll-under (id 1)  stake=0.1 → escrowPlayer=0.1 escrowHouse=0.098 pot=0.198
recompute @ nonce 1: r=4632998635346149368091759930203382885381729966242808534373164550994602081954
  → WIN (multX100=198) expected payoutPlayer=0.198 payoutHouse=0
  ✓ off-chain conservation: payoutPlayer + payoutHouse == pot (0.198)
DRY — chain skipped. Re-run with LIVE_EXECUTE=1 AFTER the user-gated HouseChannel redeploy (see header).
```

Dice run (loss case observed): `→ LOSS (multX100=0) expected payoutPlayer=0 payoutHouse=0.198` (pot
conserved). Limbo (`GAME=limbo`, target 2.00x): `→ WIN (multX100=200) payoutPlayer=0.2 payoutHouse=0`,
pot 0.2 conserved.

**Verified by the dry path:** OpenTerms build with the new shape, `paramsHashOf`,
`commitSeed`/`rngCommit`/`clientSeedCommit` derivation, `signOpenTerms` over the new typehash,
`escrowFor` sizing, the off-chain `roundRandom`→`settleRound`→payout derivation at **nonce 1** (the
contract's hardcoded nonce), and conservation (`payoutPlayer + payoutHouse == pot`, `payout <= pot`)
for both dice and limbo, win and loss.

**TypeScript:** `tsc --noEmit` over `@gibs/games-house-service` is clean for the new file (the rest of
the package was already clean).

## What remains USER-GATED — the LIVE on-chain run requires a FRESH HouseChannel deploy

The `OpenTerms` EIP-712 shape CHANGED in Tasks 1-4 (it appends `clientSeedCommit` + `paramsHash`, and
the contract gained `settleWithSeeds` + `tableCommits`). The currently-deployed 943 HouseChannel at
`DEPLOYMENT_943.houseChannel = 0x74bbc31e77c02593c0a7aad0cadadb5b6bff3948` has the **OLD** ABI: it
would reject the new terms (different typehash → different digest → bad house sig) and has no
`settleWithSeeds` selector. So `LIVE_EXECUTE=1` cannot work against it.

**The deploy is a USER-GATED step. This task did NOT deploy and did NOT run LIVE_EXECUTE.** To run live:

```
# 1. Refresh the hardhat artifact so deploy-house.ts reads the Tasks 1-4 HouseChannel ABI
cd packages/contracts && pnpm build
# 2. Dry-run the deploy (prints plan + gas; sends nothing)
MNEMONIC=… pnpm exec tsx scripts/deploy-house.ts
# 3. Broadcast (ONLY when the user approves)
DEPLOY_EXECUTE=1 MNEMONIC=… pnpm exec tsx scripts/deploy-house.ts
```

Then repoint the new HouseChannel address in:
- `examples/games/house-service/src/liveConfig.ts` (`DEPLOYMENT_943.houseChannel`)
- `examples/games/web/src/config.ts` (943 `houseChannel`)
- `examples/games/indexer/ponder.config.ts` (HouseChannel address + start block) — NOTE: the plan text
  said `deploy/games-indexer/ponder.config.ts`; the actual file lives at
  `examples/games/indexer/ponder.config.ts`.
- any settle `verifyingContract` / `makeSettleDomain` usage.

Finally:
```
LIVE_EXECUTE=1 pnpm --filter @gibs/games-house-service exec tsx scripts/recompute-round.ts
```
Expected: `approve` → `open` → `settleWithSeeds` all confirm; the script decodes `Settled` and asserts
`payoutPlayer + payoutHouse == pot` AND `payoutPlayer == off-chain expectedPayout`; prints the settle
tx URL.

## Deviations from the plan

- **Inline `houseChannelAbi` instead of the package's re-exported one.** The plan's Step 5.1 sketch
  imported `houseChannelAbi` from `@gibs/msgboard-settle`. That export is a hardhat **build artifact**
  (`@gibs/random/artifacts/.../HouseChannel.json`) which is currently STALE — it predates Tasks 1-4
  (no `settleWithSeeds`, no `tableCommits`, old `open` tuple). Using it would make the LIVE path encode
  the wrong `open` tuple and call a non-existent selector until someone re-runs `pnpm build`. To keep
  the driver self-sufficient and correct regardless of artifact freshness, I declared a minimal inline
  ABI fragment (`open` with the 11-field tuple, `settleWithSeeds`, and the `Settled` event) — the same
  pattern live-round.ts already uses for `erc20ApproveAbi` / `houseChannelClockAbi`. This also removes
  the need to rebuild the artifact just to run the script (the artifact still must be rebuilt for the
  **deploy** step, which reads it).
- **Outcome is not pre-tuned to a fixed win/loss.** The plan's live flow uses fresh random seeds, so
  the realized outcome is whatever nonce-1 yields. The script asserts the on-chain result MATCHES the
  off-chain recompute regardless of win/loss, which is the stronger invariant. (The foundry
  `SettleWithSeeds.t.sol` tests from Task 4 already pin specific win/loss seed triples deterministically.)
- **`clockBlocks` clamp only runs in LIVE mode.** The contract's MIN/MAX_CLOCK_BLOCKS read needs a live
  RPC; in dry mode the driver uses `DEFAULT_LIMITS.clockBlocks` directly so the dry path makes zero RPC
  calls (faster, offline-friendly). The clamp still runs before `open()` on the live path.

## Concerns / notes

- **Stale re-exported `houseChannelAbi`.** Independent of this task, `@gibs/msgboard-settle`'s
  `houseChannelAbi` (and `EscrowedSettlement`) bind to the committed hardhat artifact, which is older
  than the Tasks 1-4 contract. Anyone using `EscrowedSettlement.buildOpen` against the redeployed
  contract must `cd packages/contracts && pnpm build` first to regenerate the artifact, or `open` will
  encode the old 9-field tuple. Worth refreshing + committing the artifact as part of the redeploy.
- **`expiry` is a Unix timestamp.** The driver feeds `terms.expiry = now_seconds + expiryBlocks`
  (3600s = 1h), matching the contract's `block.timestamp > terms.expiry` check and live-round.ts's
  convention (`expiryBlocks` is a seconds window despite the name).
- **Nonce safety preserved.** The off-chain preview uses `roundRandom(..., 1n)` to mirror the
  contract's hardcoded `uint64(1)`; `settleWithSeeds` takes NO nonce argument, so there is nothing for
  the driver to grind. The script header documents this.
```
