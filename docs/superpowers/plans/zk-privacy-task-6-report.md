# Track 2 ZK Privacy — Task 6 Report (off-chain M1 E2E integration — the M1 deliverable)

**Date:** 2026-06-25
**Branch:** `feat/zk-privacy` (worktree `random-zk`)
**Package:** `examples/games/zk-settle` (`@gibs/zk-settle`)
**Status:** DONE — a single unified API (`proveSettle` / `verifySettle`) ties Tasks 2-5 together end to
end for BOTH games. A real dice round and a real limbo round each go round → witness → PROVE →
INDEPENDENT verify; the proven conserved balances equal what Track-1 (`dice`/`limbo.settleRound`) would
produce for the same round; the hidden amounts never appear in the public inputs; and the verifier
rejects tampered public inputs, a wrong-game proof, and a conservation-violating witness. 7/7 Task-6
tests pass; full package suite 41/41; typecheck clean.

---

## TL;DR

- **One clean API over Tasks 4+5.** `proveSettle(round)` / `verifySettle(proof, publicInputs, game)`
  cover dice + limbo with the SAME five-amount witness/commitment shape; the only per-game difference is
  which circuit project compiles (`test-circuits/diceSettle` vs `…/limboSettle`) and which
  `*SettleInputs` builder runs — both selected by `round.game`. No new crypto: the circuits, witness
  builders, Pedersen primitive and prove/verify seams are reused verbatim.
- **Real prove + INDEPENDENT verify.** `proveSettle` returns `{ proof, publicInputs, commitments,
  amounts }`; `verifySettle` is given ONLY `{ proof, publicInputs, game }` (never the witness). It
  UltraHonk-verifies the proof and confirms the public-input shape (trailing 10 fields are the five
  non-trivial commitment points), learning no hidden amount.
- **Track-1 equivalence cross-check (the privacy-doesn't-change-the-math proof).** `trackOneSettle(round)`
  runs the REAL public recompute (`roundRandom` + `dice`/`limbo.settleRound`) to produce the conserved
  final balances; the test asserts the PROVEN settlement's `finalBalancePlayer`/`finalBalanceHouse`
  equal those Track-1 values for the same round. The privacy circuit and the public recompute agree on
  the outcome — privacy only hides it.
- **Hiding asserted.** For both wins, the test checks none of the five hidden amounts (stake, open/final
  player+house balances) appears anywhere in `publicInputs` — only the seed commits, `targetX100`, and
  the five commitment points are public.
- **RED proven with teeth (two independent neuterings).** (A) Corrupting the Track-1 baseline (+1 on
  finalP) makes the conserved witness violate the in-circuit `finalP conservation` assert → 6/7 tests
  fail at witness generation. (B) Skipping the cryptographic proof check in `verifySettle` makes the
  tamper-rejection and wrong-game-rejection tests fail (verify wrongly returns true). Both restored;
  final suite green.

---

## The E2E API (`src/settle.ts`)

```ts
type SettleGame = 'dice' | 'limbo'

interface SettleRound {
  game: SettleGame
  serverSeed: Hex; clientSeed: Hex      // private; bound to public keccak commits
  targetX100: bigint                    // public (bet odds / target multiplier)
  stake: bigint                         // private (hidden amount)
  openBalancePlayer: bigint             // private
  openBalanceHouse: bigint              // private
  blindings: SettleBlindings            // one fresh blinding per hidden amount
}

// Track-1 (recompute) baseline — the public settle math the circuit must agree with.
function trackOneSettle(round): SettleOutcome           // { win, playerDelta, finalP, finalH }
function settleAmounts(round): SettleAmounts            // the conserved five amounts

// PROVE: build conserved witness from Track-1, run the matching game circuit, return proof + commits.
async function proveSettle(round): Promise<SettleProof> // { game, proof, publicInputs, commitments, amounts }

// INDEPENDENT VERIFY: proof + publicInputs + game only (no witness, no amounts).
async function verifySettle(proof, publicInputs, game, expectedCommitments?): Promise<boolean>
```

A compiled-circuit cache (`circuitFor`) memoizes the slow `compileCircuit` step per game so prove +
verify reuse one compile. The optional `expectedCommitments` arg lets a verifier who was independently
handed the commitments (e.g. from on-chain channel state) assert the proof is bound to exactly those
points — still without any amount.

### The two flows (dice + limbo), end to end

```
SettleRound (real seeds/stake/balances + targetX100, game)
   │
   │  trackOneSettle: r = roundRandom(serverSeed, clientSeed, 1); o = <game>.settleRound(stake, {targetX100}, r)
   ▼            finalP = openP + o.playerDelta ;  finalH = openH - o.playerDelta   (the conserved five amounts)
proveSettle ──► <game>SettleInputs(witness) ──► prove (UltraHonk) ──► { proof, publicInputs, commitments }
   │
   ▼  publicInputs = rngCommit(32) ‖ clientSeedCommit(32) ‖ targetX100(1) ‖ [5 × (x,y)] = 75 fields
verifySettle(proof, publicInputs, game)  ──► UltraHonk verify == true  AND  commitment-tail well-formed
   │
   ▼  EQUIVALENCE: proof.amounts.finalP/finalH  ==  trackOneSettle(round).finalP/finalH    (test assert)
```

Both games share this flow verbatim; dice uses `diceSettleInputs` + `test-circuits/diceSettle`, limbo
uses `limboSettleInputs` + `test-circuits/limboSettle`.

---

## Track-1 equivalence cross-check (what it proves)

The privacy circuit (Task 4/5) derives `r` from the committed seeds and asserts conservation
(`finalP == openP + delta`, `finalH == openH - delta`) between the HIDDEN amounts. `trackOneSettle`
runs the SAME `roundRandom` + `dice`/`limbo.settleRound` that Track-1's on-chain recompute mirrors, and
computes `finalP`/`finalH` from `openP`/`openH` ± the public `playerDelta`. The test asserts the proven
settlement's conserved balances equal the Track-1 ones:

| round | Track-1 win | Track-1 delta | proven finalP | proven finalH | == Track-1? |
|---|---|---|---|---|---|
| DICE WIN  | true  | +980  | 8980  | 1020 | yes |
| DICE LOSS | false | −1000 | 7000  | 3000 | yes |
| LIMBO WIN | true  | +4000 | 12000 | 2000 | yes |
| LIMBO LOSS| false | −1000 | 7000  | 7000 | yes |

Because `proveSettle` BUILDS the witness from `trackOneSettle` and the circuit independently re-derives
`r` from the committed seeds and re-checks conservation, a passing prove + this equality is a live proof
that the privacy circuit and the public recompute produce the identical outcome for the same round —
the math is unchanged, only the amounts are hidden. The RED check confirms this is load-bearing: a +1
drift in the Track-1 baseline makes the witness fail the circuit's conservation assert (it does not
silently pass).

