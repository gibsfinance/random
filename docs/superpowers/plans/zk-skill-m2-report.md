# ZK skill games — M2 report (game modules, payout tables, on-chain settle)

**Date:** 2026-07-14
**Repo:** gibsfinance/random · branch `feat/zk-skill-games`
**Status:** M2 shipped + tested. Follows M0 (`060fe37`, circuits off-chain) and M1 (`1a08664`, on-chain
Groth16 verifiers; since migrated to PLONK — see the update below). See
`docs/superpowers/specs/2026-07-02-zk-skill-games-design.md` for the design.

> **Update 2026-07-15 — migrated to PLONK; NO ceremony is required.** The "real trusted setup" /
> "dev-beacon toxic-waste setup" item below is **RESOLVED and no longer a caveat**. Groth16 needed a
> per-circuit phase-2 ceremony re-run on every circuit change, and the zkeys shipped here had ZERO
> contributions (a fixed public dev beacon), so the toxic waste was effectively public — anyone could
> forge a winning proof and drain the house. All three circuits now use **PLONK over the universal
> Hermez `powersOfTau28_hez_final_16.ptau`**, which has **no per-circuit setup at all**. It is also
> ~59% cheaper to verify sudoku_solve on-chain (~305k vs 743,449 gas, both memory-hoisted). Circuits, public-signal orders
> and every security property are unchanged; proofs are now `uint256[24]`. Remaining honest caveats:
> the Hermez ptau is trusted as a real multi-party ceremony output (we consume it, we don't generate
> it). Its blake2b matches the digest iden3/snarkjs publishes and is re-checked on every call, and
> `snarkjs powersoftau verify` was run to completion — `Powers of Tau Ok!`, 55 contributions — so the
> file is the genuine artifact AND internally sound; whether the ceremony was HONEST (>=1 of the 54
> contributors destroyed their waste) is unprovable from the bytes and stays an assumption. **None of
> this is audited.** See
> `docs/superpowers/specs/2026-07-02-zk-skill-games-design.md` § "Proving system".


## What M2 delivers

M2 is the **economic layer**: the proof-driven analog of the RNG games' settle path. The RNG games
settle from `raw = roundRandom(...)` via `Game<TParams>`; skill games settle from a VERIFIED result
(Wordle: guesses-used to reach all-green; Sudoku: whether a valid solve was proven) via a parallel
`SkillGame<TParams, TResult>` shape. Three layers, all tested:

### 1. TS payout tables + game modules + catalog (`@gibs/msgboard-games`)
- `src/skill.ts` — the `SkillGame` interface + `skillOutcome` helper (proof-driven twin of `game.ts`).
- `src/games/wordle.ts` (**gameId 30**) — payout multiplier by guesses-used
  `[25×, 3.5×, 1.30×, 0.80×, 0.55×, 0.25×]`; a published "average player" reference distribution.
- `src/games/sudoku.ts` (**gameId 31**) — flat `1.90×` on a proven solve; a published reference solve
  rate (50%) the edge is quoted against.
- Registered in `src/index.ts`. Tested in `test/skillGames.test.ts` (11 tests).
- **FAIRNESS**, pinned by `rtpBps`: Wordle realized RTP under its reference distribution is **94.60%**
  (5.4% edge); Sudoku is **95.00%** (0.50 × 1.90). Both ≤ 100% — never player-favourable for the
  average player. (A *skilled* player can beat these — that is the point of a skill game; the house
  edge is an explicit, published curve, not a hidden dealer advantage.)

### 2. On-chain payout mirror + settle contract (`packages/contracts`)
- `contracts/games/SkillPayouts.sol` — pure library mirroring the TS curves bit-for-bit (parity pinned
  in the foundry suite) + the `isAllGreen` solve predicate.
