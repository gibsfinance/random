# Track 2 ZK Privacy — Task 5 Report (limbo PRIVACY settle: hidden amounts + conservation)

**Date:** 2026-06-25
**Branch:** `feat/zk-privacy` (worktree `random-zk`)
**Package:** `examples/games/zk-settle` (`@gibs/zk-settle`)
**Status:** DONE — the limbo privacy settle circuit binds both seeds, recomputes the limbo payout in
the EXACT `GamePayouts`/`limbo.ts` op-order (including the `r % 1_000_000` reduction, NOT 10000), and
asserts conservation between the HIDDEN (Pedersen-committed) amounts. A real WIN and a real LOSS both
prove+verify under UltraHonk; three forged witnesses fail to prove. 5/5 Task-5 tests pass; full package
suite 34/34; typecheck clean.

---

## TL;DR

- Mirror of Task 4 (dice), swapping the payout body for limbo. The bet `stake` and the open/final
  player+house balances are PRIVATE witnesses; only their five Pedersen commitments are PUBLIC. An
  independent verifier checks conservation between the COMMITTED values without learning any amount.
- REUSES the Task-2 keccak machinery (vendored `keccak256` lib, the 96-byte abi.encode `r` preimage,
  the wide 256-bit Horner reduction) and the Task-3 Pedersen primitive
  (`std::hash::pedersen_commitment([amount as Field, blinding])`, hashIndex 0, bb.js parity) verbatim.
- **The reduction modulus is `1_000_000`, NOT `10_000`** — limbo's `u = raw % 1e6`. The same
  `mod_be_bytes` Horner reduction is high-bit-safe for `m = 1e6` (max intermediate
  `256*(m-1)+255 = 256_000_255 < 2^32`, so the u64 arithmetic never overflows).
- limbo payout reproduced in the EXACT `limbo.ts`/`GamePayouts._limbo` operation order:
  `u = r % 1_000_000; resultX100 = (99 * 1_000_000) / (1_000_000 - u); win = resultX100 >= targetX100;
  payout = win ? stake * targetX100 / 100 : 0`. (`LIMBO_ONE_MINUS_EDGE_X100 = (10000-100)/100 = 99`,
  `LIMBO_U_SPACE = 1_000_000`.)
- Conservation: SAME case-split construction as Task 4 — `playerDelta = win ? payout - stake : -stake`,
  written as two non-negative u64 equalities per arm so no negative is ever formed in-field.
- RED proven with teeth: neutering the conservation asserts makes EXACTLY the 3 forgery tests fail
  (prove wrongly succeeds) while WIN+LOSS stay green. Restored; final suite green.

---

## The circuit statement as built (`test-circuits/limboSettle/src/main.nr`)

```
PUBLIC INPUTS  : rngCommit        [u8; 32]   (= keccak256(serverSeed))
                 clientSeedCommit [u8; 32]   (= keccak256(clientSeed))
                 targetX100       u64         (the target multiplier in hundredths — public)
PRIVATE        : serverSeed, clientSeed       [u8; 32] each
                 stake, openBalancePlayer, openBalanceHouse,
                 finalBalancePlayer, finalBalanceHouse   (u64, hidden amounts)
                 stakeBlinding ... finalBalanceHouseBlinding   (Field, one per amount)
ASSERTS        : keccak256(serverSeed) == rngCommit          (seed bind, nonce 1)
                 keccak256(clientSeed) == clientSeedCommit
                 r = uint256(keccak256(abi.encode(serverSeed, clientSeed, uint64(1))))
                 u = r % 1_000_000                           (WIDE 256-bit reduction, modulus 1e6)
                 100 <= targetX100 <= 99_000_000
                 stake != 0; all five amounts <= MAX_AMOUNT (1e15)
                 resultX100 = (99 * 1_000_000) / (1_000_000 - u)
                 win = resultX100 >= targetX100
                 payout = win ? stake * targetX100 / 100 : 0
                 CONSERVATION (case-split, below)
PUBLIC OUTPUTS : the five Pedersen commitments (x, y) to the hidden amounts.
```

