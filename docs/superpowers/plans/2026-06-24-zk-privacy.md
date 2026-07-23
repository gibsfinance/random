# Track 2 — ZK Privacy (Noir), Milestone 1 (off-chain proof) — Implementation Plan

**Status:** plan / ready to execute (TDD, no-placeholder)
**Date:** 2026-06-24
**Spec (source of truth — FOLLOW IT):** `docs/superpowers/specs/2026-06-24-zk-privacy-design.md`
**Builds on (BUILT, do not modify in M1):**
- `packages/contracts/contracts/games/HouseChannel.sol` (`OpenTerms`, `settleWithSeeds`, `settlementMode==2` reserved as "zk")
- `packages/contracts/contracts/games/GamePayouts.sol` (the canonical Solidity payout math)
- `examples/games/msgboard-games/src/games/{dice,limbo}.ts`, `src/rng.ts`, `src/game.ts`, `src/escrow.ts`
- Package conventions: `examples/games/msgboard-settle/{package.json,tsconfig.json}` (peer package shape)

---

## Goal

Stand up Noir in this monorepo for the first time and build an **off-chain** zero-knowledge proof that
a single-draw game round (dice + limbo, M1) was settled honestly **without revealing the bet amount,
the params, the outcome, or the payout split**. A peer builds a witness from the post-reveal
transcript, produces a Noir proof, and *any other peer verifies it off-chain (Node/vitest)*. The pot
total stays public (conservation is checked against it); everything else about the round is hidden
behind Pedersen commitments. No contract change in M1.

This is **M1 (off-chain) only**. The on-chain `settleWithProof` / `settlementMode==2` verifier is **M2,
OUT OF SCOPE** (see Out-of-Scope §). M1 is a correctness/feasibility milestone — it proves the circuit
and the pure-JS Noir toolchain, mirroring how Track 1 shipped off-chain before on-chain.

---

## Architecture

```
                    PRIVATE (witness, never leaves prover)          PUBLIC (proof public inputs)
                    ──────────────────────────────────────          ────────────────────────────
  transcript ─┐     serverSeed, clientSeed                           tableId, pot, gameId
  + blindings ┼──►  stake, bStake, params(targetX100), bParams       rngCommit, clientSeedCommit
              │     balancePlayer, bPlayer, balanceHouse, bHouse      paramsCommit
              │     (isWin, payout derived in-circuit)                Cplayer, Chouse, stakeCommit
              ▼
     ┌──────────────── Noir circuit (circuits/settle/src/main.nr) ────────────────┐
     │ keccak256(serverSeed)            == rngCommit          (keccak, on-chain-fixed)
     │ keccak256(clientSeed)            == clientSeedCommit   (keccak, on-chain-fixed)
     │ pedersen(params,  bParams)       == paramsCommit       (pedersen, cheap)
     │ pedersen(stake,   bStake)        == stakeCommit        (pedersen)
     │ pedersen(balPlayer,bPlayer)      == Cplayer            (pedersen)
     │ pedersen(balHouse, bHouse)       == Chouse             (pedersen)
     │ range(stake,128) && range(balPlayer,128) && range(balHouse,128)
     │ r = keccak256(abi_encode(serverSeed, clientSeed, 1u64))  // 96-byte preimage, viem-exact
     │ (isWin, payout) = payout(gameId, r, params, stake)       // dice & limbo, == GamePayouts.sol
     │ balPlayer == payout
     │ balPlayer + balHouse == pot                              // conservation, on cleartext, in ZK
     └────────────────────────────────────────────────────────────────────────────┘
              │ prove (noir_js + bb.js UltraHonk)                    verify (bb.js) ──► boolean
              ▼                                                              ▲
        { proof, publicInputs } ───────────────────────────────────────────┘
```

TS side (`@gibs/zk-settle`): `commit.ts` (Pedersen helpers that MUST match in-circuit `std::hash::pedersen`),
`witness.ts` (transcript/round → circuit inputs marshaller), `prove.ts` (noir_wasm compile + noir_js/bb.js
prove), `verify.ts` (bb.js verify). Depends on `@gibs/msgboard-games` for the ONE canonical source of the
game math so circuit ↔ Solidity ↔ TS all agree.

---

## Tech Stack

- **Noir** circuit (`.nr`), compiled **pure-JS** via `@noir-lang/noir_wasm` (no `nargo` binary).
- **`@noir-lang/noir_js`** + **`@aztec/bb.js`** (UltraHonk) for prove/verify. UltraHonk is transparent
  — **no per-circuit trusted-setup ceremony** (risk-retired vs Groth16; bb.js fetches/derives its SRS).
- **viem** for the keccak/abi-encode parity reference (`roundRandom`, seed commits) and Pedersen
  reference vectors.
