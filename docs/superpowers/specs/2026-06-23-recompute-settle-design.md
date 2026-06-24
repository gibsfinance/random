# Trust-Minimized Settle via On-Chain Recompute — Track 1 (Design)

**Status:** design / awaiting approval before writing-plans
**Date:** 2026-06-23
**Supersedes for Track 1:** `2026-06-23-zk-settle-design.md` (that ZK approach moved to **Track 2 —
privacy**, where ZK is actually required).

## The decision that produced this

The goal of Track 1 is to **drop the house co-signature** — "we don't need the house's approval to
take the chips off the table." A ZK proof can do that, but so can a much simpler mechanism: the
contract recomputes the outcome itself. Since Track 1 needs trust-minimization but **not privacy**
(that's Track 2), on-chain recompute wins on every axis that matters here:

- no proving, no circuit, no new toolchain; **more** decentralized (no prover runs at all);
- cheaper on-chain (~50–100k gas keccak+math vs hundreds of k for a verifier);
- game math ports to Solidity with native `uint256` + native keccak — no 254-bit-field gymnastics.

ZK's only advantage — hiding seeds/bet/outcome — is precisely Track 2's job. So Track 1 is pure
Solidity. Program order is now: **recompute settle → ZK privacy (Noir) → Zypher cards.**

## Goal

A new permissionless settlement path on `HouseChannel`:

> Anyone submits the two revealed seeds; the contract verifies they match the commits fixed at open,
> recomputes the round randomness and the game payout **itself**, and pays out the conserved balances
> — with **no signature from either party**.

The winner (the party motivated to settle) calls it. The house cannot withhold a payout.

## What must be bound at open (the soundness core)

Dropping the co-sign removes the house's role as the off-chain enforcer of "nobody grinds." Three
things the co-sign used to bind implicitly must now be committed on-chain at open, inside the
house-signed `OpenTerms`:

1. **`rngCommit`** — already in `OpenTerms`. `keccak256(serverSeed)` for the single-draw chain.
2. **`clientSeedCommit`** *(NEW field)* — `keccak256(clientSeed)`. Without it, a player could pick a
   fresh favorable `clientSeed` *after* seeing `serverSeed` and grind a win.
3. **`params`** *(NEW field, e.g. `bytes32 paramsHash` or inline params)* — the bet itself
   (dice `targetX100`, limbo target, …). The payout depends on params, so they must be fixed before
   the outcome is known. **Note this is already implicitly true:** the house sizes `escrowHouse =
   stake*(maxMult(params)-100)/100` at open, so it *already* needs params at open — we're just making
   that binding explicit and signed. `stake` (= `escrowPlayer`) is already in `OpenTerms`.

So `OpenTerms` gains `clientSeedCommit` and a params binding; the EIP-712 `OpenTerms` typehash
changes; the house signs the extended terms. This is a contract change → a new `HouseChannel`
deployment on 943 + indexer repoint (the indexer redeploy is already a user-gated workflow).

## The settle path

```solidity
// permissionless: anyone may call; the seeds + on-chain commits are the only authorization
function settleWithSeeds(
    bytes32 tableId,
    bytes32 serverSeed,
    bytes32 clientSeed,
    uint64  nonce            // 1 for a single-draw round
) external {
    Table storage t = tables[tableId];
    if (t.status != Status.Live) revert BadStatus();
    if (keccak256(abi.encodePacked(serverSeed)) != t.rngCommit) revert BadReveal();
    if (keccak256(abi.encodePacked(clientSeed)) != t.clientSeedCommit) revert BadReveal();

    uint256 r = uint256(keccak256(abi.encode(serverSeed, clientSeed, nonce)));
    // GamePayouts dispatches on t.gameId and reproduces the TS reference math EXACTLY.
    (uint256 balancePlayer, uint256 balanceHouse) =
        GamePayouts.settle(t.gameId, r, t.params, t.escrowPlayer, t.escrowHouse);

    _payout(t, tableId, balancePlayer, balanceHouse); // existing helper; conserves the pot
}
```

- `keccak256(serverSeed)` must use the **same preimage encoding** as `rng.ts` (`buildSeedChain` hashes
  the 32-byte seed; viem `keccak256(bytes32)` ↔ Solidity `keccak256(abi.encodePacked(bytes32))`).
- `r = uint256(keccak256(abi.encode(serverSeed, clientSeed, nonce)))` is **identical** to viem's
  `roundRandom` — Solidity `abi.encode(bytes32,bytes32,uint64)` is the exact 96-byte layout, so parity
  here is structural (no field gymnastics). A foundry test still pins it against known vectors.
- Conservation (`balancePlayer + balanceHouse == escrowPlayer + escrowHouse`) is enforced inside
  `GamePayouts.settle` by construction (it returns `escrow ± delta`).

## The Solidity payout library

`GamePayouts.sol` — pure functions reproducing the TS reference exactly. **M1: dice + limbo only**
(deterministic, closed-form). Plinko/keno deferred until their paytables are frozen (placeholder in
code today).

- **dice:** `roll = r % 10_000`; `win = roll < targetX100`;
  `multX100 = 99_000_000 / targetX100`; payout `= win ? stake*multX100/100 : 0`.
- **limbo:** `u = r % 1_000_000`; `resultX100 = (99 * 1_000_000) / (1_000_000 - u)`;
  `win = resultX100 >= targetX100`; payout `= win ? stake*targetX100/100 : 0`.
- `balancePlayer = openBalancePlayer - stake + payout`; `balanceHouse = pot - balancePlayer`
  (equivalently `openBalanceHouse + stake - payout`). All `uint256`, truncating division — matches
  Solidity/JS exactly because operands are non-negative.

Parity is the top correctness risk and gets a dedicated foundry test cross-checking `GamePayouts`
against vectors generated from the TS `@gibs/msgboard-games` reference for both win and loss.

## Backward compatibility

The existing `settle(state, sigPlayer, sigHouse)` co-sign path **stays** (mode 1, for sessions that
still want optimistic mutual settlement). `settleWithSeeds` is an *additional* trustless path on the
same table — it reads the same escrow and uses the same `_payout`. No removal, only addition (plus the
two new `OpenTerms` fields).

## Decomposition (for writing-plans; not executed here)

1. **`OpenTerms` extension.** Add `clientSeedCommit` + params binding; update the EIP-712 typehash +
   `digest`; update the TS `OpenTerms` mirror + the house's `reviewOpen`/signing. Foundry + vitest:
   a round-trips-and-verifies test for the new terms.
2. **`GamePayouts.sol` — dice.** Port dice; foundry parity test vs TS vectors (win + loss).
3. **`GamePayouts.sol` — limbo.** Add limbo; parity test (win + loss).
4. **`settleWithSeeds`.** Wire the function: commit checks → `r` → `GamePayouts.settle` → `_payout`.
   Foundry tests: honest win pays player; honest loss pays house; bad serverSeed reverts; bad
   clientSeed reverts (grind attempt); wrong nonce reverts; double-settle reverts.
5. **Off-chain driver + E2E.** A TS script/test that opens a table with the new terms, exchanges
   seeds, and settles via `settleWithSeeds` — mirroring `live-round.ts` — then asserts balances +
   conservation. Run live on 943 against a freshly deployed `HouseChannel` (matches the on-chain bar
   we held for the four co-sign games).
6. **(Deferred)** plinko + keno once paytables are final.

## Risks / open points

- **Solidity↔TS game-math parity.** The settlement-correctness crux. Mitigated by per-game foundry
  parity tests against TS-generated vectors (Task 2/3). `r` parity is structural (identical encoding).
- **Seed + params binding at open.** Soundness rests entirely on `rngCommit`, `clientSeedCommit`, and
  params being fixed in the house-signed `OpenTerms`. The contract migration is a hard prerequisite,
  not optional. (Same prerequisite the ZK path would have needed.)
- **tableId/replay.** `serverSeed`/`clientSeed` are bound to a table via the table's stored commits;
  a reused `rngCommit` across tables would be a house error — `clientSeedCommit` differing per session
  makes cross-table replay fail. Settle is idempotent w.r.t. who submits (permissionless): any caller
  produces the same payout, so mempool seed-copying is harmless.
- **Reveal-griefing friction.** Winner needs the loser's seed to settle. Refuse-to-reveal → the
  existing dispute/refund clawback (`disputeFromOpen` + `resolveTimeout`, ~100-block clock, gas paid
  by the disputer, open escrow returned). Fair (no theft), but real UX friction — unchanged by this
  track and shared with any co-sign-free design.
- **No privacy.** Seeds, bet, and outcome are public on-chain (same visibility as today's public
  balances). Hiding them is Track 2's explicit purpose; on-chain recompute deliberately does not.
- **Migration.** New `HouseChannel` deployment + indexer repoint (gated workflow). The clawback script
  + the four co-sign games would point at the new address (as the last redeploy already required).
- **House-online.** Unchanged: the dealer must be online per round to exchange seeds; only on-chain
  randomness (possible future Track 4) removes that.

## Out of scope (Track 1)

Privacy / hidden amounts (Track 2); any ZK circuit or proving stack (Track 2); the Zypher card-game
class (Track 3); plinko & keno; removing the house-online requirement (Track 4, if ever).