bb.js orders `pub` params first, then the `pub` return tuple:
`rngCommit(32) ‖ clientSeedCommit(32) ‖ targetX100(1) ‖ [5 × (x, y)] (10)` = **75 public inputs**.
The test slices the trailing 10 as the commitment fields.

### Hidden-vs-public table (the plan's privacy split)
| datum | role | how it appears to a verifier |
|---|---|---|
| serverSeed, clientSeed | private | only via `rngCommit` / `clientSeedCommit` keccak digests |
| targetX100 | **public** | a public input (it is the target multiplier / bet odds, not secret) |
| stake | private | only its Pedersen commitment (x, y) |
| openBalancePlayer / openBalanceHouse | private | only their Pedersen commitments |
| finalBalancePlayer / finalBalanceHouse | private | only their Pedersen commitments |

---

## limbo math fidelity (exact op-order vs `limbo.ts`)

`limbo.settleRound` (in `examples/games/msgboard-games/src/games/limbo.ts`):
```ts
const u = raw % U_SPACE                       // U_SPACE = 1_000_000n
const resultX100 = (ONE_MINUS_EDGE_X100 * U_SPACE) / (U_SPACE - u)  // 99 * 1e6 / (1e6 - u)
const win = resultX100 >= params.targetX100
if (!win) return { playerDelta: -stake }
const playerDelta = (stake * params.targetX100) / HUNDREDTHS - stake // stake*target/100 - stake
```
The circuit performs the identical integer ops in the identical order: `u = r % 1_000_000`, then
`(99 * 1_000_000) / (1_000_000 - u)`, then the `>=` comparison, then `stake * targetX100 / 100` for the
win payout. `u ∈ [0, 999_999]` so the denominator `1_000_000 - u ∈ [1, 1_000_000]` is never zero
(matching the TS, which can never divide by zero either). The circuit derives `r`/`u` itself from the
committed seeds; the TS vectors are produced by the REAL `roundRandom` + `limbo.settleRound` (imported,
never re-derived).

---

## Conservation construction (the soundness core — identical to Task 4)

`playerDelta` is SIGNED (a win moves chips player←house, a loss the reverse), but the amounts are `u64`,
where forming a negative would wrap mod the bn254 prime and be unsound. So conservation is two
case-split u64 equalities that never form a negative:

```rust
if win {
    assert(payout >= stake, "win payout below stake");       // target >= 100 -> payout >= stake
    let gain = payout - stake;                                // = +playerDelta, always >= 0 on a win
    assert(finalBalancePlayer == openBalancePlayer + gain);      // finalP = openP + delta
    assert(finalBalanceHouse + gain == openBalanceHouse);        // finalH = openH - delta (subtraction off witness side)
} else {
    assert(openBalancePlayer >= stake, "player cannot cover stake");
    assert(finalBalancePlayer + stake == openBalancePlayer);     // finalP = openP - stake  (delta = -stake)
    assert(finalBalanceHouse == openBalanceHouse + stake);       // finalH = openH + stake
}
```

`finalH + gain == openH` (not `finalH == openH - gain`) keeps subtraction off the witness side so a
malicious `finalH` cannot underflow-wrap to satisfy it. The pot is conserved by construction in both
arms (`finalP + finalH == openP + openH`), which the WIN test also asserts on the TS side. The win-arm
`payout >= stake` holds for every valid limbo target: `payout = stake * targetX100 / 100` and
`targetX100 >= 100` (the MIN_TARGET range assert) => `payout >= stake`.

Because the commitments are the public inputs and the amounts are private, an external verifier learns
ONLY the five (x, y) points; it nonetheless gets a proof those committed amounts satisfy conservation
against the limbo outcome derived from the committed seeds — the exact privacy property the plan asked
for.

---

## Win / loss vectors (FIXED, targetX100 = 500 == 5.00x, nonce 1) — outcomes VERIFIED

