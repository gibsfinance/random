# Track 2 ZK Privacy — Task 4 Report (dice PRIVACY settle: hidden amounts + conservation)

**Date:** 2026-06-25
**Branch:** `feat/zk-privacy` (worktree `random-zk`)
**Package:** `examples/games/zk-settle` (`@gibs/zk-settle`)
**Status:** DONE — the dice privacy settle circuit binds both seeds, recomputes the dice payout in
the EXACT `GamePayouts`/`dice.ts` op-order, and asserts conservation between the HIDDEN (Pedersen-
committed) amounts. A real WIN and a real LOSS both prove+verify under UltraHonk; three forged
witnesses fail to prove. 5/5 Task-4 tests pass; full package suite 29/29; typecheck clean.

---

## TL;DR

- The bet `stake` and the open/final player+house balances are PRIVATE witnesses. Only their five
  Pedersen commitments are PUBLIC. An independent verifier checks conservation between the COMMITTED
  values without learning a single amount.
- The circuit REUSES the Task-2 keccak machinery (vendored `keccak256` lib, the 96-byte abi.encode
  `r` preimage, the wide 256-bit `r % 10000` Horner reduction) and the Task-3 Pedersen primitive
  (`std::hash::pedersen_commitment([amount as Field, blinding])`, hashIndex 0, bb.js parity) verbatim
  — no reimplementation.
- Dice payout reproduced in the EXACT `dice.ts`/`GamePayouts._dice` operation order:
  `roll = r % 10000; win = roll < targetX100; multX100 = (10000 - 100) * 10000 / targetX100 / 100;
  payout = win ? stake * multX100 / 100 : 0`.
- Conservation: `finalP == openP + playerDelta`, `finalH == openH − playerDelta`, where
  `playerDelta = win ? payout − stake : −stake`. Implemented as two case-split u64 equalities so no
  negative is ever formed in-field (see "Conservation construction").
- RED proven with teeth: removing the conservation asserts makes EXACTLY the 3 forgery tests fail
  (prove wrongly succeeds) while WIN+LOSS stay green. Restored; final suite green.

---

## The circuit statement as built (`test-circuits/diceSettle/src/main.nr`)

```
PUBLIC INPUTS  : rngCommit        [u8; 32]   (= keccak256(serverSeed))
                 clientSeedCommit [u8; 32]   (= keccak256(clientSeed))
                 targetX100       u64         (the bet odds — public)
PRIVATE        : serverSeed, clientSeed       [u8; 32] each
                 stake, openBalancePlayer, openBalanceHouse,
                 finalBalancePlayer, finalBalanceHouse   (u64, hidden amounts)
                 stakeBlinding ... finalBalanceHouseBlinding   (Field, one per amount)
ASSERTS        : keccak256(serverSeed) == rngCommit          (seed bind, nonce 1)
                 keccak256(clientSeed) == clientSeedCommit
                 r = uint256(keccak256(abi.encode(serverSeed, clientSeed, uint64(1))))
                 roll = r % 10_000                            (WIDE 256-bit reduction)
                 1 <= targetX100 <= 9899
                 stake != 0; all five amounts <= MAX_AMOUNT (1e15)
                 win = roll < targetX100
                 multX100 = (10000 - 100) * 10000 / targetX100 / 100
                 payout   = win ? stake * multX100 / 100 : 0
                 CONSERVATION (case-split, below)
PUBLIC OUTPUTS : the five Pedersen commitments (x, y) to the hidden amounts.
```

The `pub` params come first in bb.js's `publicInputs` ordering, then the `pub` return tuple:
`rngCommit(32) ‖ clientSeedCommit(32) ‖ targetX100(1) ‖ [5 × (x, y)] (10)` = **75 public inputs**.
The test slices the trailing 10 as the commitment fields.

### Hidden-vs-public table (the plan's privacy split)
| datum | role | how it appears to a verifier |
|---|---|---|
| serverSeed, clientSeed | private | only via `rngCommit` / `clientSeedCommit` keccak digests |
| targetX100 | **public** | a public input (it is the bet odds, not secret) |
| stake | private | only its Pedersen commitment (x, y) |
| openBalancePlayer / openBalanceHouse | private | only their Pedersen commitments |
| finalBalancePlayer / finalBalanceHouse | private | only their Pedersen commitments |

