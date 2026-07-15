# Design: ZK skill games — provably-fair Sudoku + Wordle (circom/PLONK)

**Date:** 2026-07-02
**Repo:** gibsfinance/random
**Status:** design proposal → pending approval
**Updated 2026-07-15:** migrated Groth16 → **PLONK**. See "Proving system" below. The rest of this
document is the original design and remains accurate: circuits, commitments, public-signal orders and
the trustlessness model are unchanged by that migration — only the proving system moved.

## Proving system: PLONK (migrated 2026-07-15 from Groth16)

**No trusted-setup ceremony is required.** This supersedes every "needs a real ceremony" caveat below
and in the M1/M2/M3 reports.

Groth16 requires a **per-circuit phase-2 ceremony, re-run on EVERY circuit change**. Worse, the zkeys
this repo actually shipped were produced by `snarkjs groth16 setup` with **zero contributions** (the
harness faked a phase-2 with a fixed public dev beacon), so the toxic waste was effectively public —
**anyone could forge a winning proof and drain the house**. PLONK consumes the **same universal Hermez
powers-of-tau** for every circuit and has **no per-circuit setup**, so the requirement disappears:
`snarkjs plonk setup <r1cs> <hermez.ptau> <zkey>` IS the complete setup, with no contribute/beacon step
to get wrong and no waste to leak. All three circuits share
`powersOfTau28_hez_final_16.ptau` (2^16 is sized for sudoku_solve: 22,948 R1CS → 34,245 PLONK
constraints; a larger ptau works fine for the smaller circuits).

PLONK is also **cheaper here**, inverting the usual "groth16 is cheapest" wisdom. Measured on-chain
with real proofs on the identical sudoku_solve circuit/vector (83 public signals):

| circuit | public signals | PLONK verify gas | groth16 baseline | verifier code (EIP-170 limit 24,576 B) |
|---|---|---|---|---|
| `sudoku_solve` | 83 | **~305k** | 743,449 (**−59%**) | 15,550 B |
| `wordle_clue`  | 11 | **~267k** | — | 6,868 B |
| `wordle_solve` |  4 | **~263k** | — | 6,072 B |

PLONK's proof costs +512B of calldata (24 words vs 8) ≈ 8.2k gas at 16/nonzero-byte — negligible
against a ~438k execution saving.

Two measurement caveats, both established by running them:

- **These numbers supersede an earlier, inflated set** (933,945 vs 528,824, "−43%"). The foundry
  fixtures are `internal` **storage** arrays; passing them straight to the verifier SLOADs every word
  *inside* the `gasleft()` window (~2,100/cold word). groth16 read 91 words (~191k) and PLONK read 107
  (~225k) — so PLONK, having the larger proof, absorbed **more** spurious cost and its advantage was
  **understated**. `ProofSystemGas.t.sol` now hoists to memory before starting the clock, which also
  matches production (`SkillSettle` forwards the proof as **calldata**; it never SLOADs one). The old
  method reproduces its old figures exactly (933,961), so the two sets are reconciled, not in conflict.
  The groth16 baseline above was **re-measured** by temporarily restoring the deleted verifier from
  `f60cb5b` — it is a measured fact, not a back-derivation.
- **The PLONK figures are a ~1k band; the groth16 one is exact.** A PLONK proof is **randomized**
  (fresh blinding scalars per run) and verify gas is mildly data-dependent, so re-proving the same
  statement shifts the number. Measured: regenerating only the `wordle_solve` fixture moved it +712
  while the two untouched fixtures measured bit-identical. A groth16 proof is deterministic.
  `ProofSystemGas.t.sol` prints the live figure every run — treat that as the source of truth over any
  number pasted here.

Groth16 costs one EC scalar-mul (~6k gas) per public input, and sudoku_solve has 83 (81 puzzle cells +
nullifier + player) — ~510k of its 934k. PLONK evaluates public inputs in the field, so its cost is
near-flat in public-input count; ~397k net is saved per settle even after PLONK's larger proof (768B
vs 256B calldata). The Wordle circuits have few public signals, so they moved for the **trust**
property rather than the gas. (`packages/contracts/test/foundry/ProofSystemGas.t.sol` re-measures
these on every run.)

