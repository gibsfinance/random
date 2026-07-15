// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SudokuSolveVerifier} from "./generated/SudokuSolveVerifier.sol";

/// On-chain Groth16 verification for the ZK-Sudoku skill game (M3 "role-flip"). This is
/// NOT an IGameRules implementation — that interface is for turn-based channel games
/// (ZkTable disputes) and does not fit a single-shot skill-game proof.
///
/// Proves: the prover knows a VALID solution to a committed public `puzzle`
/// (rows/columns/3x3 boxes each a permutation of 1..9, agreeing with every non-blank
/// puzzle clue), WITHOUT revealing the solution. The proof no longer references any
/// house secret (M2's `Poseidon(solution‖salt)==commit` was unprovable for the player
/// and house-griefable); instead it is bound to a public `player` via a `nullifier`,
/// so a mempool watcher cannot replay/front-run a solve in a timed race. Solvability of
/// the puzzle is guaranteed separately by the HOUSE producing a solve proof at open —
/// see SkillSettle.openSudoku.
///
/// nullifier = Poseidon(rowDigest[0..8], player), rowDigest[r] = Poseidon(solution row r).
///
/// Public-signal ORDER (snarkjs emits OUTPUTS first, then public inputs in declaration
/// order) — must match the circuit's `main` declaration exactly:
///   circuits/sudoku_solve.circom  component main {public [puzzle, player]} = SudokuSolve()
///   with `signal output nullifier`
///   => pub = [nullifier, puzzle[0..80], player]  (83 signals).
contract SudokuRules {
    SudokuSolveVerifier public immutable verifier;

    constructor(address verifier_) {
        verifier = SudokuSolveVerifier(verifier_);
    }

    /// Raw verify: caller supplies `pub` already packed in circuit order. Prefer
    /// `checkSolve` below unless the packed array is already on hand (e.g. read
    /// verbatim from an off-chain fixture) — packing it by hand here is exactly the
    /// mistake `checkSolve` exists to prevent.
    function verifySolve(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[83] calldata pub
    ) public view returns (bool) {
        return verifier.verifyProof(a, b, c, pub);
    }

    /// Typed helper: packs `pub` in the circuit's exact public-signal order
    /// [nullifier, puzzle[0..80], player] so callers cannot misorder it. The proof
    /// verifies only for the exact (puzzle, player, nullifier) triple it was made for,
    /// so passing the table's `player` binds the proof to that player.
    function checkSolve(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[81] calldata puzzle,
        uint256 player,
        uint256 nullifier
    ) external view returns (bool) {
        uint256[83] memory pub;
        pub[0] = nullifier;
        for (uint256 i = 0; i < 81; i++) {
            pub[1 + i] = puzzle[i];
        }
        pub[82] = player;
        return verifier.verifyProof(a, b, c, pub);
    }
}
