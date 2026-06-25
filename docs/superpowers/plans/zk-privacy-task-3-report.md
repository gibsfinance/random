# Track 2 ZK Privacy — Task 3 Report (Pedersen commitment + range proof)

**Date:** 2026-06-25
**Branch:** `feat/zk-privacy` (worktree `random-zk`)
**Package:** `examples/games/zk-settle` (`@gibs/zk-settle`)
**Status:** DONE — the in-circuit Pedersen commitment to a hidden bet amount, a range proof
bounding it, and a TS-side commitment that agrees byte-for-byte with the circuit are all GREEN
under real prove+verify. 9/9 Task-3 tests pass; full package suite 24/24; typecheck clean.

---

## TL;DR

- The bet `amount` is a PRIVATE witness; its Pedersen commitment `(x, y)` (a Grumpkin point) is the
  only PUBLIC output. A verifier learns nothing about the amount beyond "the prover knows an opening
  and it is in range".
- **Commitment parity solved via approach (a): bb.js's OWN `pedersenCommit` is the TS reference.**
  No hand-rolled Grumpkin generators. Verified empirically that
  `std::hash::pedersen_commitment([amount, blinding])` (in-circuit) ==
  `bb.pedersenCommit({ inputs:[amount, blinding], hashIndex: 0 })` (TS), byte-for-byte on BOTH x and y.
- Range proof: `amount: u64` (forced into `[0, 2^64)` by the constraint system, so never a wrapped
  negative) + `assert(amount != 0)` + `assert(amount <= MAX_AMOUNT)`. In-range proves+verifies;
  amount=0, amount=MAX+1, and a large over-max all FAIL to prove.
- RED proved with teeth: removing the two range asserts makes EXACTLY the 3 reject tests fail (prove
  wrongly succeeds), the 6 parity/in-range tests still pass. Restored; final suite green.

---

## The design decision the plan flagged — RESOLVED as approach (a)

The plan warned: Noir's `std::hash::pedersen` uses specific Grumpkin generators with no guaranteed
off-the-shelf viem/JS equivalent; do NOT hand-roll generators. Two sound options were offered:
(a) use bb.js's own Pedersen export as the TS reference, or (b) anchor TS to the circuit's output.

**Picked (a), after empirically confirming it is sound.** A throwaway probe compiled a tiny circuit
`fn main(amount, blinding) -> pub (Field, Field) { let p = std::hash::pedersen_commitment([amount,
blinding]); (p.x, p.y) }`, executed it for `(amount=12345, blinding=67890)`, and compared the result
to `BarretenbergSync.initSingleton().pedersenCommit(...)`:

```
CIRCUIT x: 2987f346466a10e7302ebad01b8fe12ab9b2a3ee74a7156e93ab53ec2188f49
CIRCUIT y: 2731fa3803373ffc0ca8273bbee59c15a9bbd229528d16af48b99137d670cd5c
BBJS hashIndex=0 x: 2987f346466a10e7302ebad01b8fe12ab9b2a3ee74a7156e93ab53ec2188f49  <-- MATCH
BBJS hashIndex=0 y: 2731fa3803373ffc0ca8273bbee59c15a9bbd229528d16af48b99137d670cd5c  <-- MATCH
BBJS hashIndex=1 x: 1d57d1068a2bf8907ea714d69500c2d728d4abd0405afd430948bcd19fcdef0f  (different sep)
```

**Why (a) is sound here:** bb.js (`@aztec/bb.js`) ships the *same* barretenberg implementation the
Noir circuit compiles its `pedersen_commitment` black-box against. Same library => same Grumpkin
generator set => generator-identical commitment. `hashIndex: 0` is the default separator Noir's
`pedersen_commitment` uses (hashIndex 1 gives a different point, as expected). So the TS reference is
not a re-derivation — it is literally the same engine, just driven from JS. This is exactly what the
plan meant by "TS and circuit share the same generator set". The probe was deleted; the parity is now
asserted permanently by the test (it would catch any future drift between bb.js and the compiled std).

The TS helper documents this rationale at `src/pedersen.ts` so nobody is tempted to "optimize" it into
a hand-rolled generator set later.

---

## What was built

```
examples/games/zk-settle/
  test-circuits/pedersenRange/         # the Task-3 circuit (its own Nargo project, no deps)
    Nargo.toml
    src/main.nr                        # range asserts + pedersen_commitment([amount as Field, blinding])
  src/
    pedersen.ts                        # pedersenCommit(amount, blinding) -> {x,y} via bb.js (approach a)
    index.ts                           # + export pedersenCommit, PedersenPoint
  test/
    pedersenRange.test.ts              # parity (4 vectors) + in-range accept (2) + out-of-range reject (3)
```

`compile.ts`/`prove.ts`/`verify.ts`/`execute.ts` are reused unchanged from Tasks 1-2.

## The circuit (`test-circuits/pedersenRange/src/main.nr`)

```rust
global MAX_AMOUNT: u64 = 1_000_000_000_000_000;  // 1e15, well under u64 max (~1.8e19)

fn main(amount: u64, blinding: Field) -> pub (Field, Field) {
    assert(amount != 0, "amount must be positive");
    assert(amount <= MAX_AMOUNT, "amount exceeds MAX_AMOUNT");
    let p = std::hash::pedersen_commitment([amount as Field, blinding]);
    (p.x, p.y)
}
```

