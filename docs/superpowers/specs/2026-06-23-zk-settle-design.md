# ZK Settlement — Track 1: Trust-Minimized Settle (Design)

**Status:** design / awaiting approval before writing-plans
**Date:** 2026-06-23
**Decided with the user:** stack = **Noir** (CPU/browser proving via `bb.js`, no GPU, no prover
service, self-hosted Solidity verifier); depth = **off-chain-proof-first**; program order =
**Settle → Privacy → Cards**. Deciding factor for the stack was *decentralization*: any house
operator (or a browser) must be able to produce a settle-able proof on commodity hardware with no
external service.

---

## The ZK program (context — this spec covers Track 1 only)

The platform's ZK work is three independent subsystems, each its own spec/plan:

1. **Track 1 — Trust-minimized settle (THIS SPEC).** A proof that a single-outcome game result was
   correctly derived from the committed seed, so a settlement can be *verified without trusting the
   house*. Off-chain first; the on-chain `settlementMode == 2` verifier is a later milestone.
2. **Track 2 — Privacy.** Hide bet amount + outcome via commitments + range proofs. Reuses Track 1's
   Noir toolchain. Separate spec.
3. **Track 3 — Card-game class.** A new game type on the already-vendored Zypher `uzkge`
   shuffle/reveal verifiers (World B — different proving system, on-chain verifiers already present).
   Separate spec.

**The proof REPLACES the house co-signature (decided with the user).** Settlement is authorized by a
valid proof alone — "we don't need the house's approval to take the chips off the table." This is not
just trust-minimization; it closes a real theft vector in the co-sign model: today a house can reveal
its `serverSeed`, see the round is a player win, and then **refuse to co-sign** the payout, forcing
the player into the dispute path — which only refunds the *open* escrow, so the player loses the
winnings. With proof-authorized settlement the winner settles **unilaterally and permissionlessly**
once the seeds are out; the house cannot withhold a payout. "Refuse to reveal at all" still falls back
to the dispute/refund clawback, which is fair (no theft on either side).

**The consequence: the player's seed binding must move on-chain.** Fairness requires *both* seeds be
committed before either is revealed. Today the house enforces the player's binding by refusing to
co-sign a mismatched `clientSeed`. Dropping the co-sign removes that enforcement, so a malicious
player could pick a fresh favorable `clientSeed` *after* seeing `serverSeed` and grind a win. The
proof therefore asserts `keccak256(clientSeed) == clientSeedCommit`, and `clientSeedCommit` must be
committed at open — i.e. **added to `OpenTerms`** next to `rngCommit` (the house already signs
`OpenTerms`; the player already posts `clientSeedCommit` at open today, it just isn't in the signed
terms yet). For off-chain M1 the commit comes from the open handshake; the on-chain milestone moves it
into `OpenTerms`.

**Honest scope boundary that shaped this design:** ZK does **not** remove the "house must be online
each round" cost — only *on-chain randomness* does (a possible future Track 4). In commit-reveal the
seeds must be exchanged for either party to even know the outcome; ZK's win is that after that
exchange the *winner* needs no signature from the loser. **Anyone can run a house**, and Noir keeps the
prover on commodity hardware so "anyone" is real.

---

## Goal

A Noir circuit + a TS prove/verify wrapper that, given a single-draw game round, proves:

> "I know a `serverSeed` and a `clientSeed` whose hashes are the publicly-committed `rngCommit` and
> `clientSeedCommit`, and the round randomness derived from them produces exactly these final balances
> under game `gameId` with these `params` and `stake`."

A valid proof **is** the settlement authorization — it replaces the house co-signature. Verified
**off-chain** in Milestone 1 (in Node/TS, mirroring the existing `boardE2E` test), so the winner — or
*any* peer — can settle and confirm the result honest with **no signature from the other party**. The
on-chain `settle(state, proof)` at `settlementMode == 2` (which also moves `clientSeedCommit` into
`OpenTerms`) is a follow-on milestone, explicitly out of scope here.

## Architecture

- **One circuit, branch on `gameId`.** A single Noir circuit takes `gameId` as a public input and
  computes the matching game's payout. The games are cheap integer arithmetic; the two keccaks
  dominate cost and are shared across all branches, so one-circuit-for-all-games is acceptable.
- **Milestone 1 covers dice + limbo only.** Both have deterministic, closed-form multipliers. Plinko
  and keno are deferred: their paytables are explicitly *placeholder / not final* in the code
  (`FAIR_TABLES_X100`, `BASE_PAYTABLE_X100`), and keno's Fisher-Yates draw is materially more circuit
  work. They join once the tables are frozen (a later task in the plan).
