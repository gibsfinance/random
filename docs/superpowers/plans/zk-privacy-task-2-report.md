# Track 2 ZK Privacy — Task 2 Report (keccak / roundRandom parity GATE)

**Date:** 2026-06-25
**Branch:** `feat/zk-privacy` (worktree `random-zk`)
**Package:** `examples/games/zk-settle` (`@gibs/zk-settle`)
**Status:** DONE — circuit keccak (both preimages) and the 256-bit-`r` reduction are byte-for-byte
equal to viem for fixed vectors INCLUDING high-bit cases. 15/15 tests green; typecheck clean.

This is the top-correctness-risk GATE: it must hold before any game-payout circuit (Tasks 4+) is
trusted, because the circuit's `r` is the entropy that decides win/loss.

---

## TL;DR

- `keccak256(serverSeed)` (seed commit, single bytes32, no abi wrapper) — in-circuit == viem. ✅
- `r = uint256(keccak256(abi.encode(serverSeed, clientSeed, uint64(1))))` (96-byte non-packed
  preimage) — in-circuit == viem == `roundRandom(...,1n)`. ✅
- The two preimages are DISTINCT and each verified separately. ✅
- `r % 10_000` and `r % 1_000_000` reduced on the WIDE 256-bit value via `[u8;32]` Horner, proven
  correct for HIGH-BIT vectors (top byte `0xe7`/`0xb6`/`0x6b`, all `r > bn254 field`), where a single
  `Field` would have wrapped at ~254 bits and changed the result. ✅
- A broken reduction (RED check) genuinely fails the test — the GATE has teeth.

---

## Test command + output

```
cd examples/games/zk-settle
node_modules/.bin/vitest run test/keccakParity.test.ts test/rRangeReduction.test.ts
```

```
 ✓ test/rRangeReduction.test.ts (4 tests) 1478ms
 ✓ test/keccakParity.test.ts (8 tests) 8695ms
   ✓ keccak parity (Task 2 GATE) > full prove+verify of the keccakProbe circuit succeeds 7105ms
 Test Files  2 passed (2)
      Tests  12 passed (12)
```

Full package suite (toolchain + Task 2): `node_modules/.bin/vitest run` → **15 passed (15)**.
`tsc --noEmit` → exit **0**.

---

## What was built

```
examples/games/zk-settle/
  vendor/keccak256/                    # vendored noir-lang/keccak256 @ 08c3f88 (2026-05-21)
    Nargo.toml                         #   type=lib; wraps std black-box keccakf1600
    src/lib.nr, src/keccak256.nr       #   (mod tests/oracle_tests/benchmarks stripped — see Gotcha 1)
  test-circuits/keccakProbe/           # the GATE circuit (its own Nargo project)
    Nargo.toml                         #   dep: keccak256 = { path = "../../vendor/keccak256" }
    src/main.nr                        #   seedCommit, r-bytes, r%10000, r%1000000 as pub outputs
  src/
    abiEncode.ts                       # roundRandomPreimage() — viem parity reference (96 bytes)
    gameId.ts                          # GAME_DICE=1, GAME_LIMBO=2 (mirror dice.ts/limbo.ts)
    execute.ts                         # noir_js execute -> decoded ABI returnValue (no prove)
    index.ts                           # re-exports the above + compile/prove/verify
  test/
    keccakParity.test.ts               # 8 tests: preimage shape, both keccaks, distinctness, r table, prove+verify
    rRangeReduction.test.ts            # 4 tests: high-bit r reduced correctly on the wide value
```

`src/compile.ts`, `prove.ts`, `verify.ts` are unchanged from Task 1 and reused as-is.

---

## The circuit (`test-circuits/keccakProbe/src/main.nr`)

