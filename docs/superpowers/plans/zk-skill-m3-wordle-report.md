# ZK skill games — M3 (Wordle track) report

**Date:** 2026-07-14
**Repo:** gibsfinance/random · branch `feat/zk-skill-m3-wordle` (worktree; based on M2 `2a9d064`)
**Scope:** the Wordle half of M3. (Sudoku hardening ships on a sibling branch.)

> **Update 2026-07-15 — migrated to PLONK; NO ceremony is required.** The "real trusted setup" /
> "dev-beacon toxic-waste setup" item below is **RESOLVED and no longer a caveat**. Groth16 needed a
> per-circuit phase-2 ceremony re-run on every circuit change, and the zkeys shipped here had ZERO
> contributions (a fixed public dev beacon), so the toxic waste was effectively public — anyone could
> forge a winning proof and drain the house. All three circuits now use **PLONK over the universal
> Hermez `powersOfTau28_hez_final_16.ptau`**, which has **no per-circuit setup at all**. It is also
> ~43% cheaper to verify sudoku_solve on-chain (~528.8k vs 933,945 gas). Circuits, public-signal orders
> and every security property are unchanged; proofs are now `uint256[24]`. Remaining honest caveats:
> the Hermez ptau is trusted as a real multi-party ceremony output (we consume it, we don't generate
> it). Its blake2b matches the digest iden3/snarkjs publishes and is re-checked on every call, and
> `snarkjs powersoftau verify` was run to completion — `Powers of Tau Ok!`, 55 contributions — so the
> file is the genuine artifact AND internally sound; whether the ceremony was HONEST (>=1 of the 54
> contributors destroyed their waste) is unprovable from the bytes and stays an assumption. **None of
> this is audited.** See
> `docs/superpowers/specs/2026-07-02-zk-skill-games-design.md` § "Proving system".

Follows M2 (`docs/superpowers/plans/zk-skill-m2-report.md`). This closes the two Wordle items M2
deferred: (1) trustless guess-sequence binding so `settleWordle` needs no house co-signature, and
(2) dictionary membership.

## What M3-Wordle delivers

### New circuit — `circuits/wordle_solve.circom` (the SETTLEMENT proof)
`wordle_clue` (unchanged) still proves a single clue honest during play. `wordle_solve` is a NEW,
separate circuit that proves the whole round outcome for a permissionless settle.

- **Public signals (order):** `[commit, guessesCommit, dictRoot, guessesUsed]` (4 signals, no public
  outputs).
- **Private:** `word[5]`, `salt`, `guess[6][5]` (the committed ordered sequence), the dictionary
  Merkle path for the winning word.