**Honest remaining caveats:**
- The **Hermez ptau is trusted as a real multi-party ceremony output** — we consume it, we do not
  generate it. Two things have been established, both by running them:
  1. **It is the genuine published artifact.** The cached file's **blake2b-512 matches the digest
     iden3/snarkjs publishes** for `powersOfTau28_hez_final_16.ptau` — corroborated against an
     independent source, not merely self-consistent. `harness.ts` re-checks that digest on **every**
     call (cache hits included) and refuses to run a setup on a mismatch; verified by test (flipping
     one byte of the ptau is rejected).
  2. **It is internally sound.** `snarkjs powersoftau verify` was run to completion (~1h) and
     returned **`Powers of Tau Ok!`** (exit 0), cryptographically re-deriving the whole contribution
     chain: **55 contributions — 54 named** (`weijie` #1 … `jarrad` #54, incl. `vb`, `jordi`,
     `brecht`, `zac`, `kobi`) **plus an unnamed final beacon (#55)**.

  What neither establishes — and what no amount of checking the bytes could: that the ceremony was
  **honest**, i.e. that at least one of those 54 contributors actually destroyed their toxic waste.
  That is a property of the ceremony, not of the file, and remains a genuine (widely-relied-upon)
  assumption. The soundness check above is reproducible with:

  ```
  node node_modules/snarkjs/build/cli.cjs powersoftau verify \
    build/powersOfTau28_hez_final_16.ptau -v
  ```

  **Budget ~an hour, and pass `-v`.** Despite the header logging `power: 2**16`, snarkjs hashes the
  first challenge over the *ceremony* power (2^28 — the original Hermez ceremony this file is
  truncated from): ~1.34e9 iterations across four blocks (tauG1/tauG2/alphaTauG1/betaTauG1) before it
  even reaches the contribution chain. Without `-v` it prints nothing until it finishes, which is
  indistinguishable from a hang — we killed it twice on that misreading before letting it run.
  Expected final line: `Powers of Tau Ok!`
- **Not audited.** Circuits, verifiers, and the settle wiring have had no external review.
- fflonk was skipped: it needs a ~2^19 ptau (~576MB) and is BETA in snarkjs; PLONK already wins.

## Problem

The catalog is all RNG casino games (Crash, Plinko, Mines, …) made provably-fair by
commit-before-bet + recompute-settle (+ the Noir settle-privacy and uzkge card tracks). We want a NEW
category: **provably-fair *skill* games** where the outcome hinges on solving a puzzle, made trustless
with ZK. Two games, both **circom + PLONK + snarkjs** with an on-chain Solidity verifier (precedent:
`contracts/zk/ShuffleVerifier52.sol`). This is a design blueprint from `zksnark-sudoku` (circom) and
`zordle` (halo2 → we port the idea to circom).

## The trustlessness model (shared)

Both games extend the platform's existing pattern. Where an RNG game commits a server seed before the
bet, a skill game **commits the hidden puzzle/answer before the bet**, and a **ZK proof replaces
"recompute settle"** — it proves the round was scored honestly against that commitment, without
revealing the secret. So the two trust anchors are:
1. **Commit-before-bet:** the house posts `commit = Poseidon(secret ‖ salt)` on-chain *before* the
   player stakes (they cannot swap the puzzle/word after seeing play).
2. **ZK-proven honest scoring:** every piece of feedback the player acts on is backed by a proof that
   it was computed correctly against `commit` — the house cannot lie about a clue or a win/loss.

House edge is NOT a hidden dealer advantage; it's an **explicit, published payout curve** (skill games
pay < 1× expected for the average player). Fairness = the puzzle is fixed up front and every score is
proven; the edge is transparent in the multiplier table, exactly like the RTP tables today.

## Game 1 — ZK-Wordle (house-hidden word; house proves each clue)

- **Setup:** house commits `C = Poseidon(word ‖ salt)` (word ∈ the dictionary, 5 letters). Player stakes.
- **Play:** player submits up to 6 guesses. For each guess the house returns the color clue
  (green/yellow/grey per letter) **plus a ZK proof**. Player wins a payout scaled by guesses used
  (fewer guesses → higher multiplier, per a published table); miss all 6 → loss, and the house reveals
  `word,salt` (checked against `C`) so the loss is auditable.
- **Circuit `wordle_clue`** (prover = house):
  - **Public:** `C`, the `guess` (5 letters), the returned `clue` (5 trits).
  - **Private:** `word`, `salt`.
  - **Asserts:** `Poseidon(word‖salt) == C` AND `clue == scoreGuess(word, guess)` (exact Wordle
    green/yellow/grey rules incl. duplicate-letter handling) AND `word` ∈ dictionary (Merkle/lookup).
  - This makes it impossible for the house to give a dishonest clue to steer the player toward a loss.
- **Anti-cheat for the player:** the guess is public and the payout is deterministic in guesses-used;
  nothing to hide on the player side. Dictionary membership stops "not a word" griefing.

## Game 2 — ZK-Sudoku (committed puzzle; player proves the solution)