---

## What is proven HIDDEN

The verifier sees exactly these 75 public inputs and nothing else:
`rngCommit [u8;32]` ‖ `clientSeedCommit [u8;32]` ‖ `targetX100 (u64)` ‖ five Pedersen commitment points
`(x,y)` (10 fields). Hidden (private witnesses, appearing only via their keccak/Pedersen commitments):
`serverSeed`, `clientSeed`, `stake`, `openBalancePlayer`, `openBalanceHouse`, `finalBalancePlayer`,
`finalBalanceHouse`, and the five blindings. The test (`assertAmountsHidden`) asserts none of the five
amounts appears as any public-input field; the win vectors choose balances that never coincide with the
public `targetX100`, so the check flags a real leak rather than a value collision.

---

## Tests (`test/settleE2E.test.ts`) — 7 tests

1. **DICE WIN** — Track-1 baseline asserted (win, +980, finalP 8980 / finalH 1020); `proveSettle`;
   independent `verifySettle` → true; conserved balances == Track-1; pot conserved; amounts hidden;
   `verifySettle(..., commitments)` (bound-to-these-commitments) → true.
2. **DICE LOSS** — Track-1 (loss, −1000); prove + independent verify → true; conserved == Track-1;
   amounts hidden.
3. **LIMBO WIN** — Track-1 (win, +4000, finalP 12000 / finalH 2000); prove + verify → true; conserved
   == Track-1; pot conserved; amounts hidden; bound-commitments verify → true.
4. **LIMBO LOSS** — Track-1 (loss, −1000); prove + verify → true; conserved == Track-1; amounts hidden.
5. **rejects tampered public input** — flip one commitment field of a real dice proof; `verifySettle`
   → false (the proof is bound to the original public inputs).
6. **rejects conservation-violating witness** — a witness with `finalP + 1` (breaks conservation)
   cannot be proven at all; `prove` rejects (the in-circuit conservation assert bites at witness
   generation).
7. **rejects wrong-game circuit** — a dice proof checked under the limbo circuit → false.

### RED proof (TDD discipline) — two independent neuterings

- **(A) Track-1 baseline corrupted** (`finalP = openP + delta + 1n`): rerun → **6 failed / 1 passed**;
  the conserved witness violates the circuit's `finalP conservation (win)` assert
  (`Circuit execution failed: finalP conservation (win)`), so every prove-based test throws. Confirms
  the Track-1 settle genuinely drives the witness and the circuit binds it. Restored.
- **(B) `verifySettle` proof check neutered** (`const ok = true`, skipping `verify(...)`): rerun the
  REJECTS block → **2 failed** (tampered-public-input + wrong-game both wrongly verify true). Confirms
  those rejection tests exercise the real cryptographic proof check, not just the cheap tail/zero guard.
  Restored.

---

## Commands + output