```rust
use keccak256::keccak256;

// r % m on big-endian bytes, in u64 (max intermediate 256*(m-1)+255 < 2^32 for m<=1e6).
fn mod_be_bytes(bytes: [u8; 32], m: u64) -> u64 {
    let mut acc: u64 = 0;
    for i in 0..32 { acc = (acc * 256 + bytes[i] as u64) % m; }
    acc
}

fn main(serverSeed: [u8; 32], clientSeed: [u8; 32]) -> pub ([u8; 32], [u8; 32], u64, u64) {
    let seedCommit = keccak256(serverSeed, 32);          // preimage #1: single bytes32

    let mut pre: [u8; 96] = [0; 96];                     // preimage #2: abi.encode, NOT packed
    for i in 0..32 { pre[i] = serverSeed[i]; pre[32 + i] = clientSeed[i]; }
    pre[95] = 1;                                         // uint64(1) big-endian, left-padded to 32

    let rBytes = keccak256(pre, 96);
    (seedCommit, rBytes, mod_be_bytes(rBytes, 10000), mod_be_bytes(rBytes, 1000000))
}
```

### Why two distinct preimages
- **Seed commit** = `keccak256(serverSeed)`: serverSeed is a single `bytes32`; Solidity's
  `keccak256(abi.encodePacked(serverSeed))` is just those 32 raw bytes — no abi wrapper, no padding.
  (Ref `HouseChannel.settleWithSeeds` / `rng.ts commitSeed`.)
- **`r` preimage** = `abi.encode(bytes32, bytes32, uint64)` = **96 bytes**: serverSeed(32) ‖
  clientSeed(32) ‖ uint64(1) left-padded big-endian to 32. In bytes: the third 32-byte word is 24
  zero bytes + the 8-byte big-endian `1`, so only `pre[95] == 1`. (Ref `HouseChannel` L201 /
  `rng.ts roundRandom`.) The test `seedCommit preimage is DISTINCT from r preimage` asserts the two
  digests are not equal AND each equals its own viem preimage hash, so they can never be conflated.

### How the 256-bit reduction works (the footgun, handled)
`r = uint256(keccak256(...))` is a full **256-bit** value; bn254's scalar field is ~254 bits, so any
`r` with its top 2 bits set EXCEEDS the field. If `r` were a single `Field` it would silently reduce
mod p, and `r % 10_000` / `r % 1_000_000` would change. We never form that `Field`: the circuit keeps
`r` as its 32 big-endian bytes (the direct keccak256 output) and folds **Horner-style in `u64`** —
`acc = (acc * 256 + byte) % m`, most-significant byte first. The max intermediate is `256*(m-1)+255`,
under 2^32 for `m ≤ 1_000_000`, so no `u64` overflow and no field involved. This reproduces ordinary
big-integer `% m` on the true 256-bit value.

---

## Parity vectors (FIXED)

### keccakParity (r table — `keccakParity.test.ts`)
| label | serverSeed | clientSeed |
|---|---|---|
| repeated bytes | `0x11..11` | `0x22..22` |
| small ints | `0x..01` | `0x..0a` |
| mixed | `0xdeadbeef00..` | `0xab..ab` |

For each: `hexToBigInt(circuit rBytes) === roundRandom(seed,client,1n)` AND `rBytes ===
toHex(viemR,{size:32})` (byte-for-byte). Plus `keccak256(serverSeed)` parity and the distinctness check.

### rRangeReduction (HIGH-BIT — `rRangeReduction.test.ts`)
All three have `r > bn254 field` (a Field would wrap). The test first asserts each fixture genuinely
exceeds the field AND that the wrapped value would change at least one modulus (so the vectors are
load-bearing, not decorative), pins the top byte (endianness guard), then checks `roll == viemR%10000`
and `u == viemR%1000000`:

| region | serverSeed (low bytes) | clientSeed (low bytes) | top byte of r | roll=r%1e4 | u=r%1e6 |
|---|---|---|---|---|---|
| top 2 bits set (r ≥ 2^255+2^254) | `..076a99b4b1f77dd0fc` | `..0936b6928f7c3281ad` | `0xe7` | 2703 | 722703 |
| bit 255 set, 254 clear | `0x00..00` | `..165667b19e3779f9` | `0xb6` | 2698 | 82698 |
| bit 254 set (just over field) | `..01daa66d2c7ddf743f` | `..025e6e726915b63be6` | `0x6b` | 2377 | 902377 |

