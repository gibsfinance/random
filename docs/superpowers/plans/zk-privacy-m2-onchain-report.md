# ZK Track 2 — Milestone 2: on-chain private settlement (`settlementMode == 2`)

**Status:** built + green (this branch `feat/zk-m2-onchain`, base `feat/zk-privacy`)
**Date:** 2026-06-25

M2 adds the on-chain ZK settle path the M1 spec deferred: a generated UltraHonk Solidity verifier +
a `HouseChannel.settleWithProof` (mode 2) that verifies a proof on-chain and settles — keeping mode 0
(co-sign) and mode 1 (recompute / `settleWithSeeds`) working unchanged. It is **additive**.

## What mode 2 IS (and how it differs from mode 1)

Mode 1 (`settleWithSeeds`, Track-1 recompute) publishes BOTH seeds in calldata and recomputes the
payout in Solidity. Mode 2 (`settleWithProof`) keeps `serverSeed` and `clientSeed` as **private
witnesses inside a zero-knowledge proof** — they never hit the chain. The proof attests, in ZK, the
exact same statement mode 1 recomputes:

> `keccak256(serverSeed) == rngCommit` ∧ `keccak256(clientSeed) == clientSeedCommit` (nonce 1) ∧
> `r = uint256(keccak256(abi.encode(serverSeed, clientSeed, 1)))` ∧
> `payoutPlayer == dicePayout(r, targetX100, escrowPlayer)` ∧ `payoutPlayer <= pot`.

