# Track 2 — ZK Privacy for Single-Draw Settle (Design)

**Status:** design / brainstorm-explore + propose — awaiting human approval before any writing-plans
**Date:** 2026-06-24
**Builds on:** Track 1 (`2026-06-23-recompute-settle-design.md`, BUILT and merged — `settleWithSeeds`,
`OpenTerms{clientSeedCommit, paramsHash}`, `GamePayouts.sol`) and the retained ZK seed spec
(`2026-06-23-zk-settle-design.md` — the statement *bind both seeds → derive `r` → payout →
conservation*, the Noir/`bb.js` pure-JS stack, the keccak/254-bit-field hazards).

> This is Track 2 of the decided program: **recompute settle (Track 1, done) → ZK privacy (this spec)
> → Zypher cards (Track 3, the `@gibs/zk-cards-core` ElGamal/Chaum-Pedersen package, separate world)**.
> Track 2's *entire reason to exist is privacy* — hiding exactly what Track 1 deliberately put on-chain.

---

## 1. Goal

Track 1 made settlement trustless but **fully public**: `settleWithSeeds(tableId, serverSeed,
clientSeed, params)` puts the seeds, the bet (`params` + `escrowPlayer`/stake) and the derived outcome
(the `Settled(payoutPlayer, payoutHouse)` event) on-chain in the clear. Anyone can read what a player
bet, on which game, and whether they won.

**Track 2 hides the bet amount and the outcome while keeping settlement trustless.** A Noir proof
replaces the public recompute: the chain (or a peer) verifies *"the hidden outcome was correctly
derived from the committed seeds under the committed params, and the hidden balances conserve the pot"*
**without learning the amounts or who won.** The statement is Track 1's statement (bind both seeds →
`r` → payout → conservation) re-expressed with **amounts as private witnesses and commitments as
public inputs.**

What this is NOT: it does not remove the house-online-per-round cost (only on-chain randomness would —
a hypothetical Track 4), and it does not add multi-round play (single-draw, `nonce == 1`, same as
Track 1). Privacy is the *only* new property.

---

## 2. What becomes private vs what stays public

The privacy *target* is the single most consequential choice — it dictates the entire crypto design —
so it is **Decision 1** below. This section describes the **recommended** target (Profile B); the
alternatives are in §9.

| Datum | Track 1 (public) | Track 2 recommended (Profile B) |
|---|---|---|
| Table exists / is open | public | **public** (an `Opened` event still fires) |
| Pot total (`escrowPlayer + escrowHouse`) | public | **public** — conservation is checked against it |
| `gameId` (dice vs limbo) | public | **public** (circuit branches on it; see §9 for hiding it) |
| Bet amount (`stake`) | public | **PRIVATE** |
| `params` (dice target, limbo target) | public (`paramsHash` + revealed) | **PRIVATE** (only a commitment is public) |
| Outcome (win/loss) | public (event) | **PRIVATE** |
| Payout split (`balancePlayer`/`balanceHouse`) | public | **PRIVATE** (only commitments are public) |
| Seeds (`serverSeed`, `clientSeed`) | public (revealed on-chain) | **PRIVATE** (only commits public) |
| Player ↔ this-table linkage | public | **public** (the wallet that opened receives payout; see §9.D — unlinkability deferred) |

**The hard public invariant that makes it trustless:** the *pot is constant and known*
(`escrowPlayer + escrowHouse` is fixed at open and visible). Privacy hides how the pot is *split*, not
its total. This is what lets a verifier confirm "no chips were minted" without seeing the split —
exactly the confidential-amounts pattern (commitments + a conservation check on the *commitments*).

**Why the pot total stays public:** the house must reserve `escrowHouse` from `housePool` at open, and
that reservation is a real ERC20 accounting event. Hiding the pot total would require a confidential
*pool*, which is a much larger change (Decision 3, Option C) and is out of scope for M1.

---

## 3. Cryptographic approach

### 3.1 Amount hiding — Pedersen commitments + range proofs (recommended; Decision 3)

Hide each balance/amount behind a **Pedersen commitment** `C = aG + bH` (value `a`, blinding `b`, on
the same curve Noir proves over — bn254/Grumpkin via `std::hash::pedersen`). The circuit proves, in
zero knowledge:

- knowledge of the openings `(a, b)` of each public commitment;
- the hidden amounts are in range (`0 ≤ a < 2^k`, e.g. `k = 128`) via an in-circuit **range proof** —
  this is what stops a "negative bet" / overflow forgery;
- the hidden balances are the *correct function* of the hidden bet and the seed-derived outcome
  (§3.3);
- **conservation on the cleartext values inside the circuit**: `balancePlayer + balanceHouse == pot`,
  where `pot` is a *public* input. (We do not need the homomorphic `C_player + C_house == C_pot`
  trick because the circuit has the openings and asserts the plaintext sum directly — simpler and the
  range proofs prevent wraparound.)

This is strictly lighter than a full confidential-token/balance model (Decision 3, Option C): only the
*per-round bet and the round's payout split* are confidential; the chip token and the house pool stay
plaintext ERC20. We recommend this for M1.

### 3.2 What the contract / verifier sees

**Public inputs to the proof** (and thus on-chain if settlement is on-chain):
- `tableId`
- `pot` (= `escrowPlayer + escrowHouse`, already public, read from the `Table`)
- `gameId`
- `rngCommit`, `clientSeedCommit` — already in `OpenTerms` (Track 1)
- `paramsCommit` — a Pedersen/keccak commitment to `params`; **replaces** Track 1's public
  `paramsHash`-then-reveal (see Decision 1 note on params)
- `Cplayer`, `Chouse` — Pedersen commitments to the final balances (the *outputs* the contract pays
  against)
- `stakeCommit` — Pedersen commitment to the bet (so the house can size escrow without revealing it;
  see §3.4)

**Private witnesses** (never leave the prover):
- `serverSeed`, `clientSeed`
- `stake`, `params` (+ their blindings)
- `balancePlayer`, `balanceHouse` (+ their blindings)
- `isWin`, `payout` (derived)

### 3.3 The circuit statement (privacy version)

This is the Track-1 statement with amounts moved from public to private and commitments added. Pseudocode:

```
// ---- PUBLIC ----
//   tableId, pot, gameId,
//   rngCommit, clientSeedCommit, paramsCommit,
//   Cplayer, Chouse, stakeCommit
// ---- PRIVATE (witness) ----
//   serverSeed, clientSeed,
//   stake, bStake, params, bParams,
//   balancePlayer, bPlayer, balanceHouse, bHouse

assert keccak256(serverSeed)  == rngCommit            // seed binding (as Track 1)
assert keccak256(clientSeed)  == clientSeedCommit
assert commit(params, bParams) == paramsCommit        // params binding, now hidden
assert commit(stake,  bStake)  == stakeCommit
assert commit(balancePlayer, bPlayer) == Cplayer      // output bindings
assert commit(balanceHouse,  bHouse)  == Chouse

assert range(stake, 128) && range(balancePlayer, 128) && range(balanceHouse, 128)

r = uint256(keccak256(abi_encode(serverSeed, clientSeed, 1u64)))   // EXACT viem/Track-1 layout

// per-game payout — identical math to GamePayouts.sol / dice.ts / limbo.ts
(isWin, payout) = payout(gameId, r, params, stake)    // dice & limbo branches, M1

assert balancePlayer == payout                         // player gets payout (0 on loss)
assert balancePlayer + balanceHouse == pot             // conservation, on cleartext, in ZK
```

Notes:
- `abi_encode(serverSeed, clientSeed, 1u64)` MUST be byte-identical to viem's
  `roundRandom` (`encodeAbiParameters([{bytes32},{bytes32},{uint64}], …)`) and to Track 1's
  `abi.encode(serverSeed, clientSeed, uint64(1))` — a 96-byte preimage. **This parity is the single
  highest correctness risk** and gets a dedicated gate test (§5, §7).
- `nonce` is hardcoded `1` inside the circuit, never a witness — same soundness rationale as the
  `settleWithSeeds` comment (a free nonce would be attacker-grindable).
- The game math (`roll = r % 10_000`, `multX100 = 99_000_000/target/100`, limbo
  `resultX100 = 99_000_000/(1e6-u)`) is the *exact* operation order from `GamePayouts.sol`, which
  already mirrors `dice.ts`/`limbo.ts`. The circuit, the Solidity library, and the TS reference must
  cross-check against ONE source of truth — `@gibs/msgboard-games`.