- `contracts/games/SkillSettle.sol` — escrowed settlement backend (Chips ERC20, house-signed open
  terms, per-table escrow reservation — the HouseChannel pattern, but ZK-skill instead of
  Noir/UltraHonk-conservation). Two settle paths:
  - **Sudoku (`settleSudoku`)** — FULLY TRUSTLESS + permissionless: verify the solve proof via
    `SudokuRules` against the committed puzzle+commitment → pay `1.90×`. The house cannot block a valid
    solve; the player cannot fake one; no solve by the deadline → the house reclaims the stake.
  - **Wordle (`settleWordle`)** — the player submits an all-green clue proof (a proven solve) AND the
    house co-signs the guesses-used (the multiplier scale). See the deferral note below.
- Tested in `test/foundry/SkillSettle.t.sol` (12 tests): a **full trustless Sudoku round with the REAL
  M1 proof fixture** pays exactly `1.90×`; tampered proof / swapped puzzle / forged house-sig /
  thin-escrow / pre-deadline-reclaim all fail-closed; Wordle payout-parity + all-green predicate +
  fail-closed (non-green clue, fabricated all-green without a matching proof, forged count-sig).

### 3. Off-chain end-to-end settle (`@gibs/zk-skill`)
- `src/settle.ts` — `playWordleRound` / `playSudokuRound`: generate REAL ZK proof(s) (PLONK since
  2026-07-15), verify,
  derive the result, and settle the payout through the `@gibs/msgboard-games` modules (the payout math
  is imported, never re-implemented, so off-chain ↔ on-chain ↔ TS cannot drift). Mirrors
  `@gibs/zk-settle`'s `settle.ts`.
- Tested in `test/settle.test.ts` (4 tests) — a **full round each with real proofs**: Wordle solve-in-2
  → 3.50× (both clues independently verified), solve-in-1 → the 25× ceiling, miss-all-6 → loss (every
  clue still proven); Sudoku real solve proof → 1.90×.

## Test totals (all run, all green)
- `@gibs/msgboard-games` vitest: **223 passed** (11 new; 0 regressions).
- `packages/contracts` foundry (SkillSettle + WordleRules + SudokuRules): **25 passed** (12 new + M1's 13).
- `@gibs/zk-skill` vitest: **16 passed** (4 new e2e + M0/M1's 12).

## Deliberately deferred to M3 (with reasons — nothing silently faked)

1. **Wordle trustless guess-sequence binding.** A single clue proof attests a clue is HONEST, not the
   guess's POSITION in the sequence, so a permissionless `settleWordle` would let a player understate
   guesses-used to grab a richer multiplier. M2 closes this with a house co-signature over
   `(tableId, guessesUsed)` — safe (neither side can cheat the other) but cooperative. A fully
   permissionless Wordle needs the interactive channel to commit the guess sequence, plus the house's
   `word+salt` reveal to make a griefed solve auditable on-chain. Its happy-path on-chain test also
   needs an all-green proof fixture (the M1 fixture is a non-solve `crane/eerie` vector) — the
   off-chain suite already proves the full Wordle solve→payout path.
2. **Circuit hardening** (each is a NEW circuit; under Groth16 each also needed its OWN phase-2
   ceremony — deferred as a unit rather than rushed, the exact failure mode that bit M1's multi-agent
   setup. Under PLONK, since 2026-07-15, a new circuit needs NO new setup):
   - Wordle **dictionary membership** (guess ∈ the word list) — stops "not a word" griefing.
   - Sudoku **`sudoku_valid_puzzle`** uniqueness/solvability proof at commit — stops the house posting
     an unsolvable/ambiguous board.
   - **Anti-front-run / anti-replay nullifier** (`Poseidon(solutionHash ‖ player)`) binding a Sudoku
     proof to one player+round, so a mempool watcher cannot copy a solve in a timed race.
3. **Session integration** — driving skill rounds through the co-signed `HouseSession`/transcript (the
   RNG games' channel). ~~and a real multi-party **trusted-setup ceremony**~~ — RESOLVED 2026-07-15 by
   the PLONK migration: there is no per-circuit ceremony to run.