Found by a deterministic search over the REAL `roundRandom` + `limbo.settleRound` from
`@gibs/msgboard-games` (the search and the test import them; the math is never re-derived). Per the
Track-1 note (limbo win/loss seed labels were once swapped), each vector's ACTUAL outcome at nonce 1 was
verified before use — and the test asserts `outcome.win` / `outcome.playerDelta` up front so a future
seed/label drift fails loudly. stake = 1000, openP = 8000, openH = 6000 (house chosen to cover the
+4000 win payout; open balances chosen so no hidden amount coincidentally equals the public
`targetX100 = 500`).

| vector | serverSeed | clientSeed | u | resultX100 | win | playerDelta | finalP | finalH |
|---|---|---|---|---|---|---|---|---|
| WIN  | `0x..01` | `0x..02` | 984557 | 6410 (>= 500) | true  | +4000 | 12000 | 2000 |
| LOSS | `0x..01` | `0x..01` | 218468 | 126 (< 500)   | false | −1000 | 7000  | 7000 |

(WIN: payout = 1000·500/100 = 5000, delta = 5000−1000 = +4000. LOSS: resultX100 126 < 500 → payout 0 →
delta = −stake = −1000. Pot 14000 conserved in both.)

Forgery-3's substitute seed `serverSeed = 0x..3e7 (999)` with `clientSeed = 0x..02` at nonce 1 was
verified to be a LOSS (delta −1000), so against the WIN-conserved amounts (delta +4000) the recomputed
conservation breaks.

---

## Tests (`test/limboSettle.test.ts`) — 5 tests

1. **real WIN proves + verifies; commitments match TS; amounts hidden** — asserts the real outcome
   (`win=true`, `delta=+4000`) first; real `prove`; the 75 public inputs' trailing 10 equal the
   TS-built `pedersenCommit` of each amount, byte-for-byte; none of the five hidden amounts appears as a
   raw public input (only `targetX100`, which is legitimately public); real `verify` → `true`. Also
   asserts `finalP+finalH == openP+openH`.
2. **real LOSS proves + verifies; payout 0; conservation holds** — asserts the real outcome
   (`win=false`, `delta=-1000`) first; real `prove` + `verify` → `true`; the conserved loss amounts
   (finalP 7000, finalH 7000) are pinned.
3. **forgery: wrong finalBalancePlayer (finalP+1) fails to prove** — conservation assert bites.
4. **forgery: wrong finalBalanceHouse (finalH−1) fails to prove** — conservation assert bites.
5. **forgery: wrong serverSeed (b32(999)) fails to prove** — the substituted seed's nonce-1 outcome is
   a LOSS (delta −1000) against the WIN-conserved amounts (delta +4000); conservation against the
   recomputed `r` breaks; witness generation throws. (The seeds are also bound by the keccak asserts;
   the test always passes the true commit of the witness seed, so the live failure mode is conservation
   against the recomputed outcome.)

### RED proof (TDD discipline)
With the conservation `if win {...} else {...}` block replaced by `let _ = win; let _ = payout;`, the
suite was rerun: **exactly the 3 forgery tests failed** (prove succeeded and returned
`{proof, publicInputs}` for the wrong finalP, wrong finalH, and wrong-seed witnesses), while the WIN +
LOSS tests stayed green. This confirms the forgery tests genuinely exercise the conservation
constraint. Asserts restored; suite green.

---

## Commands + output