- **Setup:** house commits a puzzle with a **unique** solution: publishes the `puzzle` (clues) and
  `Cs = Poseidon(solution ‖ salt)`; the puzzle's uniqueness + solvability is itself proven once at
  commit (a `sudoku_valid_puzzle` proof), so the house can't post an unsolvable/ambiguous board.
- **Play:** player solves and submits a ZK proof they know the solution — **the solution stays
  private** so, in a timed/multiplayer race, mempool front-runners can't copy it. Win = a valid proof
  within the time/stake terms; payout scaled by solve time or a flat skill multiplier (published).
- **Circuit `sudoku_solve`** (prover = player):
  - **Public:** `puzzle` (81 cells, 0 = blank), `Cs`, a `nullifier = Poseidon(solutionHash ‖ player)`
    binding the proof to this player+round (anti-replay / anti-front-run).
  - **Private:** `solution` (81 cells), `salt`.
  - **Asserts:** solution agrees with every non-blank `puzzle` cell; every row/col/3×3 box is a
    permutation of 1..9; `Poseidon(solution‖salt) == Cs`; nullifier well-formed.
- **Provably-fair angle:** puzzle committed before the bet (fixed), solution existence proven at
  commit, and the win is a real ZK proof — the house can't deny a valid solve or accept an invalid one.

## On-chain + integration

- **Verifiers:** `circom` → `snarkjs` → a generated Solidity PLONK verifier per circuit (renamed off
  snarkjs's fixed `PlonkVerifier` to avoid collisions), committed
  under `packages/contracts/contracts/zk/generated/` (alongside the existing generated verifiers).
- **Rules contracts:** `WordleRules.sol` / `SudokuRules.sol` (implementing the repo's `IGameRules`
  pattern) hold the commit, call the verifier on each proof, and drive settle through `HouseChannel`
  (a new `settlementMode` for "zk-skill", or reuse the existing proof mode). Payout curves live in a
  packed table like `GameTables.sol`.
- **Game modules (TS):** `examples/games/msgboard-games/src/games/{wordle,sudoku}.ts` implementing the
  existing `Game`/session shape — but `settleRound` is driven by a proof + commitment rather than
  `roundRandom`. A `zk-skill` peer package holds the circom witness builders + snarkjs proving glue
  (mirrors `zk-settle`).
- **Catalog:** register both as new `gameId`s with their multiplier tables + on-chain mirrors, exactly
  like the Phase-1..6 games.

## Milestones (ship incrementally, like the Noir track)

- **M0 — circuits + off-chain:** write `wordle_clue`, `sudoku_solve` (+ `sudoku_valid_puzzle`) in
  circom; prove/verify off-chain in Node/vitest against known vectors. Proves the toolchain + the game
  logic. (No contract yet.)
- **M1 — on-chain verifier:** generate the Solidity verifiers; `WordleRules`/`SudokuRules`
  verify a proof on-chain; foundry tests with real proofs.
- **M2 — game modules + catalog:** the TS game modules, session integration, payout tables, and the
  on-chain settle wiring through `HouseChannel`; end-to-end a full round each.

## Decisions (locked 2026-07-02)

1. **Sudoku format:** **single-player vs house** — stake, solve within budget, prove → fixed multiplier.
   Rules kept open to a future race-pot mode, but not built now.
2. **Commitments:** **Poseidon** (circomlib) — cheap in-circuit, the circom/snarkjs standard.
3. **Wordle payout:** a fixed table by guesses-used tuned to a target RTP (retunable) — a M2 detail, not M0.
4. **Build order:** **M0 first** — both circom circuits proven off-chain (vitest), no contracts yet.

## M0 scope (this pass)

Two circom circuits + an off-chain proving harness, TDD with vitest:
- `wordle_clue` — commitment (`Poseidon(word‖salt)==C`) + correct green/yellow/grey scoring **with
  duplicate-letter handling**. (Answer-dictionary membership deferred to M1; the crux is that the
  house can't lie about a clue.)
- `sudoku_solve` — solution ⊨ public puzzle clues + every row/col/3×3 box is a permutation of 1..9 +
  `Poseidon(solution‖salt)==Cs`. (The separate `sudoku_valid_puzzle` uniqueness proof is M1.)
- Harness: circom compile → universal Hermez ptau → `plonk setup` → prove → verify (originally a dev
  powers-of-tau + groth16 setup; migrated 2026-07-15). Tests: valid inputs
  prove+verify; tampered inputs (wrong clue, wrong commitment, invalid solution) fail (constraint
  violation at witness-gen or verify=false). Peer package `examples/games/zk-skill` (mirrors `zk-settle`).