- **vitest** (ESM), **TypeScript** `~5.8.3`, **pnpm workspace** — exactly the `@gibs/msgboard-settle`
  shape. Node 24 (repo baseline).
- `@gibs/msgboard-games` (`workspace:*`) for the canonical `dice`/`limbo`/`roundRandom` constants.

---

## Global Constraints (bake into every task)

1. **Off-chain M1 ONLY.** No Solidity, no contract change, no `settleWithProof`, no `settlementMode==2`
   verifier. Prove + verify happen in Node/vitest. (On-chain = M2, out of scope.)
2. **What is hidden vs public** (Profile B, per spec §2):
   - **PUBLIC:** `tableId`, `pot` (= `escrowPlayer + escrowHouse`), `gameId`, `rngCommit`,
     `clientSeedCommit`, `paramsCommit`, `Cplayer`, `Chouse`, `stakeCommit`.
   - **PRIVATE (witness):** `serverSeed`, `clientSeed`, `stake` (+`bStake`), `params`/`targetX100`
     (+`bParams`), `balancePlayer` (+`bPlayer`), `balanceHouse` (+`bHouse`), derived `isWin`/`payout`.
3. **The exact circuit statement** is §"Architecture" above — it is Track 1's statement with amounts
   moved to private witnesses and Pedersen commitments added as public inputs. `nonce` is **hardcoded
   `1` inside the circuit, never a witness** (same soundness rationale as `settleWithSeeds`: a free
   nonce is attacker-grindable).
4. **ONE source of truth for game math.** The circuit, `GamePayouts.sol`, and the TS reference all
   reproduce `examples/games/msgboard-games/src/games/{dice,limbo}.ts` byte-for-byte in **operation
   order** (integer floor division order is load-bearing). The TS reference in this package imports the
   real `dice`/`limbo` from `@gibs/msgboard-games` — it never re-implements them.
5. **Seed commits stay keccak** (must match the on-chain `OpenTerms` commits, contract-fixed:
   `keccak256(serverSeed)` for the seed, `keccak256(abi.encode(serverSeed,clientSeed,1u64))` for `r`).
   **Amount/param/balance commits are Pedersen** (cheap in Noir). The circuit therefore contains *both*
   hash families.
6. **dice (gameId 1) + limbo (gameId 2) only.** plinko/keno/mines deferred (placeholder paytables).
7. **256-bit `r` in a 254-bit field:** `r = uint256(keccak256(...))` is a full 256-bit value; bn254's
   scalar field is ~254 bits. `r` MUST be carried as bytes/limbs and reduced (`% 10_000`, `% 1_000_000`)
   on the wide value — never as a field element that silently wrapped at 254 bits. Its own GATE test.
8. **Pure-JS pipeline** — `@noir-lang/noir_wasm` compile, no native `nargo`. If browser-side ever,
   proving runs off the main thread (Web Worker), same rule as PoW — but M1 is Node-only.

---

## Package / File Structure (new package)

Package name **`@gibs/zk-settle`** under `examples/games/`, peer to `@gibs/msgboard-settle`. (Note:
`@gibs/zk-core` already exists — that is the unrelated Zypher ElGamal/Chaum-Pedersen world for Track 3;
do NOT touch or extend it.)

```
examples/games/zk-settle/
  package.json            # @gibs/zk-settle; deps below; "type":"module"; main/types src/index.ts
  tsconfig.json           # copy of msgboard-settle's
  vitest.config.ts        # see Task 0 (longer testTimeout for proving)
  circuits/settle/
    Nargo.toml            # manifest (read by noir_wasm; NOT compiled via nargo CLI)
    src/main.nr           # ONE circuit; gameId switch (dice+limbo); seeds keccak, amounts pedersen
  src/
    index.ts              # re-exports
    gameId.ts             # GAME_DICE=1, GAME_LIMBO=2 (mirror dice.ts/limbo.ts gameId)
    abiEncode.ts          # the 96-byte roundRandom preimage builder (viem) — parity reference
    commit.ts             # Pedersen commit helpers (TS) — MUST match in-circuit std::hash::pedersen
    witness.ts            # Round + blindings -> CircuitInputs marshaller
    compile.ts            # noir_wasm compile of circuits/settle -> CompiledCircuit (cached)
    prove.ts              # prove(inputs) -> { proof, publicInputs }
    verify.ts             # verify(proof, publicInputs) -> boolean
  test/
    toolchain.test.ts       # Task 1 GATE: compile+prove+verify a trivial circuit
    keccakParity.test.ts    # Task 2 GATE: circuit keccak/roundRandom == viem == Solidity vectors
    rRangeReduction.test.ts # Task 2 GATE: 256-bit r reduced correctly in 254-bit field
    commitParity.test.ts    # Task 3 GATE: TS commit == in-circuit pedersen; range proof pass/fail
    settleDice.test.ts      # Task 4: prove+verify a hidden-amount dice win AND loss
    settleLimbo.test.ts     # Task 5: prove+verify a hidden-amount limbo win AND loss
    e2eProof.test.ts        # Task 6: round -> witness -> prove -> independent verify; leak check
  test-circuits/            # tiny throwaway .nr fixtures used only by GATE tests (toolchain/keccak/commit)
    trivial.nr
    keccakProbe.nr
    commitProbe.nr
```

