# Track 2 ZK Privacy — Task 0 + Task 1 Report (Noir standup GATE)

**Date:** 2026-06-25
**Branch:** `feat/zk-privacy` (off `feat/recompute-settle`)
**Package:** `examples/games/zk-settle` (`@gibs/zk-settle`)
**Status:** DONE — the pure-JS Noir prove/verify pipeline stands up in this monorepo. Real
compile + prove + verify of a trivial circuit is GREEN under vitest on Node 24.

---

## The pinned version triple (exact, no `^`)

```jsonc
"@noir-lang/noir_js":   "1.0.0-beta.20",
"@noir-lang/noir_wasm": "1.0.0-beta.20",
"@aztec/bb.js":         "4.3.1",
```

(`@noir-lang/acvm_js`, `@noir-lang/noirc_abi`, `@noir-lang/types` are pulled transitively, all
`1.0.0-beta.20`.) Node `v24.15.0`, pnpm `11.0.8`, vitest `2.1.9`, TypeScript `~5.8.3`.

> **This is NOT the triple the Noir docs tutorial advertises.** The current noirjs tutorial pairs
> `noir_js@1.0.0-beta.20` with `@aztec/bb.js@3.0.0-nightly.20251104` — that pairing is **WRONG** and
> does not prove (see "Gotcha 2" below). The working pair is **beta.20 + bb.js 4.3.1**, resolved
> empirically.

---

## Test command + output (the GATE)

```
cd examples/games/zk-settle
node_modules/.bin/vitest run test/toolchain.test.ts
```

```
 ✓ test/toolchain.test.ts (3 tests) 2275ms
   ✓ toolchain > compiles a .nr via noir_wasm and proves+verifies via noir_js+bb.js 866ms
   ✓ toolchain > rejects a proof whose public input was tampered
   ✓ toolchain > refuses to prove an unsatisfiable witness
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

`pnpm -C examples/games/zk-settle typecheck` (`tsc --noEmit`) → exit 0.

**Real prove+verify passed:** YES. The trivial circuit `fn main(x: Field, y: pub Field){assert(x+1==y)}`
is compiled by `noir_wasm`, executed to a witness by `noir_js`, proved to a 16000-byte UltraHonk proof
with 1 public input by `bb.js`, and verified `true`. A tampered public input verifies `false`; an
unsatisfiable witness (`x=3,y=99`) throws during execution. Sub-second prove (~430-870ms) for this size.

---

## What was built (Task 0 + Task 1 only)

```
examples/games/zk-settle/
  package.json            # @gibs/zk-settle; pinned triple above; type:module; src/index.ts entry
  tsconfig.json           # verbatim copy of msgboard-settle's
  vitest.config.ts        # testTimeout/hookTimeout 120_000 (proving + first-run SRS can be slow)
  src/index.ts            # stub re-export (PACKAGE const) — filled out in Task 6
  src/compile.ts          # noir_wasm createFileManager + compile -> { program } (CompiledCircuit)
  src/prove.ts            # noir_js execute -> witness; bb.js UltraHonkBackend.generateProof
  src/verify.ts           # bb.js UltraHonkBackend.verifyProof
  test/toolchain.test.ts  # the GATE: compile + prove + verify + tamper + unsat
  test-circuits/          # a real Nargo project (Nargo.toml + src/main.nr) — the trivial circuit
    Nargo.toml
    src/main.nr