---

## Conservation construction (the soundness core)

`playerDelta` is SIGNED (a win moves chips player←house, a loss the reverse), but the amounts are
`u64`, where forming a negative would wrap mod the bn254 prime and be unsound. So conservation is
written as two case-split u64 equalities that never form a negative:

```rust
if win {
    assert(payout >= stake, "win payout below stake");      // dice mult > 100 for target <= 9899
    let gain = payout - stake;                               // = +playerDelta, always >= 0 on a win
    assert(finalBalancePlayer == openBalancePlayer + gain);     // finalP = openP + delta
    assert(finalBalanceHouse + gain == openBalanceHouse);       // finalH = openH - delta (no subtraction underflow)
} else {
    assert(openBalancePlayer >= stake, "player cannot cover stake");
    assert(finalBalancePlayer + stake == openBalancePlayer);    // finalP = openP - stake  (delta = -stake)
    assert(finalBalanceHouse == openBalanceHouse + stake);      // finalH = openH + stake
}
```

`finalH + gain == openH` (rather than `finalH == openH - gain`) keeps the subtraction off the witness
side so a malicious `finalH` cannot underflow-wrap to satisfy it; the equality is checked in u64 with
both sides non-negative. The pot is conserved by construction in both arms
(`finalP + finalH == openP + openH`), which the WIN test also asserts on the TS side.

Because the commitments are the public inputs and the amounts are private, an external verifier learns
ONLY the five (x, y) points; it nonetheless gets a proof that those committed amounts satisfy
conservation against the dice outcome derived from the committed seeds — the exact privacy property the
plan asked for.

---

## Win / loss vectors (FIXED, target = 5000 == 50.00%, nonce 1)

Found by a deterministic search over the REAL `roundRandom` + `dice.settleRound` from
`@gibs/msgboard-games` (the test imports them; it never re-derives the math). stake = 1000,
openP = 8000, openH = 2000 (open balances chosen so no hidden amount coincidentally equals the public
`targetX100 = 5000`, so the "amounts stay hidden" check flags a real leak, not a value collision).

| vector | serverSeed | clientSeed | roll | win | playerDelta | finalP | finalH |
|---|---|---|---|---|---|---|---|
| WIN  | `0x..01` | `0x..08` | 485  | true  | +980  | 8980 | 1020 |
| LOSS | `0x..02` | `0x..0f` | 7423 | false | −1000 | 7000 | 3000 |

(WIN: multX100 = 9900·10000/5000/100 = 198, payout = 1000·198/100 = 1980, delta = 1980−1000 = +980.
LOSS: roll 7423 ≥ 5000 → payout 0 → delta = −stake = −1000. Pot 10000 conserved in both.)

---

## Tests (`test/diceSettle.test.ts`) — 5 tests

1. **real WIN proves + verifies; commitments match TS; amounts hidden** — real `prove`; the 75 public
   inputs' trailing 10 equal the TS-built `pedersenCommit` of each amount, byte-for-byte; none of the
   five hidden amounts appears as a raw public input (only `targetX100`, which is legitimately public);
   real `verify` → `true`. Also asserts `finalP+finalH == openP+openH`.
2. **real LOSS proves + verifies; payout 0; conservation holds** — real `prove` + `verify` → `true`;
   the conserved loss amounts (finalP 7000, finalH 3000) are pinned.
3. **forgery: wrong finalBalancePlayer (openP+delta+1) fails to prove** — conservation assert bites.
4. **forgery: wrong finalBalanceHouse (openH−delta−1) fails to prove** — conservation assert bites.
5. **forgery: wrong serverSeed (b32(999)) fails to prove** — feeding a different serverSeed (whose
   nonce-1 outcome is a LOSS, delta −1000) against the WIN-conserved amounts (delta +980) breaks
   conservation against the recomputed `r`; witness generation throws. (The seeds are also bound by the
   keccak asserts; the test always passes the true commit of the witness seed, so the single, clear
   failure mode is conservation against the recomputed outcome.)