> **Pinning note:** pin `@noir-lang/noir_wasm`, `@noir-lang/noir_js`, and `@aztec/bb.js` to a **single
> mutually-compatible release line** (these three move in lockstep; a mismatch is the #1 cause of
> "ACVM/abi version" failures). Resolve the exact triple in Task 0 and pin it exactly (no `^`).

---

## Tasks (bite-sized TDD; strict sequencing)

> Gate order is mandatory: **1 → 2 → 3** must each be green before the next, and all three before any
> game logic (4+). A red gate means the foundation is wrong; do not paper over it with game code.

Run everything from the package dir unless noted:
`cd /Users/michaelmclaughlin/Documents/gibs-finance/random/examples/games/zk-settle`

---

### Task 0 — Package scaffold + dependency-triple resolution (NOT a gate, but blocks all)

**Goal:** create `@gibs/zk-settle` and resolve the exact Noir/bb.js version triple that compiles and
proves on Node 24 in this pnpm workspace.

**Produces:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts` (empty re-export stub),
pinned dep versions.

**Steps:**
1. Create `package.json`:
   ```json
   {
     "name": "@gibs/zk-settle",
     "version": "0.0.0",
     "private": true,
     "type": "module",
     "main": "src/index.ts",
     "types": "src/index.ts",
     "exports": { ".": "./src/index.ts" },
     "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
     "dependencies": {
       "@gibs/msgboard-games": "workspace:*",
       "@noir-lang/noir_js": "<PINNED>",
       "@noir-lang/noir_wasm": "<PINNED>",
       "@aztec/bb.js": "<PINNED>",
       "viem": "^2.25.0"
     },
     "devDependencies": {
       "@types/node": "^22.10.0",
       "typescript": "~5.8.3",
       "vitest": "^2.1.0"
     }
   }
   ```
2. `tsconfig.json` = copy of `examples/games/msgboard-settle/tsconfig.json` verbatim.
3. `vitest.config.ts`:
   ```ts
   import { defineConfig } from 'vitest/config'
   export default defineConfig({ test: { testTimeout: 120_000, hookTimeout: 120_000 } })
   ```
   (Proving + first-run wasm/SRS init can take tens of seconds; the default 5s timeout will flake.)
4. Resolve the triple: `pnpm add -D @noir-lang/noir_wasm@latest @noir-lang/noir_js@latest @aztec/bb.js@latest`
   in the package, then immediately pin to the resolved exact versions (strip the `^`). Record them.
5. `pnpm install` at repo root.

**Commands / expected output:**
```
pnpm install
# -> resolves; @gibs/zk-settle linked into the workspace
pnpm -C examples/games/zk-settle typecheck
# -> no errors (empty package typechecks)
```

**Concerns:** bb.js historically ships `.wasm` and may pull `@aztec/bb.js`'s threads build; in vitest
(Node, no browser) confirm the single-threaded path works. If `pnpm-workspace.yaml allowBuilds` blocks
a postinstall (it gates `esbuild`/`keccak`/`secp256k1`), add any bb.js native build there. **This task
is where "does Noir even install here" is answered — if the triple won't resolve/install cleanly, STOP
and escalate before writing circuits.** (See "Spike" note in the return.)

---

### Task 1 — GATE: toolchain bootstrap (compile + prove + verify a trivial circuit)

**This is the single highest-risk infra step — the real "does the pure-JS Noir pipeline stand up in this
monorepo" milestone. Nothing else proceeds until this is green.**

**Consumes:** the pinned triple from Task 0.
**Produces:** `test-circuits/trivial.nr`, `src/compile.ts`, `src/prove.ts`, `src/verify.ts` (generic
enough to drive any compiled circuit), `test/toolchain.test.ts` GREEN.

**TDD steps:**
1. **RED** — write `test/toolchain.test.ts` first:
   ```ts
   import { describe, it, expect } from 'vitest'
   import { compileCircuit } from '../src/compile'
   import { prove } from '../src/prove'
   import { verify } from '../src/verify'

   // trivial.nr:  fn main(x: Field, y: pub Field) { assert(x + 1 == y); }
   describe('toolchain', () => {
     it('compiles a .nr via noir_wasm and proves+verifies via noir_js+bb.js', async () => {
       const compiled = await compileCircuit('test-circuits/trivial.nr')
       const { proof, publicInputs } = await prove(compiled, { x: '3', y: '4' })
       expect(await verify(compiled, proof, publicInputs)).toBe(true)
     })

     it('rejects a proof whose public input was tampered', async () => {
       const compiled = await compileCircuit('test-circuits/trivial.nr')
       const { proof } = await prove(compiled, { x: '3', y: '4' })
       // tamper publicInputs to claim y=5
       const bad = ['0x0000...0005' as `0x${string}`]
       expect(await verify(compiled, proof, bad)).toBe(false)
     })

     it('refuses to prove an unsatisfiable witness', async () => {
       const compiled = await compileCircuit('test-circuits/trivial.nr')
       await expect(prove(compiled, { x: '3', y: '99' })).rejects.toThrow()
     })
   })
   ```
2. Write `test-circuits/trivial.nr` and a minimal `Nargo.toml` for it (name/type=bin, compiler version
   matching the pinned noir_wasm).
3. **GREEN** — implement the three wrappers with REAL code:
   ```ts
   // src/compile.ts
   import { compile, createFileManager } from '@noir-lang/noir_wasm'
   import { fileURLToPath } from 'node:url'
   import { dirname, resolve } from 'node:path'
   export type Compiled = { program: import('@noir-lang/noir_js').CompiledCircuit }
   const here = dirname(fileURLToPath(import.meta.url))
   export async function compileCircuit(entryRelToPkg: string): Promise<Compiled> {
     const pkgRoot = resolve(here, '..')
     const fm = createFileManager(pkgRoot)
     // load the entry + any deps into the file manager (read .nr files into fm)
     const { program } = await compile(fm /*, entry path config */)
     return { program }
   }
   ```
   ```ts
   // src/prove.ts
   import { Noir } from '@noir-lang/noir_js'
   import { UltraHonkBackend } from '@aztec/bb.js'
   import type { Compiled } from './compile'
   export async function prove(c: Compiled, inputs: Record<string, unknown>) {
     const noir = new Noir(c.program)
     const { witness } = await noir.execute(inputs)
     const backend = new UltraHonkBackend(c.program.bytecode)
     const { proof, publicInputs } = await backend.generateProof(witness)
     return { proof, publicInputs }
   }
   ```
   ```ts
   // src/verify.ts
   import { UltraHonkBackend } from '@aztec/bb.js'
   import type { Compiled } from './compile'
   export async function verify(c: Compiled, proof: Uint8Array, publicInputs: string[]) {
     const backend = new UltraHonkBackend(c.program.bytecode)
     return backend.verifyProof({ proof, publicInputs })
   }
   ```
   (Exact API surface — `Noir.execute`, `UltraHonkBackend.generateProof/verifyProof`, the
   `compile`/`createFileManager` signature — must be confirmed against the *pinned* versions; adjust
   shapes to match. This is expected and is what Task 1 exists to nail down.)

**Commands / expected:**
```
pnpm -C examples/games/zk-settle test -- toolchain
# -> 3 passed. First run may take 30-90s (wasm init + proving).
```

**Concerns:** (a) `createFileManager` path semantics + how multi-file `.nr` deps load — the most fiddly
part; verify with the single trivial file first. (b) bb.js `UltraHonkBackend` may need explicit
`{ threads: 1 }` or a `BB_WORKER` shim under vitest/Node. (c) ESM/wasm interop under vitest — may need
`server.deps.inline` for the noir/bb packages in `vitest.config.ts`. (d) UltraHonk SRS: transparent, no
ceremony, but the backend may download/derive an SRS on first use — ensure it works offline-ish or note
the network dependency.

---

### Task 2 — GATE: keccak parity + 256-bit-`r` reduction

**Must match byte-for-byte before ANY game logic is trusted.** This is the single highest *correctness*
risk in the track.

**Consumes:** Task 1 toolchain.
**Produces:** `test-circuits/keccakProbe.nr`, `src/abiEncode.ts`, `src/gameId.ts`,
`test/keccakParity.test.ts` + `test/rRangeReduction.test.ts` GREEN.

**The two facts to pin (from Track 1 code):**
- Seed commit: `keccak256(serverSeed)` where `serverSeed` is a 32-byte value (Solidity uses
  `keccak256(abi.encodePacked(serverSeed))` which for a single `bytes32` is just the 32 bytes — no
  padding). Reference: `HouseChannel.settleWithSeeds` L197-199, `rng.ts commitSeed`.
- Round randomness: `r = uint256(keccak256(abi.encode(serverSeed, clientSeed, uint64(1))))`. `abi.encode`
  (NOT packed) of `(bytes32, bytes32, uint64)` = **96 bytes**: 32 (serverSeed) + 32 (clientSeed) + 32
  (uint64 left-padded to 32). Reference: `HouseChannel` L201, `rng.ts roundRandom`.

**TDD steps:**
1. **RED** — `test/abiEncode.ts` reference + `test/keccakParity.test.ts`:
   ```ts
   import { describe, it, expect } from 'vitest'
   import { keccak256, hexToBigInt } from 'viem'
   import { roundRandom } from '@gibs/msgboard-games' // canonical viem impl, rng.ts
   import { roundRandomPreimage } from '../src/abiEncode'
   import { compileCircuit } from '../src/compile'
   import { prove } from '../src/prove'

   const serverSeed = '0x' + '11'.repeat(32)
   const clientSeed = '0x' + '22'.repeat(32)

   describe('keccak parity', () => {
     it('TS preimage is exactly 96 bytes and viem-equal', () => {
       const pre = roundRandomPreimage(serverSeed, clientSeed) // bytes32,bytes32,uint64(1)
       expect(pre.length).toBe(2 + 96 * 2) // 0x + 96 bytes hex
       expect(hexToBigInt(keccak256(pre))).toBe(roundRandom(serverSeed, clientSeed, 1n))
     })

     it('in-circuit keccak256(serverSeed) == viem keccak256(serverSeed)', async () => {
       // keccakProbe.nr returns keccak256(serverSeed) and roundRandom as PUBLIC outputs
       const c = await compileCircuit('test-circuits/keccakProbe.nr')
       const { publicInputs } = await prove(c, { serverSeed: bytes32ToFieldArray(serverSeed),
                                                  clientSeed: bytes32ToFieldArray(clientSeed) })
       // first public output == keccak256(serverSeed) recomposed from byte-limbs
       expect(recompose(publicInputs.slice(0, 32))).toBe(keccak256(serverSeed))
     })

     it('in-circuit r == viem r == GamePayouts r for 3 fixed vectors', async () => { /* table-driven */ })
   })
   ```
2. **RED** — `test/rRangeReduction.test.ts`: pick `serverSeed`/`clientSeed` whose `r` has the top bits
   set (so a 254-bit truncation would change `r % 10_000`); assert the circuit's `roll = r % 10_000`
   and `u = r % 1_000_000` equal viem's `roundRandom(...) % 10_000` / `% 1_000_000`. Include a vector
   where the high 2 bits matter.
3. **GREEN** — `src/abiEncode.ts`:
   ```ts
   import { encodeAbiParameters, type Hex } from 'viem'
   export function roundRandomPreimage(serverSeed: Hex, clientSeed: Hex): Hex {
     return encodeAbiParameters(
       [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint64' }],
       [serverSeed, clientSeed, 1n],
     ) as Hex
   }
   ```
4. **GREEN** — `keccakProbe.nr`: take `serverSeed`/`clientSeed` as `[u8; 32]`, build the 96-byte
   preimage in-circuit (serverSeed ‖ clientSeed ‖ uint64(1) big-endian, left-padded to 32), call
   `std::hash::keccak256`, output the 32-byte digest, and output `r` reduced two ways (`% 10000`,
   `% 1000000`) computed on the **wide** value via byte/limb arithmetic (NOT a single Field).

**Commands / expected:**
```
pnpm -C examples/games/zk-settle test -- keccakParity rRangeReduction
# -> all passed; circuit r == viem r == Solidity r for every vector
```

**Task concerns (flag explicitly):**
- **keccak-in-Noir cost + abi.encode parity:** the 96-byte preimage padding (uint64 → 32-byte
  big-endian left-pad) must match viem AND `GamePayouts.sol` `abi.encode(...,uint64(1))` byte-for-byte.
  The `keccak256(serverSeed)` single-value commit (no abi wrapper) is a *different* preimage from `r`'s
  abi.encode — keep them distinct. keccak in Noir is gate-heavy (3 keccaks dominate circuit cost: two
  seed binds + `r`); measure gate count here.
- **256-bit `r` in 254-bit field:** the footgun. `r` cannot be a single `Field`; carry it as `[u8;32]`
  or limbs and reduce on the wide value. The dedicated `rRangeReduction` test with high-bit vectors is
  the guard.
- **Endianness:** keccak output and the uint64 nonce are big-endian on the EVM/viem side; Noir byte
  arrays must match. Verify with a fixed vector, not by reasoning.

---

### Task 3 — GATE: Pedersen commitment + range-proof primitives + TS parity

**Consumes:** Task 1 toolchain.
**Produces:** `test-circuits/commitProbe.nr`, `src/commit.ts`, `test/commitParity.test.ts` GREEN.

**TDD steps:**
1. **RED** — `test/commitParity.test.ts`:
   ```ts
   import { describe, it, expect } from 'vitest'
   import { pedersenCommit } from '../src/commit'
   import { compileCircuit } from '../src/compile'
   import { prove } from '../src/prove'

   describe('pedersen + range', () => {
     it('TS pedersenCommit == in-circuit std::hash::pedersen for fixed (value,blinding)', async () => {
       const value = 1_000n, blinding = 7n
       const tsC = pedersenCommit(value, blinding)
       const c = await compileCircuit('test-circuits/commitProbe.nr')
       const { publicInputs } = await prove(c, { value: '1000', blinding: '7' })
       expect(publicInputs[0]).toBe(tsC) // circuit outputs pedersen(value,blinding) as pub
     })

     it('range proof accepts a value in [0, 2^128)', async () => {
       const c = await compileCircuit('test-circuits/commitProbe.nr')
       await expect(prove(c, { value: (2n**128n - 1n).toString(), blinding: '1' })).resolves.toBeTruthy()
     })

     it('range proof REJECTS a value >= 2^128', async () => {
       const c = await compileCircuit('test-circuits/commitProbe.nr')
       await expect(prove(c, { value: (2n**128n).toString(), blinding: '1' })).rejects.toThrow()
     })
   })
   ```
2. **GREEN** — `commitProbe.nr`: `fn main(value: Field, blinding: Field) -> pub Field { value.assert_max_bit_size::<128>(); std::hash::pedersen_hash([value, blinding]) }`
   (use the pinned-version Pedersen API — `std::hash::pedersen_hash` or `pedersen_commitment`; the
   commit is whichever the circuit will use for `Cplayer/Chouse/stakeCommit/paramsCommit`).
3. **GREEN** — `src/commit.ts`: a TS Pedersen that reproduces the in-circuit hash. **There is no
   guarantee viem exposes Noir's Pedersen** — the most robust TS reference is bb.js's own Pedersen
   (the same primitive the circuit uses), if exposed, OR derive the expected commitment by *executing a
   tiny `commitProbe` circuit* and treating its public output as the reference (the test above already
   does the cross-check direction: TS == circuit). Implement `pedersenCommit` against whatever bb.js/
   `@aztec/foundation` exposes; if none, make `commit.ts` thin over a memoized `commitProbe` execution.
   **Decide and document which in Task 3 — this is a real ambiguity (see concerns).**

**Commands / expected:**
```
pnpm -C examples/games/zk-settle test -- commitParity
# -> TS commit == circuit pedersen; in-range proves, out-of-range fails
```

**Task concerns (flag explicitly):**
- **range-proof soundness:** `assert_max_bit_size::<128>()` (or an explicit decomposition) is what stops
  a negative/overflow "balance" forgery. The **out-of-range-must-fail** test is mandatory and is the
  soundness check — a circuit that only tests the happy path is unsound. 128 bits comfortably exceeds
  any realistic chip amount while staying under the field size; confirm 128 < field bits.
- **TS↔circuit Pedersen parity ambiguity:** Noir's `std::hash::pedersen_hash` uses specific Grumpkin
  generators; an independent TS impl must use the *same* generators or it won't match. Preferred path:
  use bb.js's Pedersen export, or anchor the TS reference to the circuit's own output (as above). Do not
  hand-roll generators.

---

### Task 4 — Dice branch + hidden-amount conservation (prove+verify a real win AND loss)

**Consumes:** Tasks 1-3.
**Produces:** `circuits/settle/src/main.nr` (dice branch), `src/witness.ts`, `src/gameId.ts`,
`test/settleDice.test.ts` GREEN.

**Witness builder interface (`src/witness.ts`):**
```ts
import type { Hex } from 'viem'
export interface Round {
  gameId: number            // 1 dice, 2 limbo
  serverSeed: Hex; clientSeed: Hex
  stake: bigint; targetX100: bigint      // params for dice/limbo
  pot: bigint
  balancePlayer: bigint; balanceHouse: bigint   // the claimed split
}
export interface Blindings { bStake: bigint; bParams: bigint; bPlayer: bigint; bHouse: bigint }
export interface CircuitInputs { /* the exact field/byte-array names main.nr declares */ }
export function buildWitness(r: Round, b: Blindings): {
  inputs: CircuitInputs
  publicInputs: { tableId: Hex; pot: string; gameId: number;
                  rngCommit: Hex; clientSeedCommit: Hex; paramsCommit: Hex;
                  Cplayer: Hex; Chouse: Hex; stakeCommit: Hex }
}
```
The builder computes the public commitments with `src/commit.ts` and the seed commits with viem keccak,
so the prover and an independent verifier agree on the public inputs.

**TDD steps:**
1. **RED** — `test/settleDice.test.ts`: build a Round from `@gibs/msgboard-games`' `dice` for a known
   `(serverSeed, clientSeed, targetX100, stake)`:
   - compute `r = roundRandom(...)`, `outcome = dice.settleRound(stake, {targetX100}, r)`,
     `balancePlayer = stake + outcome.playerDelta` (payout; 0 on loss → `pot - 0`? — use the
     `GamePayouts` mapping: `balancePlayer = payout`, where payout = stake*mult/100 on win, 0 on loss),
     `balanceHouse = pot - balancePlayer`, `pot = escrowFor(stake, maxMult).{escrowPlayer+escrowHouse}`.
   - **WIN vector** (target high enough that the chosen seeds roll under): prove → verify true.
   - **LOSS vector** (roll ≥ target): `balancePlayer == 0`, `balanceHouse == pot`; prove → verify true.
   - **FORGERY vectors (must fail to prove):** claim `balancePlayer = payout + 1` (conservation/binding
     break); claim a win when the seeds give a loss; claim `balancePlayer + balanceHouse != pot`.
   ```ts
   it('proves a hidden-amount dice WIN; verifier learns only commitments + pot', async () => {
     const round = winningDiceRound()
     const { inputs, publicInputs } = buildWitness(round, blindings)
     const c = await compileCircuit('circuits/settle/src/main.nr')
     const { proof, publicInputs: pi } = await prove(c, inputs)
     expect(await verify(c, proof, pi)).toBe(true)
     // leak check: pi contains pot + commitments, but NOT stake/balance/target/seeds
     expect(JSON.stringify(pi)).not.toContain(round.stake.toString())
   })
   it('cannot prove an inflated payout', async () => {
     const round = { ...winningDiceRound(), balancePlayer: payout + 1n, balanceHouse: pot - payout - 1n }
     await expect(prove(c, buildWitness(round, blindings).inputs)).rejects.toThrow()
   })
   ```
2. **GREEN** — `circuits/settle/src/main.nr` dice branch implementing the §"Architecture" statement:
   keccak seed binds, Pedersen commit binds, range proofs, `r` (wide), dice payout **in the exact
   `GamePayouts.sol` operation order** (`roll = r % 10000`; if `roll >= target` payout 0 else
   `mult = (10000-100)*10000/target/100; payout = stake*mult/100`), `balancePlayer == payout`,
   `balancePlayer + balanceHouse == pot`. `gameId` is a public input; assert `gameId == 1` selects dice.
3. **GREEN** — `src/witness.ts` as above.

**Commands / expected:**
```
pnpm -C examples/games/zk-settle test -- settleDice
# -> win proves+verifies; loss proves+verifies; all 3 forgery vectors REJECTED
```

**Concerns:** integer floor-division order MUST equal `GamePayouts._dice` exactly (`*10000`, `/target`,
`/100`, then `stake*mult/100`) — a reordered division silently diverges on some targets. Re-use the
`dice` import for the *expected* values so the test pins parity to ONE source. Measure prove latency
here (spec target: sub-second to low-seconds for ~3-keccak + Pedersen + range).

---

### Task 5 — Limbo branch (same circuit, gameId switch; win AND loss)

**Consumes:** Task 4.
**Produces:** `main.nr` limbo branch, `test/settleLimbo.test.ts` GREEN.

**TDD steps:**
1. **RED** — `test/settleLimbo.test.ts` mirrors Task 4 using `@gibs/msgboard-games`' `limbo`:
   `u = r % 1_000_000`, `resultX100 = 99_000_000 / (1_000_000 - u)`, `win = resultX100 >= targetX100`,
   `payout = win ? stake*targetX100/100 : 0`. Win vector, loss vector, and the same forgery vectors.
2. **GREEN** — add the `gameId == 2` branch to `main.nr` (the `% 1_000_000` reduction, limbo math in
   `GamePayouts._limbo` order). Keep dice green (run both suites).

**Commands / expected:**
```
pnpm -C examples/games/zk-settle test -- settleLimbo settleDice
# -> both games, win+loss+forgery, all green
```

**Concerns:** `99_000_000 / (1_000_000 - u)` — the denominator `1_000_000 - u` is safe because `u < 1e6`,
but assert it in-circuit. Same floor-division-order parity rule as dice (pin to the `limbo` import).

---

### Task 6 — Integration / E2E (M1 done): round → witness → prove → independent verify

**Consumes:** Tasks 4-5.
**Produces:** `src/index.ts` (public API: `proveSettle`, `verifySettle`), `test/e2eProof.test.ts` GREEN.

**Public API shape (mirrors `@gibs/msgboard-settle`'s prove/verify-from-transcript intent):**
```ts
// src/index.ts
export interface SettleProof { proof: Uint8Array; publicInputs: ProofPublicInputs }
export async function proveSettle(round: Round, blindings: Blindings): Promise<SettleProof>
export async function verifySettle(p: SettleProof): Promise<boolean>
```
`verifySettle` recompiles (or reuses the cached compiled circuit) and calls bb.js verify; it is given
ONLY the public inputs + proof — never the witness — so the test proves a third party verifies without
learning amounts.

**TDD steps:**
1. **RED** — `test/e2eProof.test.ts`:
   ```ts
   it('prover and an independent verifier agree, verifier never sees private data', async () => {
     const round = realDiceWin()
     const blindings = randomBlindings()
     const { proof, publicInputs } = await proveSettle(round, blindings)
     // serialize the public bundle, drop everything else (simulate sending over the wire)
     const wire = JSON.parse(JSON.stringify({ proof: [...proof], publicInputs }))
     const verified = await verifySettle({ proof: Uint8Array.from(wire.proof), publicInputs: wire.publicInputs })
     expect(verified).toBe(true)
     // no private datum is reconstructable from `wire`
     for (const secret of [round.stake, round.balancePlayer, round.targetX100])
       expect(JSON.stringify(wire)).not.toContain(secret.toString())
   })

   it('transitional equivalence: the hidden split == the Track-1 plaintext split for the same transcript', () => {
     // recompute the public Track-1 split via GamePayouts-equivalent TS (dice/limbo + escrowFor)
     // and assert it equals the (committed) balancePlayer/balanceHouse used to build the proof.
     // This proves Track 2 settles to the SAME numbers Track 1 would, just hidden.
   })
   ```
2. **GREEN** — wire `src/index.ts` over `witness.ts` + `prove.ts`/`verify.ts`; cache the compiled
   circuit (compile once per process).

**Commands / expected:**
```
pnpm -C examples/games/zk-settle test
# -> ALL suites green (toolchain, keccakParity, rRangeReduction, commitParity,
#    settleDice, settleLimbo, e2eProof)
pnpm -C examples/games/zk-settle typecheck   # -> no errors
```

**Concerns:** the equivalence cross-check is the strongest correctness signal — it ties the hidden ZK
split to Track 1's public recompute via the shared `@gibs/msgboard-games` math. If they diverge, the
circuit math drifted from `GamePayouts`/the TS games — fix the circuit, not the test.

---

## Out of scope (explicit)

- **M2 — on-chain `settleWithProof` / `settlementMode==2` verifier.** `bb`-exported UltraHonk Solidity
  verifier, `settleWithProof(tableId, proof, publicInputs)` on `HouseChannel`, and the
  `OpenTerms.paramsHash` → `paramsCommit` contract change (redeploy + indexer repoint). This is the next
  milestone, gated on spec Decisions 2 & 3.
- **Confidential chip balances / shielded pool** (spec §9.C / Decision 3 Option C). A plaintext ERC20
  transfer reveals the amount at settle time; true on-chain amount privacy needs encrypted notes — large
  `HouseChannel`/token change, deferred.
- **Unlinkability across rounds + submitter-hiding relayer** (spec §9.D / Decision 4).
- **Hiding the pot total / the `gameId`** (spec §9.A/§9.B, stronger Profile C).
- **The denomination-ladder / bucketed-pot escrow strategy** (spec §3.4 B-pot). M1 proves the circuit
  with whatever `pot` the round carries; the collateral-leak mitigation is an M2/UX concern flagged in
  the spec (and is the load-bearing assumption behind "hide the amount" actually being private).
- **plinko + keno + mines** (placeholder paytables; keno's Fisher-Yates is materially more circuit
  work) and **multi-round play**.

---

## Cross-cutting hazards (carried from spec §5/§8)

| Hazard | Where addressed | Mitigation |
|---|---|---|
| Pure-JS Noir pipeline doesn't stand up in this monorepo | Task 0 + Task 1 (GATE) | trivial compile+prove+verify first; pin the version triple |
| keccak-in-Noir cost + `abi.encode` parity | Task 2 (GATE) | byte-for-byte vectors vs viem AND `GamePayouts` |
| 256-bit `r` in a 254-bit field | Task 2 (GATE) `rRangeReduction` | carry `r` as bytes/limbs; reduce on the wide value; high-bit vectors |
| range-proof soundness (negative/overflow forgery) | Task 3 (GATE) | `assert_max_bit_size::<128>()`; out-of-range-MUST-fail test |
| TS↔circuit Pedersen generator mismatch | Task 3 | anchor TS reference to bb.js Pedersen or the circuit's own output |
| floor-division order drift from `GamePayouts` | Tasks 4-5 | reproduce exact op order; pin expected to the `dice`/`limbo` imports |
| trusted setup | — | UltraHonk/bb is transparent, no ceremony — risk retired, noted |
| proof latency | Task 4 (measure) | target sub-second to low-seconds CPU prove |