- **Pure-JS Noir pipeline (no `nargo` binary).** Compile `.nr` → bytecode with `@noir-lang/noir_wasm`,
  prove/verify with `@noir-lang/noir_js` + `@aztec/bb.js`. This keeps the toolchain to npm deps only —
  no native compiler install — which serves the commodity-hardware/decentralization goal and fits the
  existing pnpm-workspace, vitest, ESM conventions.
- **New package `@gibs/zk-settle`** under `examples/games/`, peer to `@gibs/msgboard-settle`. It owns
  the circuit, the witness builder (TS → circuit inputs), and the prove/verify wrapper. It depends on
  `@gibs/msgboard-games` for the canonical constants so the circuit and the TS reference can be
  cross-checked against ONE source of truth.

## The statement (public / private / asserts)

**Public inputs**
- `rngCommit: bytes32` — `seeds[0]`, published (and house-signed in `OpenTerms`) at session open.
- `clientSeedCommit: bytes32` — `keccak256(clientSeed)`, committed by the player at open. Binds the
  player's seed on-chain so it can't be ground after seeing `serverSeed`. (Off-chain M1: from the open
  handshake. On-chain milestone: a new field in `OpenTerms`.)
- `nonce: u64` — round counter (1 for the single draw).
- `gameId: u8` — 1 dice, 2 limbo (M1).
- `params` — game params as field elements (dice/limbo: `targetX100` as a single field).
- `openBalancePlayer, openBalanceHouse: u256` — balances at nonce 0 (the OPEN state).
- `finalBalancePlayer, finalBalanceHouse: u256` — the claimed settle balances.
- `stake: u256`.