```
cd examples/games/zk-settle
node_modules/.bin/vitest run test/limboSettle.test.ts
```
```
 ✓ test/limboSettle.test.ts (5 tests) 12725ms
   ✓ a real WIN proves+verifies; public commitments match the TS ones; amounts stay hidden  6224ms
   ✓ a real LOSS proves+verifies; payout 0; conservation holds  5754ms
   ✓ soundness: forged witnesses FAIL to prove > wrong finalBalancePlayer ... conservation bites
   ✓ soundness: forged witnesses FAIL to prove > wrong finalBalanceHouse ... conservation bites
   ✓ soundness: forged witnesses FAIL to prove > wrong serverSeed ... seed bind bites
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

RED check (conservation neutered):
```
 ❯ test/limboSettle.test.ts (5 tests | 3 failed)
   ✓ a real WIN proves+verifies ...
   ✓ a real LOSS proves+verifies ...
   × ... wrong finalBalancePlayer ... conservation bites
   × ... wrong finalBalanceHouse ... conservation bites
   × ... wrong serverSeed ... seed bind bites
      Tests  3 failed | 2 passed (5)
```

Full package suite (toolchain + Task 2 + Task 3 + Task 4 + Task 5): `node_modules/.bin/vitest run` →
**34 passed (34)**. `node_modules/.bin/tsc --noEmit` → exit **0**.

### Gate count / prove time
bb.js logs the compiled circuit as **75 public inputs / 500 fields** on every prove (same keccak-
dominated size as Task 4's diceSettle — three keccaks plus five Pedersen commits dominate; the limbo
vs dice difference is only the payout arithmetic, which is negligible against the keccak gates). Real
single-threaded UltraHonk prove+verify is ~5.7–11.5s per vector under vitest. (A precise ACIR gate
count needs the bytecode gunzipped before `acirGetCircuitSizes` — bb.js 4.3.1 ships ACIR gzipped, the
same measurement-only snag noted in Task 2/4; the prove path's field count is used here instead.)

---

## What was built / changed

```
examples/games/zk-settle/
  test-circuits/limboSettle/           # the Task-5 circuit (its own Nargo project)
    Nargo.toml                         #   dep: keccak256 = { path = "../../vendor/keccak256" }
    src/main.nr                        #   seed binds + limbo payout (exact op-order, r % 1e6) + conservation + 5 commits
  src/
    limboSettle.ts                     # limboOutcome (real roundRandom+limbo), limboSettleCommitments,
                                       #   commitmentsToPublicInputs, limboSettleInputs (+ types)
    index.ts                           # + export the limboSettle surface (commitmentsToPublicInputs
                                       #   re-exported as limboCommitmentsToPublicInputs to avoid a name clash)
  test/
    limboSettle.test.ts                # WIN + LOSS prove/verify, 3 forgery rejects
```

`compile.ts`/`prove.ts`/`verify.ts`/`execute.ts`/`pedersen.ts`, the vendored `keccak256` lib, and the
Task-2 abiEncode reference are reused unchanged.

---

## Concerns / carry-forward

- **`targetX100` is public on purpose** (it is the target multiplier / bet odds, like the on-chain
  params). A future variant wanting hidden odds would move it to a committed witness with its own range
  proof.
- **The `r % 1_000_000` modulus is the one limbo-specific reduction subtlety.** It is wider than dice's
  `% 10_000` but still comfortably high-bit-safe in the u64 Horner reduction (`256_000_255 < 2^32`).
  This was the explicit IMPORTANT note in the task and is the single thing that differs in the seed→u
  path vs Task 4.
- **Conservation binds the COMMITTED amounts, not an external escrow.** The circuit proves "these five
  committed amounts are internally consistent with the limbo outcome of the committed seeds". Binding
  those commitments to on-chain channel state is an integration concern (later task).
- **Blindings are caller-supplied and unconstrained (correct).** As in Task 3/4, each amount needs a
  fresh random blinding; reusing one across two commitments leaks their difference. The test uses fixed
  distinct blindings for determinism; production must randomize.
- **Single-draw, nonce 1 only.** Per Global Constraint 3 the nonce is hardcoded 1 in both the circuit
  (`pre[95]=1`) and the TS preimage; multi-round play is out of scope for this primitive.
- **Loss-arm `openBalancePlayer >= stake` is a guard, not the conservation itself** — it ensures the
  player could cover the stake (no underflow). The win arm's `payout >= stake` holds for all valid
  limbo targets (`targetX100 >= 100`) and is asserted for safety.
```

