# Design: ZK skill games — provably-fair Sudoku + Wordle (circom/Groth16)

**Date:** 2026-07-02
**Repo:** gibsfinance/random
**Status:** design proposal → pending approval

## Problem

The catalog is all RNG casino games (Crash, Plinko, Mines, …) made provably-fair by
commit-before-bet + recompute-settle (+ the Noir settle-privacy and uzkge card tracks). We want a NEW
category: **provably-fair *skill* games** where the outcome hinges on solving a puzzle, made trustless
with ZK. Two games, both **circom + Groth16 + snarkjs** with an on-chain Solidity verifier (precedent:
`contracts/zk/ShuffleVerifier52.sol`). This is a design blueprint from `zksnark-sudoku` (circom) and
`zordle` (halo2 → we port the idea to circom).

## The trustlessness model (shared)

Both games extend the platform's existing pattern. Where an RNG game commits a server seed before the
bet, a skill game **commits the hidden puzzle/answer before the bet**, and a **Groth16 proof replaces
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
  (green/yellow/grey per letter) **plus a Groth16 proof**. Player wins a payout scaled by guesses used
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
- **Play:** player solves and submits a Groth16 proof they know the solution — **the solution stays
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

- **Verifiers:** `circom` → `snarkjs` → generated Solidity `Groth16Verifier` per circuit, committed
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
- **M1 — on-chain verifier:** generate the Groth16 Solidity verifiers; `WordleRules`/`SudokuRules`
  verify a proof on-chain; foundry tests with real proofs.
- **M2 — game modules + catalog:** the TS game modules, session integration, payout tables, and the
  on-chain settle wiring through `HouseChannel`; end-to-end a full round each.

## Decisions (locked 2026-07-02)

1. **Sudoku format:** **single-player vs house** — stake, solve within budget, prove → fixed multiplier.
   Rules kept open to a future race-pot mode, but not built now.
2. **Commitments:** **Poseidon** (circomlib) — cheap in-circuit, the circom/Groth16 standard.
3. **Wordle payout:** a fixed table by guesses-used tuned to a target RTP (retunable) — a M2 detail, not M0.
4. **Build order:** **M0 first** — both circom circuits proven off-chain (vitest), no contracts yet.

## M0 scope (this pass)

Two circom circuits + an off-chain proving harness, TDD with vitest:
- `wordle_clue` — commitment (`Poseidon(word‖salt)==C`) + correct green/yellow/grey scoring **with
  duplicate-letter handling**. (Answer-dictionary membership deferred to M1; the crux is that the
  house can't lie about a clue.)
- `sudoku_solve` — solution ⊨ public puzzle clues + every row/col/3×3 box is a permutation of 1..9 +
  `Poseidon(solution‖salt)==Cs`. (The separate `sudoku_valid_puzzle` uniqueness proof is M1.)
- Harness: circom compile → dev powers-of-tau → groth16 setup → prove → verify. Tests: valid inputs
  prove+verify; tampered inputs (wrong clue, wrong commitment, invalid solution) fail (constraint
  violation at witness-gen or verify=false). Peer package `examples/games/zk-skill` (mirrors `zk-settle`).