The win on-chain is **seed privacy** (the house need not reveal its server seed to settle). The bet
odds (`targetX100`) and the chip amounts stay public because on-chain settlement moves real ERC20
chips — a public ledger event. (M1's off-chain circuit additionally hides the amounts via Pedersen
commitments; that stronger statement only makes sense off-chain, where no chips move and the contract
never needs a Grumpkin opening it cannot do in Solidity. So M2 uses a **public-balance** circuit
variant, `diceSettleOnchain`, sharing M1's seed-binding + payout + conservation core.)

## The verifier-generation command (reproducible)

```
pnpm --filter @gibs/zk-settle gen:onchain-verifier
```

Script: `examples/games/zk-settle/scripts/genOnchainVerifier.ts`. All pure-JS via **bb.js 4.3.1** — no
native `bb` or `nargo` binary is installed in this environment, and none is needed:

1. compile `test-circuits/diceSettleOnchain` with `noir_wasm`;
2. `UltraHonkBackend.generateProof(witness, { verifierTarget: 'evm' })` — the **EVM (keccak)** flavour
   the Solidity verifier checks (a poseidon/off-chain-flavour proof would NOT verify on-chain);
3. assert the proof verifies in-process (a hard gate — a broken toolchain fails at generation);
4. `getVerificationKey({ verifierTarget: 'evm' })` + `getSolidityVerifier(vk)` →
   `packages/contracts/contracts/zk/generated/DiceSettleHonkVerifier.sol` (contract `HonkVerifier`);
5. write the Foundry fixture `packages/contracts/test/foundry/fixtures/diceSettleOnchainProof.json`
   (real proof bytes + the 68 public inputs + the human-readable round).

The first prove fetches the SRS from `crs.aztec.network` into `~/.bb-crs` (cached). One reproducible
post-process is applied to the generated `.sol`: the body pragma `^0.8.27` → `>=0.8.26` (a version-floor
relaxation only — see "Toolchain" below). This is done IN the generator, so a regen is idempotent.

## The binding design (how a proof ties to THIS table — anti-replay)

`settleWithProof(tableId, params, payoutPlayer, proof)`:

The 68 public inputs the contract feeds the verifier are **reconstructed from the table's own stored
state**, not from caller input (`HouseChannel._buildPublicInputs`):

| public input            | source                                    | binds |
|-------------------------|-------------------------------------------|-------|
| `rngCommit[0..31]`      | `t.rngCommit` (house-signed at open)      | server seed → this table |
| `clientSeedCommit[0..31]`| `t.clientSeedCommit` (house-signed)      | client seed → this table |
| `targetX100`            | `abi.decode(params)`, `keccak(params)==t.paramsHash` | the bet, fixed at open |
| `escrowPlayer`          | `t.escrowPlayer`                          | the stake/pot |
| `escrowHouse`           | `t.escrowHouse`                           | the pot |
| `payoutPlayer`          | caller (but itself a bound public input)  | the proven split |

Because `rngCommit`/`clientSeedCommit` come from the table, a proof generated for a **different table**
(different commits) produces a different Fiat-Shamir transcript and `verify()` fails — replay across
channels is impossible. `params` is bound to the house-signed `paramsHash`. The nonce is **hardcoded 1**
in the circuit (single-draw), the same soundness rule as `settleWithSeeds`: a caller-grindable nonce is
unsound. `payoutPlayer` is the only caller value, and it is a bound public input — an over-claim makes
the proof fail to verify (proven by `test_wrongPayoutReverts`). The contract pays `payoutPlayer` to the
player and `pot - payoutPlayer` to the house pool via the existing `_payout` (conserves the pot).

`OpenTerms` already carried `clientSeedCommit` + `paramsHash` from the recompute-settle (mode-1) work;
M2 reuses them verbatim — no `OpenTerms`/typehash change was needed.

The verifier is wired per-game by the owner: `setProofVerifier(gameId, verifier)`. Mode 2 is opt-in;
`settleWithProof` reverts `NoVerifier` if none is set, so it never blocks modes 0/1.

## Gas

`settleWithProof` (UltraHonk verify + ERC20 settle), from `test_gas_settleWithProof`:

```
settleWithProof gas (verify + settle): 3,174,093
```

Standalone `HonkVerifier.verify()` (no settle): ~2,775,746 gas. The UltraHonk on-chain verify dominates;
the settle adds ~0.4M (escrow transfer + pool update). This is the expected order for an UltraHonk EVM
verifier and is the number to weigh against mode-1 recompute (~50–100k) when choosing a path — mode 2
buys seed privacy at ~3.1M gas.

## Tests (all green — see "Verification" for exact output)

- **`examples/games/zk-settle/test/diceSettleOnchain.test.ts`** (vitest, real prove/verify):
  honest WIN + honest LOSS prove & verify; public-input shape; **soundness** — a witness claiming a
  wrong `payoutPlayer` cannot be proven (execution throws). 4/4.
- **`packages/contracts/test/foundry/DiceSettleVerifier.t.sol`** (zkverify profile): the generated
  verifier accepts the real fixture proof; a tampered proof reverts; a tampered public input reverts. 3/3.
- **`packages/contracts/test/foundry/SettleWithProof.t.sol`** (zkm2 profile): valid proof settles &
  conserves (payout == Track-1 math); tampered proof reverts; **replay across a different channel
  reverts**; wrong payout reverts; wrong params reverts; no-verifier reverts; double-settle reverts;
  **mode 1 still works**; gas report. 10/10.

## Toolchain notes / why the extra Foundry profiles

The generated UltraHonk verifier needs **solc ≥ 0.8.26** (it uses `require(cond, CustomError())`) and
**viaIR:false** (it hits Yul stack-too-deep under viaIR — the same constraint the vendored uzkge
PlonkVerifier has). The games + `HouseChannel`/Solady need **solc 0.8.25 + viaIR**. These are
irreconcilable in one compilation unit, so:

- **`[profile.zkverify]`** (solc 0.8.27, viaIR:false, evm_version shanghai — still pre-cancun, no
  MCOPY/TSTORE): compiles + deploys the verifier; runs `DiceSettleVerifier.t.sol`.
- **`[profile.zkm2]`** (solc 0.8.25, viaIR — the games' settings; `out` shared with zkverify): compiles
  `HouseChannel` + the integration test, which does **not** import the verifier source — it deploys the
  verifier from the pre-built zkverify artifact (`vm.deployCode` reads the bytecode; the test links the
  one external library `ZKTranscriptLib` by substituting its deployed address into the creation
  bytecode's link placeholder, then CREATE). The etched/deployed verifier is the genuine generated
  contract — the on-chain verify is real, not stubbed.
- **`[profile.default]`** is untouched for the game suite (63 tests still green); it skips the two M2
  tests.

Run order (the integration test consumes the verifier artifact the probe builds):
```
FOUNDRY_PROFILE=zkverify forge test --match-path 'test/foundry/DiceSettleVerifier.t.sol'
FOUNDRY_PROFILE=zkm2     forge test --match-path 'test/foundry/SettleWithProof.t.sol'
```

## Blocked / deferred to a future milestone

- **Limbo on-chain verifier.** M2 ships the **dice** on-chain circuit + verifier only. The limbo
  on-chain circuit/verifier is a mechanical repeat (same pattern, `limbo` payout math) and is deferred;
  `settleWithProof` already dispatches per `gameId` via `proofVerifier[gameId]`, so adding limbo is just
  generating a second verifier + circuit and wiring it. **TODO:** add `test-circuits/limboSettleOnchain`
  + `gen:onchain-verifier` limbo output + a limbo verifier contract.
- **No native `bb`/`nargo` binary.** Generation runs entirely through bb.js 4.3.1's
  `getSolidityVerifier`; if a future toolchain prefers the `bb contract` CLI, the script is the place to
  swap it. Not blocked — the JS path works end-to-end here.
- **Amount privacy on-chain.** Deliberately out of scope (chips are public on-chain). The committed-amount
  M1 statement stays off-chain. A hidden-amount on-chain settle would need an on-chain Grumpkin/Pedersen
  opening (not available in Solidity) or a different commitment scheme — a separate research milestone.
- **Verifier size / mainnet deploy.** The verifier is ~50 KiB runtime (over the 24 KiB EIP-170 limit).
  It deploys fine in the Foundry EVM and on chain 943 if 170 is relaxed there; a mainnet deploy would
  need the verifier split or an L2. Noted, not addressed here.