### RED proof (TDD discipline)
With the conservation `if win {...} else {...}` asserts replaced by no-ops, the suite was rerun:
**exactly the 3 forgery tests failed** (prove succeeded and returned `{proof, publicInputs}` for the
wrong finalP, wrong finalH, and wrong-seed witnesses), while the WIN + LOSS tests stayed green. This
confirms the forgery tests genuinely exercise the conservation constraint. Asserts restored; suite
green.

---

## Commands + output

```
cd examples/games/zk-settle
node_modules/.bin/vitest run test/diceSettle.test.ts
```
```
 ✓ test/diceSettle.test.ts (5 tests) 20183ms
   ✓ a real WIN proves+verifies; public commitments match the TS ones; amounts stay hidden  6674ms
   ✓ a real LOSS proves+verifies; payout 0; conservation holds  12262ms
   ✓ soundness: forged witnesses FAIL to prove > wrong finalBalancePlayer ... conservation bites
   ✓ soundness: forged witnesses FAIL to prove > wrong finalBalanceHouse ... conservation bites
   ✓ soundness: forged witnesses FAIL to prove > wrong serverSeed ... seed bind bites
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Full package suite (toolchain + Task 2 + Task 3 + Task 4): `node_modules/.bin/vitest run` →
**29 passed (29)**. `node_modules/.bin/tsc --noEmit` → exit **0**.

### Gate count / prove time
bb.js logs the compiled circuit as **75 public inputs / 500 fields** on every prove (same 500-field
keccak-dominated size as the Task-2 keccakProbe: three keccaks — seed commit + client commit + the
96-byte `r` — plus five Pedersen commitments dominate). Real single-threaded UltraHonk prove+verify
is ~6.5–12s per vector under vitest (similar to Task 2/3; the privacy circuit adds the second seed
keccak + five Pedersen commits but is in the same ballpark). (A precise ACIR gate count needs the
bytecode gunzipped before `acirGetCircuitSizes` — bb.js 4.3.1 ships ACIR gzipped, the same
measurement-only snag noted in Task 2; the prove path's field count is used here instead.)

---

## What was built / changed

```
examples/games/zk-settle/
  test-circuits/diceSettle/            # the Task-4 circuit (its own Nargo project)
    Nargo.toml                         #   dep: keccak256 = { path = "../../vendor/keccak256" }
    src/main.nr                        #   seed binds + dice payout (exact op-order) + conservation + 5 commits
  src/
    diceSettle.ts                      # diceOutcome (real roundRandom+dice), diceSettleCommitments,
                                       #   commitmentsToPublicInputs, diceSettleInputs (+ types)
    index.ts                           # + export the diceSettle surface
  test/
    diceSettle.test.ts                 # WIN + LOSS prove/verify, 3 forgery rejects
```

`compile.ts`/`prove.ts`/`verify.ts`/`execute.ts`/`pedersen.ts`, the vendored `keccak256` lib, and the
Task-2 abiEncode reference are reused unchanged.

---

## Concerns / carry-forward

- **`targetX100` is public on purpose** (it is the bet odds, like the on-chain params). If a future
  variant wants the odds hidden too, it would move to a committed witness with its own range proof.
- **Conservation binds the COMMITTED amounts, not an external escrow.** The circuit proves "these five
  committed amounts are internally consistent with the dice outcome of the committed seeds". Binding
  those commitments to the on-chain channel state (so the SAME hidden amounts are the ones the contract
  escrows/settles) is an integration concern (later task) — here the commitments are the public
  interface a settlement contract would consume.
- **Blindings are caller-supplied and unconstrained (correct).** As in Task 3, each amount needs a
  fresh cryptographically-random blinding; reusing a blinding across two commitments leaks their
  difference. The test uses fixed distinct blindings for determinism; production must randomize.
- **Single-draw, nonce 1 only.** Per Global Constraint 3 the nonce is hardcoded 1 in both the circuit
  (`pre[95]=1`) and the TS preimage; multi-round play is out of scope for this primitive.
- **Loss-arm `openBalancePlayer >= stake` is a guard, not the conservation itself** — it ensures the
  player could cover the stake (no underflow). The win arm's `payout >= stake` holds for all valid
  targets (multX100 > 100 for target <= 9899) and is asserted for safety.
```