```

Tasks 2-6 (keccak parity, r-reduction, pedersen, dice, limbo, e2e) are NOT implemented — out of scope
for this gate.

---

## Integration gotchas hit, and how each was solved

### Gotcha 1 — `msgpackr-extract` postinstall gate (`ERR_PNPM_IGNORED_BUILDS`)
`@aztec/bb.js@3.0.0-nightly.*` → `msgpackr` → optional native `msgpackr-extract`. pnpm's `allowBuilds`
gate (in `pnpm-workspace.yaml`) blocked it and pnpm inserted a stub `msgpackr-extract: set this to
true or false` line, breaking `pnpm install` (exit 1).
**This is moot on the final pin:** `bb.js@4.3.1` does not pull a build-script-gated native dep, so
install is clean with the workspace `allowBuilds` untouched. (If a future bb.js reintroduces it,
set `msgpackr-extract: false` in `allowBuilds` — the pure-JS msgpackr fallback is fine under Node.)

### Gotcha 2 — the docs' advertised triple does NOT prove ("Length is too large") — THE BIG ONE
First attempt used the noirjs-tutorial pair `noir@1.0.0-beta.20` + `bb.js@3.0.0-nightly.20251104`.
Compile + witness execution worked, but `backend.generateProof` / even `acirGetCircuitSizes` /
`acirInitSRS` threw **`Error: Length is too large`** from inside the bb wasm — i.e. the bb wasm could
not deserialize the ACIR that `noir_wasm@beta.20` emits. This is the classic ACIR/ABI-version skew the
plan flagged as the #1 failure mode.

**Root cause (resolved by checking npm publish dates, not the docs):**
- `noir … beta.20` (stable) was published **2026-04-13**.
- `bb.js 3.0.0-nightly.20251104` is dated **2025-11-04** — on that date the active Noir line was
  **beta.14/beta.15**, NOT beta.20. The tutorial's "beta.20 + nightly.20251104" string is internally
  inconsistent (mismatched across doc revisions). They are ~5 months / many ACIR-format changes apart.

**Fix:** probe bb.js versions current at beta.20's release against the actual beta.20-compiled ACIR.
`bb.js@4.3.1` (the stable `latest` line at the time of this work, post-beta.20) **parses the beta.20
ACIR cleanly** (`acirGetCircuitSizes` → `[36, 64]`, real gate counts) and proves+verifies. Stable
`3.0.x` / `4.1.x` / `4.2.x` failed differently (`this.api.circuitProve is not a function` — see Gotcha 3).
**Pinned `bb.js@4.3.1`.**

### Gotcha 3 — bb.js 4.x `UltraHonkBackend` constructor signature changed
The plan's sketch (and bb.js ≤3.x) used `new UltraHonkBackend(bytecode, { threads: 1 })`. In
**bb.js 4.x the signature is `new UltraHonkBackend(bytecode, api)`** where `api` is an
**already-initialized `Barretenberg` instance**. Passing the old `{threads}` options bag as the second
arg makes `this.api.circuitProve` undefined → `TypeError: this.api.circuitProve is not a function`.
**Fix:** `const api = await Barretenberg.new({ threads: 1 }); new UltraHonkBackend(bytecode, api)`, and
`await api.destroy()` in a `finally`. (`circuitProve`/`circuitVerify`/`circuitComputeVk` live on the
`Barretenberg` instance.)

### Gotcha 4 — Noir only allows ASCII in comments
`noir_wasm` compile rejected `src/main.nr` with `Non-ASCII character in comment` because a doc comment
contained an em-dash (`—`). **Fix:** ASCII-only in `.nr` source (use `-`). Worth knowing before Task 2+.

### Gotcha 5 — `createFileManager` wants a real Nargo project, not a loose `.nr` file
`compile(fileManager)` (the high-level `compile_program` alias) resolves a **Nargo project**: a
directory with `Nargo.toml` + `src/main.nr`. The plan's `compileCircuit('test-circuits/trivial.nr')`
(a bare file path) does not match this API. **Fix:** `test-circuits/` is a real Nargo project
(`Nargo.toml`, `src/main.nr`), and `compileCircuit(projectDir)` takes the **project directory** and uses
`createNodejsFileManager(dir)` (the Node FS file manager) so multi-file `.nr` deps will load from disk
as `nargo` would. This generalizes cleanly to the real `circuits/settle/` project in Task 4+.

### Non-issue — threading & SRS under Node/vitest
- **Threading:** ran fine single-threaded (`Barretenberg.new({ threads: 1 })`); no SharedArrayBuffer /
  cross-origin-isolation / worker shim needed under Node/vitest. No `server.deps.inline` was required —
  the wasm/ESM interop worked out of the box with vitest 2.1.9.
- **SRS:** UltraHonk is transparent (no per-circuit ceremony). On the FIRST prove, bb.js fetches a small
  SRS from `https://crs.aztec.network/g1.dat` and caches it to `~/.bb-crs/` (32 KB for this circuit
  size; grows with circuit size). **There IS a one-time network dependency to `crs.aztec.network` on the
  first prove of a given size** — flag for CI (allowlist that host, or pre-warm `~/.bb-crs` / set
  `CRS_PATH`). It is offline thereafter for circuits ≤ the cached size.

---

## Forward notes for Task 2+
- Keep `.nr` comments ASCII-only.
- The real circuit lives at `circuits/settle/` as its own Nargo project (mirror `test-circuits/`);
  `compileCircuit('circuits/settle')` will Just Work.
- `prove`/`verify` return/consume `{ proof: Uint8Array, publicInputs: string[] }` (32-byte hex strings).
- bb.js 4.3.1 prove latency for a 36-gate circuit is sub-second; budget more for the 3-keccak settle
  circuit (Task 2 measures gate count).
