// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SudokuSolveVerifier} from "./generated/SudokuSolveVerifier.sol";

/// M1: minimal on-chain Groth16 verification for the ZK-Sudoku skill game. This is
/// NOT an IGameRules implementation — that interface is for turn-based channel games
/// (ZkTable disputes) and does not fit a single-shot skill-game proof. Money/escrow
/// wiring (settle-on-verify) is out of scope for M1; see M2.
///
/// Proves: the caller knows a valid solution to a committed public `puzzle`
/// (rows/columns/3x3 boxes each a permutation of 1..9, agreeing with every
/// non-blank puzzle clue), without revealing the solution.
///
/// Public-signal ORDER must match the circuit's `main` declaration exactly:
///   circuits/sudoku_solve.circom:131  component main {public [puzzle, commit]}
/// i.e. pub = [puzzle[0], ..., puzzle[80], commit]  (82 signals).
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
        uint256[82] calldata pub
    ) public view returns (bool) {
        return verifier.verifyProof(a, b, c, pub);
    }

    /// Typed helper: packs `pub` in the circuit's exact public-signal order so
    /// callers cannot misorder it.
    function checkSolve(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[81] calldata puzzle,
        uint256 commit
    ) external view returns (bool) {
        uint256[82] memory pub;
        for (uint256 i = 0; i < 81; i++) {
            pub[i] = puzzle[i];
        }
        pub[81] = commit;
        return verifier.verifyProof(a, b, c, pub);
    }
}