**Private witness**
- `serverSeed: bytes32` — `seeds[1]` for a length-1 chain (the house's revealed link).
- `clientSeed: bytes32` — the player's seed. Private: only its commit is public, so the proof shows
  knowledge of the preimage without publishing it.

**Asserts**
1. `keccak256(serverSeed) == rngCommit` **and** `keccak256(clientSeed) == clientSeedCommit` — both
   seeds bind to commits fixed at open, so neither party can grind after seeing the other's seed.
2. `r = uint256(keccak256(abiEncode(serverSeed, clientSeed, nonce)))` — round randomness.
   - `abiEncode` layout MUST be byte-identical to viem's
     `encodeAbiParameters([{bytes32},{bytes32},{uint64}], …)`: 32 bytes `serverSeed` ‖ 32 bytes
     `clientSeed` ‖ `nonce` left-padded to 32 bytes = a 96-byte preimage. This parity is the single
     highest-risk correctness point; it gets a dedicated cross-check test (below).
3. `playerDelta = payout(gameId, r, params, stake)` per the exact game math:
   - **dice:** `roll = r % 10_000`; `win = roll < targetX100`;
     `multX100 = 99_000_000 / targetX100`; `playerDelta = win ? stake*multX100/100 - stake : -stake`.
   - **limbo:** `u = r % 1_000_000`; `resultX100 = (99 * 1_000_000) / (1_000_000 - u)`;
     `win = resultX100 >= targetX100`; `playerDelta = win ? stake*targetX100/100 - stake : -stake`.
4. `finalBalancePlayer == openBalancePlayer + playerDelta` and
   `finalBalanceHouse == openBalanceHouse - playerDelta` (conservation: the pot is constant and
   equals `escrowPlayer + escrowHouse`).

All arithmetic is unsigned in-circuit; `playerDelta` is represented as the pair
`(isWin, magnitude)` (win adds `stake*mult/100 - stake`, loss subtracts `stake`) to avoid signed
fields. Integer division matches Solidity/JS truncation toward zero (operands are non-negative).

## Package layout

```
examples/games/zk-settle/
  package.json            # @gibs/zk-settle; deps: @gibs/msgboard-games, @noir-lang/noir_js,
                          #   @noir-lang/noir_wasm, @aztec/bb.js, viem; dev: vitest, typescript
  tsconfig.json           # mirrors the other game packages
  vitest.config.ts
  circuits/
    settle/
      src/main.nr         # the one circuit (dice+limbo in M1)
      Nargo.toml          # package manifest (compiled via noir_wasm, not nargo CLI)
  src/
    index.ts
    witness.ts            # TS round/state -> circuit inputs (the marshaller)
    prove.ts              # compile(noir_wasm) + prove(noir_js+bb.js) -> { proof, publicInputs }
    verify.ts             # verify(proof, publicInputs) -> boolean
  test/
    keccakParity.test.ts  # Noir keccak/roundRandom == viem roundRandom for known vectors (GATE)
    settleDice.test.ts    # prove+verify a real dice witness; win and loss
    settleLimbo.test.ts   # prove+verify a real limbo witness; win and loss
    e2eProof.test.ts      # take a boardE2E-style transcript -> witness -> prove -> verify off-chain
```

## Integration (Milestone 1, off-chain)

- After the seeds are exchanged in a round, the **winner** (the party motivated to settle) builds the
  witness from the values both parties now hold (`serverSeed`, `clientSeed`, `nonce`, params,
  balances) and produces a proof. The proof — not a house signature — is what authorizes the
  settlement.
- `@gibs/zk-settle` exposes `proveSettleFromTranscript(transcriptJson, ctx)` which reuses
  `replaySession` to extract the final state + the ROUND body (`serverSeed`, `clientSeed`, params) and
  the open `clientSeedCommit`/`rngCommit`, builds the witness, and returns `{ proof, publicInputs }`.
  Any peer calls `verifySettle(proof, publicInputs)` and reads the settle balances straight from
  `publicInputs.final*` — **no signature from the other party is consulted**.
- **Equivalence check (transitional, M1 only).** Because the existing co-signed transcript is still
  produced today, an M1 test asserts the proof's `final*` balances equal the co-signed state's
  balances — a one-time confidence cross-check that the circuit reproduces the protocol exactly. This
  is a *test*, not a runtime dependency; the settlement path itself consults only the proof.
- The on-chain `settle(state, proof)` at `settlementMode == 2` — which also adds `clientSeedCommit` to
  `OpenTerms` and drops `sigHouse`/`sigPlayer` for mode 2 — is the NEXT milestone, not this one.

## Decomposition (for writing-plans; not executed here)

1. **Toolchain bootstrap.** Stand up `@gibs/zk-settle`, compile a trivial `.nr` via `noir_wasm`, and
   prove+verify it in a vitest test. Deliverable: green test proving the pure-JS Noir pipeline works
   in this monorepo.
2. **keccak parity (GATE).** Circuit that outputs `keccak256(serverSeed)` and the `roundRandom`
   keccak; cross-check both against viem for fixed vectors. Must match byte-for-byte before any game
   logic is trusted.
3. **Dice payout + conservation.** Add the dice branch + balance asserts; prove+verify a real
   win and a real loss witness.
4. **Limbo branch.** Add limbo; prove+verify win and loss. (One circuit, `gameId` switch.)
5. **Transcript → proof integration + E2E.** `proveSettleFromTranscript` / `verifySettle`; an E2E
   test that goes transcript → witness → proof → off-chain verify, settling from the proof's public
   balances alone, plus the transitional equivalence cross-check against the co-signed state.
6. **(Deferred, separate task) plinko + keno** once paytables are final; **(separate milestone)**
   on-chain `settlementMode==2` verifier via `bb` Solidity export — this milestone also adds
   `clientSeedCommit` to `OpenTerms` (contract change) and the proof-accepting `settle` path.

## Risks / open points

- **keccak-in-Noir cost & parity.** ~2 hashes; tolerable, but the abi.encode padding must match viem
  exactly. Mitigated by the Task-2 gate test. If Noir keccak gate cost proves painful, fall back to a
  Poseidon-based commit *only if* we also change the contract's commit hash — out of scope for M1,
  noted as a contingency.
- **Paytable finality.** Plinko/keno deferred precisely because their tables are placeholder.
- **Proof latency.** Target: sub-second to low-seconds CPU prove for a 2-keccak circuit; measure in
  Task 3 and record. If browser (bb.js WASM) latency is poor, server-side prove by the house is still
  fully decentralized (anyone runs the house).
- **Seed-binding soundness.** Dropping the co-sign is only safe because the proof binds *both* seeds
  to commits fixed at open (`rngCommit`, `clientSeedCommit`). The on-chain milestone MUST add
  `clientSeedCommit` to `OpenTerms` before mode 2 can be trusted; off-chain M1 takes it from the open
  handshake. This is the one new attack surface introduced by removing co-sign and is called out as a
  hard prerequisite, not an afterthought.
- **Reveal liveness.** With co-sign gone, the *winner* settles without the loser's signature — but
  still needs the loser's revealed seed to build the proof. A party that refuses to reveal its seed at
  all forces the dispute/refund clawback (open escrow returned), which is fair: no theft either way.
  What's eliminated is reveal-*then*-withhold-signature, the actual griefing vector.
- **House-online truth.** Reiterated: this track does not remove the dealer-online requirement; only
  on-chain randomness (future Track 4) does.

## Out of scope (M1)

On-chain verifier / `settlementMode==2`; privacy (Track 2); cards (Track 3); plinko & keno; removing
the house-online requirement.