---

## Task-5 review fix: limbo payout overflow

**Finding (Important).** The limbo win payout was computed as `payout = stake * targetX100 / 100`
in **u64**. With in-range witnesses (`stake <= MAX_AMOUNT == 1e15`, `targetX100 <= LIMBO_MAX_TARGET
== 99_000_000`) the intermediate `stake * targetX100` reaches ~9.9e22, which exceeds **u64 max
(1.844e19)**. Noir range-constrains the u64 multiply, so this is NOT a soundness/steal hole (it can
never wrap to a false proof) — but for an in-range *winning* witness whose product overflows, the
OLD circuit aborted the proof with an opaque **"attempt to multiply with overflow"** instead of
computing the payout and letting the conservation/cap asserts decide. That is a DoS / divergence
from the canonical bigint `limbo.ts` (whose `(stake * targetX100) / 100` is arbitrary-precision).
Dice is unaffected: its multiplier ceiling (~9900) keeps the product < u64 max.

**Honest scope note (verified arithmetically).** A *conserving* win can never overflow: conservation
bounds `payout <= ~2 * MAX_AMOUNT == 2e15`, hence `product = payout * 100 <= ~2e17 << u64 max`
(92x margin). So the literal "high-stake win that conserves yet overflows" cannot exist given the
range asserts — the overflow region is only reachable by NON-conserving witnesses. The real,
demonstrable defect is therefore the **opaque multiply-abort vs. meaningful rejection** divergence
for in-range winning witnesses, captured as a RED below.

**Fix (surgical — payout arithmetic only).** Widen the win-payout multiply into **u128** (max
~3.4e38, ample for 9.9e22), floor-divide by 100 there (native integer division, EXACT same op-order
as `limbo.settleRound`), then narrow back to u64 under an explicit guard
`assert(wide <= U64_MAX_AS_U128, "limbo: payout exceeds u64 (non-conserving)")` so the narrowing can
never silently truncate (which could otherwise let a wrapped payout slip past conservation). Every
conserving win's payout is `<= ~2e15 << u64 max`, so it always fits and proves; the seed bind, the
`% 1e6` reduction, the case-split conservation, and the Pedersen commitments are UNCHANGED.

**RED captured (old arithmetic).** In-range WIN witness `serverSeed = 0x..01`, `clientSeed = 0x..3b`
(59), `targetX100 = 19000`, `stake = MAX_AMOUNT (1e15)` -> canonical `limbo.settleRound` wins
(`product 1.9e19 > u64 max`); the OLD circuit aborted with `Circuit execution failed: attempt to
multiply with overflow`. After the fix the same witness is rejected by a MEANINGFUL assert
(`payout exceeds u64 (non-conserving)` / conservation), never the arithmetic overflow.

**GREEN high-stake-win vector (proves + parity).** `serverSeed = 0x..01`, `clientSeed = 0x..09`,
`targetX100 = 9900 (99.00x)`, `stake = 1e13` -> WIN, `playerDelta = +9.8e14`,
`payout = (1e13 * 9900) / 100 == 9.9e14 (<= MAX_AMOUNT)`, wide product `9.9e16` (exercises the
u128 path). The in-circuit payout equals `limbo.settleRound`'s bigint payout exactly (asserted in
the test), the conserved balances (openP 0 / openH 1e15 -> finalP 9.8e14 / finalH 2e13) conserve the
pot, and the proof PROVES + VERIFIES with commitments matching the TS-built ones.

**Verify output.**
```
test/limboSettle.test.ts (7 tests) — all pass, incl:
  - Task-5 review fix: a legitimate HIGH-STAKE win (wide product 9.9e16) proves+verifies; payout == limbo.settleRound
  - Task-5 review fix: in-range overflow win rejected by a MEANINGFUL assert (not a u64-multiply abort)
Full package suite: 7 test files, 43 tests passed (incl. settleE2E.test.ts limbo path), tsc --noEmit clean.
```