### Commitment scheme
`commitment = pedersen_commitment([amount as Field, blinding])`, a 2-input Pedersen commitment over
Grumpkin. `amount` and `blinding` are PRIVATE witnesses; the resulting affine point `(x, y)` is the
sole PUBLIC output. With a random `blinding`, the public point is hiding (reveals nothing about the
small-domain `amount`) and binding (the prover cannot open it to a different `(amount, blinding)`).

### Range-proof construction (soundness-critical)
"Negative" and "overflow" are the same attack in a prime field: a `Field` wraps mod the bn254 prime,
so `-1` and `p-1` are indistinguishable and an unbounded amount lets a prover commit to garbage. The
construction closes this two ways:
1. **`amount: u64`** — the constraint system forces `amount` into `[0, 2^64)`. A `u64` simply cannot
   carry the wrap-around encoding of a negative number, so "no negative amounts" is structural.
2. **`assert(amount != 0)` + `assert(amount <= MAX_AMOUNT)`** — bounds it to a positive wager no
   larger than the cap. `MAX_AMOUNT = 1e15` is a representative on-chain wager cap; the over-max
   reject test uses `MAX_AMOUNT * 1000` which is still `< 2^64`, so it reaches (and trips) the assert
   rather than wrapping the `u64` itself.

Casting `amount as Field` for the commitment is safe precisely because the asserts already bound it.

---

## Tests (`test/pedersenRange.test.ts`)

### 1. Commitment parity: TS (bb.js) == in-circuit (4 fixed vectors)
For each `(amount, blinding)` the test `execute`s the circuit (the exact witness `prove` would feed
bb.js) to get `(circuitX, circuitY)`, computes the TS commitment via `pedersenCommit(amount, blinding)`,
and asserts both coordinates are equal. Vectors: small/small; `amount=1` (range floor);
`amount=MAX_AMOUNT` (range ceiling); mid amount with `blinding = bn254_r - 1` (a near-max blinding) —
so parity is not an accident of small inputs.

### 2. Range proof: in-range ACCEPTS (real prove + verify, not stubbed)
- `amount=250_000`: real `prove` -> 2 public inputs == the TS commitment `(x, y)`; real `verify` ->
  `true`. This binds the parity claim to the actual proof's public inputs, not just `execute`.
- `amount=MAX_AMOUNT` (upper boundary): proves and verifies `true`.

### 3. Range proof: out-of-range REJECTS (the soundness-critical case)
- `amount=0` -> `prove` rejects (zero/negative wager).
- `amount=MAX_AMOUNT + 1` -> `prove` rejects (just over the cap).
- `amount=MAX_AMOUNT * 1000` -> `prove` rejects (large overflow attack; still `< 2^64` so it hits the
  assert). All three throw during witness generation (the assert is unsatisfiable), so no proof is ever
  produced — verification never gets the chance to pass.

### RED proof (TDD discipline)
With the two range asserts commented out of `main.nr`, the suite was run: **exactly the 3 reject tests
failed** (prove succeeded and returned a valid `{proof, publicInputs}` for amount=0 / MAX+1 / huge),
while the 4 parity + 2 in-range tests stayed green. This confirms the reject tests genuinely exercise
the range constraint. Asserts restored; suite green.

---

## Commands + output

```
cd examples/games/zk-settle
node_modules/.bin/vitest run test/pedersenRange.test.ts
```
```
 ✓ test/pedersenRange.test.ts (9 tests) 20400ms
   ✓ commitment parity: TS (bb.js) == in-circuit  (4 vectors)
   ✓ range proof: in-range accepts (real prove + verify)
     ✓ a value within range proves and verifies, ... commitment matches the TS one  10426ms
     ✓ amount = MAX_AMOUNT (the upper boundary) still proves and verifies  7594ms
   ✓ range proof: out-of-range REJECTS (soundness-critical)  (amount=0, MAX+1, huge)
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

Full package suite (toolchain + Task 2 + Task 3): `node_modules/.bin/vitest run` -> **24 passed (24)**.
`node_modules/.bin/tsc --noEmit` -> exit **0**.

---

## Concerns / carry-forward

- **`blinding` is unconstrained on purpose.** The circuit does not range-check `blinding` (it is a full
  `Field`); that is correct for a Pedersen blinding factor — it just needs to be uniformly random and
  secret. The TS caller must supply a cryptographically random `blinding` per commitment; reusing a
  blinding across two commitments to different amounts leaks their difference. A blinding generator is
  a caller concern (Task 4+/integration), not this primitive.
- **No equality/relation binding here.** This task proves "I committed to an in-range amount". Binding
  that commitment to the on-chain wager / payout math (so the hidden amount is the SAME one the game
  settles) is the dice/limbo settle circuits (Task 4/5). This is the privacy primitive they will reuse.
- **bb.js as the single source of truth for the generators.** Because parity rests on bb.js and the
  compiled std sharing one barretenberg, a future bb.js/Noir version bump could in principle change the
  generator set on one side; the parity test is the guard that would catch it. Keep `@aztec/bb.js@4.3.1`
  and `noir@beta.20` pinned together (already enforced from Task 0).
- **Prove latency.** ~7.5-10.5s single-threaded per in-range prove under vitest (Pedersen + range is
  modest; cheaper than the 3-keccak settle probe). The parity tests use `execute` (no prove) so they
  stay sub-second per vector.
```