### 3.4 The escrow-sizing wrinkle (flagged assumption)

Track 1's `escrowHouse = stake*(maxMult(params)-100)/100` is computed by the house at open and is
*public* — it leaks an upper bound on the bet and the multiplier. **If the stake/params are private,
the public escrow split at open would still leak them.** Two resolutions:

- **(B-pot) Hide only the split, not the pot total** (recommended M1): keep `escrowPlayer +
  escrowHouse = pot` public, but make the *open* itself commit to a single `pot` and the house
  over-reserves to a **bucketed/quantized pot** (e.g. round the pot up to a denomination ladder) so
  the on-chain pot reveals only a bucket, not the exact stake×mult. The circuit proves the real
  payout `≤ pot`. **Assumption to confirm with the human:** a denomination ladder (fixed bet sizes)
  is acceptable UX. This is the standard way confidential-bet systems avoid leaking via collateral.
- **(B-exact) Accept that the pot total (hence a stake upper bound) is public**, hiding only
  win/loss and the exact split. Simpler, weaker privacy. This is the *minimum* viable Track 2.

This wrinkle is the reason **Decision 1 is load-bearing**: "hide the amount" is only fully meaningful
with a pot/denomination strategy; otherwise the collateral leaks it.

---

## 4. Where settlement happens (Decision 2)

Two milestones, mirroring Track 1's off-chain-then-on-chain progression:

### M1 — off-chain proof (recommended first)
A peer builds the witness from the post-reveal transcript and produces a Noir proof; **any peer
verifies it off-chain** (`bb.js` verify in Node/TS, mirroring the existing `boardE2E`/`proveSettleFrom
Transcript` shape from the seed spec). The settlement *amounts stay committed*; the proof convinces
peers the committed split is honest. No contract change. This validates the whole circuit + toolchain
cheaply and matches how Track 1 shipped (off-chain driver first, then on-chain).

Limitation: an off-chain-only proof doesn't *move chips* privately — it convinces observers but the
actual ERC20 payout still has to happen somehow. So M1 is a **correctness/feasibility milestone**, not
a production private-settle. That's fine — it's the cheapest way to stand Noir up and de-risk the
circuit.

### M2 — on-chain confidential settle (`settlementMode == 2`)
A new `settleWithProof(tableId, proof, publicInputs)` on `HouseChannel`:
- verifies the Noir proof with a **`bb`-exported Solidity verifier** (UltraHonk/Keccak flavor);
- checks `publicInputs` bind to the table's stored `rngCommit`/`clientSeedCommit`/`paramsCommit` and
  `pot`;
- pays out against the **committed** balances. This is the part that needs the confidential-amount
  mechanism to actually settle ERC20: with Profile B the contract still transfers plaintext chips, so
  for on-chain settle the *payout amount itself is revealed at transfer time* unless we move to a
  confidential-balance model (Decision 3, Option C). **Flagged tension:** a plaintext ERC20 transfer
  inherently reveals the amount on-chain. True on-chain amount privacy requires confidential balances
  (shielded pool / encrypted note that the player later withdraws), which is a large scope — see §9.C.

`settlementMode == 2` is already reserved as "zk" in `SessionState.sol` (`uint8 settlementMode; // 0
optimistic, 1 escrowed, 2 zk`), so the slot exists.

**Recommendation:** ship M1 (off-chain) first to stand up Noir and prove the circuit, then evaluate M2.
On-chain *amount* privacy (vs just verifiable-private settle) is gated on Decision 3 going to Option C
and is explicitly a later milestone.

---

## 5. The Noir toolchain bootstrap (this is where Noir is actually stood up)

Track 1 used pure Solidity — **no Noir exists in the repo yet.** (`@gibs/zk-cards-core` is the Zypher
ElGamal/Chaum-Pedersen world for Track 3, unrelated.) Track 2 stands up Noir for the first time.

- **Pure-JS pipeline, no `nargo` binary:** compile `.nr` → bytecode with `@noir-lang/noir_wasm`;
  prove/verify with `@noir-lang/noir_js` + `@aztec/bb.js`. npm deps only — no native compiler — serving
  the commodity-hardware/decentralization goal and fitting the pnpm-workspace / vitest / ESM conventions
  (consistent with the games platform's "PoW grinds in workers, anyone runs a house" posture; note the
  proving, like PoW, must run off the browser main thread — a Web Worker — if ever browser-side).