- **What it proves:**
  - `commit = Poseidon(word, salt)` (the house's committed word).
  - `guessesCommit = Poseidon(packedGuess[0..5])` where `packedGuess[i] = Σ_j guess[i][j]·26^j`
    (base-26, little-endian, letters range-checked <26) — the player's ORDERED sequence commitment.
  - `isSolved[i] = (packedGuess[i] == packedWord)` (all-green ⟺ packed-equal, given the ranges).
  - `guessesUsed` == the FIRST all-green position: `notPrefix[i] = Π_{k<i}(1-isSolved[k])`,
    `firstAt[i] = notPrefix[i]·isSolved[i]`, exactly one `firstAt` is 1 (⇒ a win) and
    `Σ (i+1)·firstAt[i] === guessesUsed`.
  - `packedWord ∈ dictRoot` (Poseidon(2) Merkle inclusion) — the answer (== the winning guess) is a
    real dictionary word.
- **Size:** ~1.9k non-linear (~4.4k total) constraints. Originally a power-13 dev-beacon ptau
  generated locally; since 2026-07-15 it uses the **universal Hermez 2^16 ptau** shared by all three
  circuits, with no per-circuit setup. Every Poseidon call is ≤6 inputs.

### Why the invariants hold
- **House cannot deny a real solve / give a dishonest clue** — clue honesty stays in `wordle_clue`;
  the settle proof scores all-green against the *committed* word, so a valid solve always has a valid
  proof that anyone holding `word,salt,guesses` can produce.
- **Player cannot fake a solve** — `Σ firstAt == 1` requires some committed guess to equal the
  committed word; the player commits guesses blind (before the word is known).
- **Player cannot understate guesses-used** — the whole ordered sequence is committed and every
  earlier guess is proven non-solving; `guessesUsed` is pinned to the first-solve index, checked as a
  public signal (a wrong claim fails the ZK verify). This is what removes the house co-signature.
- **Player cannot pass off a non-dictionary word** — the winning word must be in the committed
  `dictRoot`.
- **Each clue stays honestly scored** — `wordle_clue` (and its M0/M1 tests + fixture) is untouched.

### On-chain (permissionless `settleWordle`)
- Generated verifier `contracts/zk/generated/WordleSolvePlonkVerifier.sol` + `WordleRules.checkSolve(...)`.
- `SkillSettle.settleWordle` now takes just `(tableId, proof, guessesUsed)` — **no `houseSig`, no
  clue/guess arrays**. It verifies the `wordle_solve` proof against `t.commit`, the guesses-commitment
  (stored in the second-commitment slot `t.puzzleHash`), and a global owner-set `wordleDictRoot`, then
  pays `wordleMultX100(guessesUsed)`. Anyone can call it.
- The player's `guessesCommit` is pinned in the house-signed open terms via the existing
  `puzzleHash`/second-commitment slot — **no `SkillOpenTerms` struct change** (so the Sudoku branch's
  signing is untouched).

### Tests (all real proofs, all run)
- `@gibs/zk-skill` vitest: **25 passed** (was 16; +9 `wordle_solve` circuit tests). Includes the
  off-chain e2e producing+verifying the settlement proof on a win.
- `packages/contracts` foundry: **176 passed** repo-wide, 0 failed. Wordle-specific:
  - `WordleRules.t.sol`: **13** (7 M1 clue + 6 new `checkSolve`).
  - `SkillSettle.t.sol`: **14**, including the flagship **`test_wordle_fullRound_realProof_pays3_50x`**
    — the first end-to-end on-chain Wordle solve→payout, permissionless, paying the correct
    guesses-used (=2 → 3.50×) multiplier; plus understated-guesses / tampered-proof / wrong-dict-root
    fail-closed and the deadline-reclaim loss path.

### Test dictionary
A 16-word committed set (`TEST_DICTIONARY` in `src/wordleSolve.ts`) → a depth-4 Merkle tree. Enough
to exercise membership end-to-end and keep fixtures small/deterministic. Production commits a full
word list (deeper tree); the leaf/packing/hashing scheme is unchanged by depth.

## Deferred (with honest reasons)
1. **Griefed-solve reveal.** The settle proof needs `word,salt` (only the house has `salt`), and the
   house loses money on a player win, so a malicious house can withhold `salt` and refuse to build the
   proof — the same residual M2 had (its co-sign could equally be withheld). The permissionless settle
   is strictly better (anyone with `word,salt,guesses` can settle), but the *forced* path — the house
   must post `word+salt` by the deadline (checked against `commit`) or forfeit, letting the player
   self-settle — needs either on-chain Poseidon or a reveal-and-penalty escrow flow. Left as a design
   increment; `reclaim` currently returns the pot to the house after the deadline (as in M2).
2. **Adaptive play.** Committing all 6 guesses up front makes the round non-adaptive (a sound but
   different Wordle variant). Adaptive play with the same binding needs a per-turn co-signed transcript
   (the `HouseSession` channel) — the session-integration item already on the M3 list.
3. ~~**Real trusted setup.**~~ **RESOLVED 2026-07-15:** migrated to PLONK over the universal Hermez
   ptau — there is no per-circuit ceremony, and the dev/beacon toxic-waste setup is gone. The Hermez
   ceremony itself is still trusted as a real ceremony output, and none of this is audited.