(Vectors precomputed deterministically and baked in — the test does no runtime search.)

---

## RED proof (TDD discipline)

Replacing the reduction `acc = (acc*256 + byte) % m` with `acc = (acc + byte) % m` (drop the `*256`)
makes `rRangeReduction` fail 3/4 with `expected 4128n to be 2703n` (and 3833≠2698, 4552≠2377) — i.e.
the GATE catches a broken wide-value reduction. Restored immediately; final suite green.

---

## Gotchas hit (forward notes for Task 3+)

### Gotcha 1 — `keccak256` is NO LONGER in the Noir stdlib (the blocker)
In Noir 1.0 (beta.20) `keccak256` was extracted from `std::hash` into a separate library
`github.com/noir-lang/keccak256`. `std::hash::keccak256(...)`, `use std::hash::keccak256`, and a bare
`keccak256(...)` all fail to resolve. The std still exposes the **black-box permutation**
`std::hash::keccakf1600` — the library is a thin sponge over it.
**Fix:** vendored the library into `vendor/keccak256/` (commit `08c3f88`, 2026-05-21) and referenced it
as a **local path dependency** (`keccak256 = { path = "../../vendor/keccak256" }`) — `noir_wasm` resolves
path deps from disk; no `nargo` git-dep fetch needed (consistent with the pure-JS pipeline rule). Had to
**strip `mod tests; mod oracle_tests; mod benchmarks;`** from the vendored `keccak256.nr` (those submodule
files weren't vendored and the compiler errored on the missing modules). Verified ASCII-only comments.
The vendored lib is reused verbatim by the real `circuits/settle` in Task 4.

### Gotcha 2 — `compileCircuit` takes a project DIR, not a `.nr` path
As Task 1 established (and the plan's Task-2 sketch got slightly wrong: it shows
`compileCircuit('test-circuits/keccakProbe.nr')`), `compileCircuit` resolves a **Nargo project
directory**. So the probe is `test-circuits/keccakProbe/` (`Nargo.toml` + `src/main.nr`), and the test
calls `compileCircuit('test-circuits/keccakProbe')`. Same generalizes to `circuits/settle/`.

### Gotcha 3 — endianness verified by vector, not by reasoning (per plan)
keccak output and the uint64 nonce are big-endian on the viem/EVM side. The in-circuit byte layout
(`pre[95]=1`, big-endian `[u8;32]` r) matches because the parity tests pin the exact top byte of r and
the full 32-byte digest — confirmed against viem, not argued.

### Non-issue / note — gate count
`acirGetCircuitSizes` on the raw `program.bytecode` threw `expected msgpack format marker ... got 31`
because bb.js 4.3.1 returns the ACIR **gzipped** (0x1f = gzip magic) and the helper wants it
decompressed — a measurement-only snag, not a proving problem. The prove path itself logged the
circuit as **66 public inputs / 500 fields** and proved+verified in ~7s single-threaded under vitest
(3 keccaks: one 32-byte seed-commit + one 96-byte r + the keccakf1600 permutations). Budget similar or
more for the full settle circuit; if a precise gate count is wanted later, gunzip the bytecode before
`acirGetCircuitSizes`.

---

## Concerns / carry-forward
- **keccak is gate-heavy.** Two keccaks here (seed commit + r) already dominate this probe. The settle
  circuit adds a second seed-chain bind, so ~3 keccaks; watch prove latency as the circuit grows.
- **One source of truth.** The TS parity references import the REAL `roundRandom` from
  `@gibs/msgboard-games` — they never re-implement it. Keep that discipline for dice/limbo math (Task 4/5
  must import the real `dice`/`limbo`, not re-derive).
- **nonce is hardcoded 1** in both the circuit (`pre[95]=1`) and `roundRandomPreimage` — never a witness,
  per Global Constraint 3. Do not parameterize it.
```