- **New package `@gibs/zk-settle`** under `examples/games/`, peer to `@gibs/msgboard-settle`. Owns the
  circuit, the witness builder (TS state → circuit inputs), the prove/verify wrapper, and (M2) the
  exported Solidity verifier. Depends on `@gibs/msgboard-games` for the canonical constants so circuit
  ↔ Solidity ↔ TS share ONE source of truth.
- **Hazards flagged from the seed spec, now first-class:**
  - **keccak-in-Noir parity:** the `abi.encode(serverSeed, clientSeed, 1u64)` preimage padding must be
    byte-identical to viem and to `GamePayouts`. **Gate test** (`keccakParity.test.ts`): the circuit's
    `roundRandom` keccak == viem's `roundRandom` == the Solidity `r` for fixed vectors, before any game
    logic is trusted.
  - **256-bit `r` in a 254-bit field:** `r` is a full `uint256`; bn254's field is ~254 bits. `r` must
    be carried as bytes/limbs and the `% 10_000` / `% 1_000_000` reductions done on the wide value, not
    on a field element that silently wrapped. This is a known footgun and gets its own assertion + test.
  - **Pedersen vs keccak commits:** seed commits stay **keccak** (they must match the on-chain
    `OpenTerms` commits — contract-fixed). Amount/param/balance commits are **Pedersen** (cheap in
    Noir). The circuit therefore contains *both* hash families; the keccak count (3: two seed binds +
    `r`) dominates gate cost. If keccak gate cost is painful, a Poseidon seed-commit is a contingency
    *only if the contract's commit hash also changes* — out of scope for M1.
  - **Trusted setup / proving system:** UltraHonk via `bb.js` is transparent (no per-circuit trusted
    setup ceremony) — note this explicitly as a risk-retired item vs. Groth16.

---

## 6. Components

```
examples/games/zk-settle/
  package.json            # @gibs/zk-settle; deps: @gibs/msgboard-games, @noir-lang/noir_js,
                          #   @noir-lang/noir_wasm, @aztec/bb.js, viem; dev: vitest, typescript
  circuits/settle/
    src/main.nr           # ONE circuit, gameId switch (dice+limbo M1); seeds keccak, amounts Pedersen
    Nargo.toml            # manifest (compiled via noir_wasm, not nargo CLI)
  src/
    index.ts
    commit.ts             # Pedersen commit helpers (TS side, must match in-circuit pedersen)
    witness.ts            # TS round/state + blindings -> circuit inputs (the marshaller)
    prove.ts              # compile(noir_wasm) + prove(noir_js+bb.js) -> { proof, publicInputs }
    verify.ts             # verify(proof, publicInputs) -> boolean
  test/
    keccakParity.test.ts  # GATE: circuit roundRandom == viem == Solidity r
    rRangeReduction.test.ts # GATE: 256-bit r reduced correctly in 254-bit field
    settleDice.test.ts    # prove+verify a hidden-amount dice witness; win and loss
    settleLimbo.test.ts   # prove+verify a hidden-amount limbo witness; win and loss
    e2eProof.test.ts      # transcript -> witness -> prove -> off-chain verify (M1)

packages/contracts/contracts/games/   (M2 only)
  SettleVerifier.sol      # bb-exported UltraHonk verifier
  HouseChannel.sol        # + settleWithProof(...) at settlementMode==2; OpenTerms paramsHash->paramsCommit
```

---

## 7. Decomposition (for writing-plans; not executed here)

1. **Toolchain bootstrap (GATE for the whole track).** Stand up `@gibs/zk-settle`; compile a trivial
   `.nr` via `noir_wasm`; prove+verify it via `noir_js`+`bb.js` in a vitest test. Deliverable: green
   test proving the pure-JS Noir pipeline works in this monorepo. *Nothing else proceeds until this is
   green — this is the real "does Noir even stand up here" milestone.*
2. **keccak parity + 256-bit-`r` reduction (GATE).** Circuit outputs `keccak256(serverSeed)` and
   `roundRandom`; cross-check both against viem AND the Solidity `r` for fixed vectors; assert the
   wide-`r` reduction. Must match byte-for-byte before any game logic is trusted.
