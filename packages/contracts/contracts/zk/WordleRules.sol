// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {WordleClueVerifier} from "./generated/WordleClueVerifier.sol";
import {WordleSolveVerifier} from "./generated/WordleSolveVerifier.sol";

/// M1: minimal on-chain Groth16 verification for the ZK-Wordle skill game. This is
/// NOT an IGameRules implementation — that interface is for turn-based channel games
/// (ZkTable disputes) and does not fit a single-shot skill-game proof. Money/escrow
/// wiring (settle-on-verify) is out of scope for M1; see M2.
///
/// Proves: the house scored `guess` against a committed hidden `word` (+ `salt`)
/// honestly, per circuits/wordle_clue.circom's duplicate-letter-aware scoring, without
/// revealing `word`/`salt`.
///
/// Public-signal ORDER must match the circuit's `main` declaration exactly:
///   circuits/wordle_clue.circom:116  component main {public [commit, guess, clue]}
/// i.e. pub = [commit, guess[0], guess[1], guess[2], guess[3], guess[4],
///             clue[0], clue[1], clue[2], clue[3], clue[4]]  (11 signals).
///
/// M3 adds the SETTLEMENT verifier (wordle_solve): it proves the whole committed guess SEQUENCE's
/// first all-green position (guesses-used, the payout scale) AND that the answer is a dictionary word,
/// so on-chain settleWordle needs no house co-signature over guesses-used. See `checkSolve`.
///   circuits/wordle_solve.circom  component main {public [commit, guessesCommit, dictRoot, guessesUsed]}
contract WordleRules {
    WordleClueVerifier public immutable verifier;
    WordleSolveVerifier public immutable solveVerifier;

    constructor(address verifier_, address solveVerifier_) {
        verifier = WordleClueVerifier(verifier_);
        solveVerifier = WordleSolveVerifier(solveVerifier_);
    }

    /// Raw verify: caller supplies `pub` already packed in circuit order. Prefer
    /// `checkClue` below unless the packed array is already on hand (e.g. read
    /// verbatim from an off-chain fixture) — packing it by hand here is exactly the
    /// mistake `checkClue` exists to prevent.
    function verifyClue(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[11] calldata pub
    ) public view returns (bool) {
        return verifier.verifyProof(a, b, c, pub);
    }

    /// Typed helper: packs `pub` in the circuit's exact public-signal order so
    /// callers cannot misorder it.
    function checkClue(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256 commit,
        uint256[5] calldata guess,
        uint256[5] calldata clue
    ) external view returns (bool) {
        uint256[11] memory pub;
        pub[0] = commit;
        for (uint256 i = 0; i < 5; i++) {
            pub[1 + i] = guess[i];
            pub[6 + i] = clue[i];
        }
        return verifier.verifyProof(a, b, c, pub);
    }

    /// M3 SETTLEMENT check: verify a wordle_solve proof binding the committed word (`commit`) and the
    /// committed ordered guess sequence (`guessesCommit`) to a proven first all-green position
    /// (`guessesUsed`) with the answer in the committed dictionary (`dictRoot`). Packs `pub` in the
    /// circuit's exact public-signal order [commit, guessesCommit, dictRoot, guessesUsed].
    function checkSolve(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256 commit,
        uint256 guessesCommit,
        uint256 dictRoot,
        uint256 guessesUsed
    ) external view returns (bool) {
        uint256[4] memory pub;
        pub[0] = commit;
        pub[1] = guessesCommit;
        pub[2] = dictRoot;
        pub[3] = guessesUsed;
        return solveVerifier.verifyProof(a, b, c, pub);
    }
}