```
cd examples/games/zk-settle
node_modules/.bin/vitest run test/settleE2E.test.ts
```
```
 ✓ test/settleE2E.test.ts (7 tests) 65462ms
   ✓ DICE WIN: real round -> prove -> independent verify; conserved balances == Track-1; amounts hidden  22192ms
   ✓ DICE LOSS: real round -> prove -> independent verify; conserved == Track-1  16831ms
   ✓ LIMBO WIN: real round -> prove -> independent verify; conserved == Track-1; amounts hidden  8018ms
   ✓ LIMBO LOSS: real round -> prove -> independent verify; conserved == Track-1  5813ms
   ✓ the verifier REJECTS bad proofs / bad public inputs > rejects a proof whose claimed commitments do not validate (tampered public input)  5832ms
   ✓ the verifier REJECTS bad proofs / bad public inputs > rejects when the claimed conservation is wrong (a forged witness cannot produce a valid proof)
   ✓ the verifier REJECTS bad proofs / bad public inputs > rejects when verified under the WRONG game circuit (dice proof vs limbo verifier)  6593ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Full package suite (toolchain + Task 2 + 3 + 4 + 5 + 6): `node_modules/.bin/vitest run` →
**41 passed (41)**. `node_modules/.bin/tsc --noEmit` → exit **0**.

Every prove logs `75 public inputs / 500 fields` (the keccak-dominated size from Tasks 4/5 — the
unified API adds no gates, it only selects circuit + builder). Real single-threaded UltraHonk
prove+verify is ~5.8–22s per vector under vitest (dice's first prove includes the cold compile in the
cache).

---

## What was built / changed

```
examples/games/zk-settle/
  src/
    settle.ts            # NEW — the Task-6 unified E2E API:
                         #   SettleGame/SettleRound/SettleProof types, settleGameId,
                         #   trackOneSettle (Track-1 recompute baseline), settleAmounts,
                         #   proveSettle (game-selected circuit + builder, compile cache),
                         #   verifySettle (independent: UltraHonk verify + commitment-tail check)
    index.ts             # + export the Task-6 settle surface
  test/
    settleE2E.test.ts    # NEW — dice+limbo prove/verify + Track-1 equivalence + hiding + 3 rejects
```

Tasks 2-5 (`compile`/`prove`/`verify`/`execute`/`pedersen`, `diceSettle`/`limboSettle`, both circuits,
the vendored keccak lib) are reused UNCHANGED — this task is integration + a clean API only.

---

## M1 completion status

**Track 2 M1 (off-chain privacy settle, dice + limbo) is COMPLETE.** The full chain is proven end to
end: real round → hidden-amount witness + Pedersen commitments → UltraHonk PROVE → independent verify
that learns no amount → Track-1 equivalence (privacy circuit agrees with the public recompute) →
soundness rejections (tampered inputs, wrong game, conservation-violating witness). Both games share one
clean API.

### What M2 (on-chain `settlementMode == 2` verifier) would add

- **Solidity verifier export.** `bb` exports the UltraHonk verifier as a Solidity contract; the channel
  `settle(state, proof, publicInputs)` at `settlementMode == 2` calls it on-chain instead of consuming a
  house/player co-signature.
- **`clientSeedCommit` into `OpenTerms` (contract change).** Off-chain M1 takes `rngCommit` /
  `clientSeedCommit` from the open handshake; mode 2 must bind `clientSeedCommit` at open on-chain so the
  player's seed can't be ground after seeing `serverSeed`. This is the hard prerequisite called out in
  the design's seed-binding-soundness risk — not an afterthought.
- **Commitment ↔ channel-state binding.** M1 proves the five committed amounts are internally consistent
  with the round; M2 must bind those SAME commitments to the on-chain escrow/channel balances so the
  contract settles exactly the proven amounts (drop `sigHouse`/`sigPlayer` for mode 2).
- **On-chain public-input encoding + gas.** The 75 public inputs (two 32-byte commits + targetX100 + ten
  field commitments) must be ABI-encoded for the verifier; UltraHonk on-chain verify gas is the cost to
  measure before mode 2 ships.

---

## Concerns / carry-forward

- **`targetX100` is public on purpose** (bet odds / target multiplier, like the on-chain params).
  A hidden-odds variant would move it to a committed witness with its own range proof.
- **Verifier-side conservation is attested by the PROOF, not re-derived from amounts.** `verifySettle`
  cannot (and must not) recompute conservation from the hidden amounts — it has none. Soundness rests on
  the in-circuit conservation asserts: a witness whose conservation is wrong cannot produce a valid
  proof (test 6). The verifier's extra checks are the cryptographic proof + that the public commitment
  fields are well-formed (non-zero) points. The optional `expectedCommitments` path lets a verifier bind
  the proof to commitments it obtained out-of-band (the eventual on-chain channel state).
- **Blindings are caller-supplied and unconstrained (correct).** Each amount needs a fresh random
  blinding; reusing one across two commitments leaks their difference. The test uses fixed distinct
  blindings for determinism; production must randomize.
- **Single-draw, nonce 1 only.** The nonce is hardcoded 1 in the circuits and the TS preimage; multi-
  round play is out of scope for this primitive (Global Constraint 3).
- **The Track-1 equivalence is a transitional TEST, not a runtime dependency.** Per the design, the
  settlement path consults only the proof; the equality vs the co-signed/recompute state is a one-time
  confidence cross-check that the circuit reproduces the protocol exactly. Once mode 2 is live the proof
  is the sole authority.
- **`compileCircuit` cache is per-process.** Fine for a settling client/house; a long-lived service
  should pre-warm both circuits at startup so the first dice settle doesn't pay the cold-compile cost.
```