3. **Pedersen commit parity (GATE).** TS `commit()` == in-circuit `pedersen` for fixed vectors;
   range-proof a value and a deliberately-out-of-range value (must fail).
4. **Dice branch + conservation, hidden amounts.** Add dice payout + commitment binds + conservation;
   prove+verify a real hidden win and a real hidden loss; assert publicInputs leak nothing beyond
   commitments + pot.
5. **Limbo branch.** Add limbo (same circuit, `gameId` switch); win+loss.
6. **Transcript → proof integration + E2E (M1 done).** `proveSettleFromTranscript`/`verifySettle`
   over hidden amounts; E2E transcript → witness → proof → off-chain verify; transitional equivalence
   cross-check that the hidden split equals the Track-1 plaintext split for the same transcript.
7. **(Deferred / M2)** `bb` Solidity verifier export → `settleWithProof` at `settlementMode==2`;
   `OpenTerms.paramsHash` → `paramsCommit` (contract change → redeploy + indexer repoint, a gated
   workflow). Gated on Decision 2 = "go on-chain" and Decision 3 = the on-chain payout privacy model.
8. **(Deferred)** plinko + keno once paytables are frozen (placeholder `FAIR_TABLES_X100` /
   `BASE_PAYTABLE_X100` today; keno's Fisher-Yates is materially more circuit work).
9. **(Deferred)** unlinkability across rounds; a relayer for the on-chain proof
   (`@gibs/msgboard-settle-relayer` already exists as a pattern) so the submitter isn't leaked (§9.D).

---

## 8. Risks / open points

- **keccak parity & 256-bit-`r`-in-254-bit-field** — top correctness risk; mitigated by GATE tests 2.
- **Collateral leak (§3.4)** — public `escrowHouse` can leak the hidden stake/mult unless pot is
  bucketed/quantized. Privacy is *incomplete* without a denomination strategy; flagged as the crux of
  Decision 1.
- **On-chain amount privacy is bounded by ERC20 transfers (§4 M2)** — a plaintext payout transfer
  reveals the amount at settle time; true on-chain amount-hiding needs confidential balances (§9.C),
  out of M1 scope. M1's off-chain proof sidesteps this by not moving chips.
- **Verifier gas (M2)** — an UltraHonk Solidity verifier is hundreds of k gas vs Track 1's ~50–100k
  recompute. Privacy is strictly more expensive on-chain; this is the price of the property.
- **Trusted setup** — UltraHonk/`bb` is transparent (no ceremony) — retired vs Groth16, but noted.
- **Proof latency** — target sub-second to low-seconds CPU prove for a ~3-keccak + Pedersen + range
  circuit; measure in Task 4. Browser proving must run off the main thread (Web Worker), same rule as
  PoW.
- **House-online cost unchanged** — Track 2 does NOT remove the dealer-online-per-round requirement;
  seeds still must be exchanged. Only on-chain randomness (hypothetical Track 4) would.
- **Reveal-griefing unchanged** — the loser can still refuse to reveal its seed → dispute/refund
  clawback (`disputeFromOpen`/`resolveTimeout`), fair, shared with Track 1.
- **Paytable finality** — plinko/keno deferred (placeholder tables), same as Track 1.

---

## 9. How it relates to Track 1, and explicit out-of-scope

**Composition (recommended):** Track 2 **layers on top of** Track 1 as an *additional* settle path, it
does **not replace** `settleWithSeeds`. The cleanest model mirrors how `settle` (mode 1 co-sign) and
`settleWithSeeds` (recompute) already coexist on the same table:

- `settleWithSeeds` (Track 1, mode-1-ish recompute) stays — public, cheap, trustless.
- `settleWithProof` (Track 2, `settlementMode == 2`) is added — private, heavier, trustless.
- Both read the same `Table`/escrow and pay via the same `_payout`; the table chooses its settle path.
  A table that wants privacy uses the proof path; one that doesn't uses recompute. **No removal, only
  addition** (plus, at M2, `paramsHash` → `paramsCommit` in `OpenTerms`).

This keeps the public recompute as the simple default and makes privacy opt-in, which also de-risks
Track 2: if the circuit has a bug, the public path is unaffected.

### Out of scope (Track 2, M1)
- On-chain `settleWithProof` / `settlementMode==2` verifier (M2, gated on Decisions 2 & 3).
- Confidential chip *balances* / shielded pool (Decision 3 Option C; large change to `HouseChannel`/token).
- Unlinkability across rounds and a submitter-hiding relayer (Decision 4, deferred).
- Hiding the pot total / `gameId` (Decision 1 stronger profiles; §9.A/§9.B).
- plinko & keno (placeholder paytables); multi-round play; removing the house-online requirement.

### Stronger-privacy options noted for completeness (NOT M1)
- **§9.A Hide `gameId`** — make the game a private witness and branch in-circuit on a committed
  `gameId`; the verifier learns only "*some* supported game". Cheap-ish but the public-input set
  changes; deferred.
- **§9.B Hide the pot total** — confidential collateral / per-table denomination; large change.
- **§9.C Confidential balances** — shielded note model so on-chain payout doesn't reveal the amount;
  the real path to *on-chain* amount privacy; large, later.
- **§9.D Unlinkability + relayer** — break player↔table linkage across rounds and submit the proof via
  a relayer so the on-chain submitter isn't the player; deferred.

---

## 10. DECISIONS FOR THE HUMAN

> Approve these before any writing-plans. Each one moves real scope.

### Decision 1 — Exactly what to hide (the privacy target)
- **Profile A (minimum):** hide win/loss + the exact split only; stake upper bound leaks via public
  pot. (Maps to §3.4 B-exact.)
- **Profile B (recommended):** hide stake + params + outcome + split; keep pot **bucketed** (a
  denomination ladder) and `gameId` public. Real bet-amount privacy with bounded scope.
- **Profile C (max):** B + hide `gameId` (§9.A) + hide pot total / confidential balances (§9.B/C) +
  unlinkability (§9.D). Large.

**Recommendation: Profile B**, with the denomination-ladder UX assumption explicitly confirmed.
Rationale: it delivers the property the track exists for (hidden bet + outcome) without the
confidential-pool blast radius; the collateral-leak wrinkle (§3.4) is genuinely solved only at B (a
bucketed pot), so A is *almost-privacy* and likely not worth a circuit. **Flagged assumption:** B
requires fixed bet denominations — confirm that's acceptable UX before building.

### Decision 2 — On-chain confidential settle vs off-chain proof first
- **Off-chain first (recommended):** M1 = off-chain prove/verify, no contract change; stands Noir up,
  de-risks the circuit, matches Track 1's off-chain-then-on-chain cadence. On-chain `settleWithProof`
  (`settlementMode==2`, bb Solidity verifier, hundreds-of-k gas) is a separate, later, gated milestone.
- **On-chain immediately:** heavier, needs the Solidity verifier + redeploy up front, and on-chain
  *amount* privacy is still bounded by ERC20 transfers (needs Decision 3 Option C).

**Recommendation: off-chain proof first (M1), on-chain as M2 gated on Decision 3.**

### Decision 3 — The amount-hiding scheme + whether chip *balances* go confidential
- **Per-round commitments + range proofs (recommended):** Pedersen-commit the bet and the round's
  payout split; chips/pool stay plaintext ERC20. Lightest; hides the *bet*, not the standing balances.
- **Confidential-token / shielded-balance model:** chip balances themselves become encrypted notes;
  the only path to true *on-chain* amount privacy at settle, but a large `HouseChannel`/token change.

**Recommendation: per-round commitments + range proofs (Option A) for M1/M2-verifiable-settle.**
Confidential balances (Option B) is deferred to §9.C — adopt only if on-chain payout-amount privacy
(not just verifiable-private settle) becomes a requirement.

### Decision 4 — Defer-for-later items
- **Unlinkability across rounds** (player↔table linkage) — **defer** (§9.D).
- **A relayer for the on-chain proof** (so the submitter isn't the player, avoiding mempool/submitter
  leakage) — **defer**; reuse the existing `@gibs/msgboard-settle-relayer` pattern when M2 lands.

**Recommendation: defer both.** They only matter once on-chain settle (M2) exists and only sharpen an
already-meaningful privacy win; folding them in now would balloon M1.
