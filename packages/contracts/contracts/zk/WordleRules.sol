// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {WordleClueVerifier} from "./generated/WordleClueVerifier.sol";

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
contract WordleRules {
    WordleClueVerifier public immutable verifier;

    constructor(address verifier_) {
        verifier = WordleClueVerifier(verifier_);
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
}
