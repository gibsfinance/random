// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {WordleRules} from "../../contracts/zk/WordleRules.sol";
import {WordleClueVerifier} from "../../contracts/zk/generated/WordleClueVerifier.sol";
import {WordleSolveVerifier} from "../../contracts/zk/generated/WordleSolveVerifier.sol";

/// M1: on-chain Groth16 verification of the ZK-Wordle skill circuit. Deploys the generated
/// WordleClueVerifier + the WordleRules wrapper, then feeds a REAL proof fixture produced by
/// examples/games/zk-skill/scripts/genOnchainVerifiers.ts (word="crane", guess="eerie", the
/// same duplicate-letter vector the M0 vitest suite uses).
///
/// Public-signal order (asserted here, enforced by WordleRules.checkClue's packing):
///   circuits/wordle_clue.circom  `component main {public [commit, guess, clue]}`
///   => pub = [commit, guess[0..4], clue[0..4]]  (11 signals).
contract WordleRulesTest is Test {
    WordleRules internal rules;

    // Proof, loaded from the committed fixture.
    uint256[2] internal a;
    uint256[2][2] internal b;
    uint256[2] internal c;
    uint256[11] internal pub;

    // Typed public inputs (from the fixture vector).
    uint256 internal commit;
    uint256[5] internal guess;
    uint256[5] internal clue;

    // M3 wordle_solve fixture (4 signals: commit, guessesCommit, dictRoot, guessesUsed).
    uint256[2] internal sa;
    uint256[2][2] internal sb;
    uint256[2] internal sc;
    uint256 internal sCommit;
    uint256 internal sGuessesCommit;
    uint256 internal sDictRoot;
    uint256 internal sGuessesUsed;

    function setUp() public {
        WordleClueVerifier verifier = new WordleClueVerifier();
        rules = new WordleRules(address(verifier), address(new WordleSolveVerifier()));

        string memory json = vm.readFile("test/foundry/fixtures/wordleClueProof.json");
        uint256[] memory pa = vm.parseJsonUintArray(json, ".pA");
        uint256[] memory pb0 = vm.parseJsonUintArray(json, ".pB0");
        uint256[] memory pb1 = vm.parseJsonUintArray(json, ".pB1");
        uint256[] memory pc = vm.parseJsonUintArray(json, ".pC");
        uint256[] memory ps = vm.parseJsonUintArray(json, ".pubSignals");
        assertEq(ps.length, 11, "fixture must have 11 public signals");

        a = [pa[0], pa[1]];
        b = [[pb0[0], pb0[1]], [pb1[0], pb1[1]]];
        c = [pc[0], pc[1]];
        for (uint256 i = 0; i < 11; i++) pub[i] = ps[i];

        // Decompose the fixture's packed signals into typed inputs for checkClue().
        commit = ps[0];
        for (uint256 i = 0; i < 5; i++) {
            guess[i] = ps[1 + i];
            clue[i] = ps[6 + i];
        }

        // M3 settlement proof fixture.
        string memory sj = vm.readFile("test/foundry/fixtures/wordleSolveProof.json");
        uint256[] memory spa = vm.parseJsonUintArray(sj, ".pA");
        uint256[] memory spb0 = vm.parseJsonUintArray(sj, ".pB0");
        uint256[] memory spb1 = vm.parseJsonUintArray(sj, ".pB1");
        uint256[] memory spc = vm.parseJsonUintArray(sj, ".pC");
        uint256[] memory sps = vm.parseJsonUintArray(sj, ".pubSignals");
        assertEq(sps.length, 4, "solve fixture must have 4 public signals");
        sa = [spa[0], spa[1]];
        sb = [[spb0[0], spb0[1]], [spb1[0], spb1[1]]];
        sc = [spc[0], spc[1]];
        sCommit = sps[0];
        sGuessesCommit = sps[1];
        sDictRoot = sps[2];
        sGuessesUsed = sps[3];
    }

    // ===================== M3: wordle_solve settlement proof (sequence + dictionary) ===============

    function test_checkSolve_realProof() public view {
        assertTrue(
            rules.checkSolve(sa, sb, sc, sCommit, sGuessesCommit, sDictRoot, sGuessesUsed),
            "checkSolve rejected a valid settlement proof"
        );
        assertEq(sGuessesUsed, 2, "fixture solves at guess 2");
    }

    // understating guesses-used (claim a richer multiplier) => the public signal no longer matches
    // the proof => Groth16 verify fails. This is the co-sign-free binding.
    function test_checkSolve_understatedGuessesUsed_failsClosed() public view {
        assertFalse(
            rules.checkSolve(sa, sb, sc, sCommit, sGuessesCommit, sDictRoot, 1),
            "understated guesses-used must not verify"
        );
    }

    function test_checkSolve_wrongDictRoot_failsClosed() public view {
        assertFalse(
            rules.checkSolve(sa, sb, sc, sCommit, sGuessesCommit, sDictRoot + 1, sGuessesUsed),
            "mismatched dictionary root must not verify"
        );
    }

    function test_checkSolve_wrongGuessesCommit_failsClosed() public view {
        assertFalse(
            rules.checkSolve(sa, sb, sc, sCommit, sGuessesCommit + 1, sDictRoot, sGuessesUsed),
            "mismatched guess-sequence commitment must not verify"
        );
    }

    function test_checkSolve_wrongCommit_failsClosed() public view {
        assertFalse(
            rules.checkSolve(sa, sb, sc, sCommit + 1, sGuessesCommit, sDictRoot, sGuessesUsed),
            "mismatched word commitment must not verify"
        );
    }

    function test_checkSolve_tamperedProof_failsClosed() public view {
        uint256[2] memory badA = [sa[0] ^ 0xff, sa[1]];
        assertFalse(
            rules.checkSolve(badA, sb, sc, sCommit, sGuessesCommit, sDictRoot, sGuessesUsed),
            "tampered settlement proof must not verify"
        );
    }

    // --- positive: a real proof verifies through both entrypoints ---
    function test_verifyClue_realProof() public view {
        assertTrue(rules.verifyClue(a, b, c, pub), "verifyClue rejected a valid proof");
    }

    function test_checkClue_realProof() public view {
        assertTrue(rules.checkClue(a, b, c, commit, guess, clue), "checkClue rejected a valid proof");
    }

    // --- the typed helper packs pub in the SAME order the raw path expects ---
    function test_checkClue_matches_verifyClue_packing() public view {
        assertEq(
            rules.checkClue(a, b, c, commit, guess, clue),
            rules.verifyClue(a, b, c, pub),
            "checkClue and verifyClue disagree - packing order mismatch"
        );
    }

    // --- negative: flip one byte of the proof (pA.x) => Groth16 verify fails, fail-closed ---
    function test_tamperedProof_failsClosed() public view {
        uint256[2] memory badA = [a[0] ^ 0xff, a[1]];
        assertFalse(rules.verifyClue(badA, b, c, pub), "tampered proof must not verify");
    }

    // --- negative: valid proof but a MISMATCHED public input (wrong clue) => fails ---
    function test_wrongClue_failsClosed() public view {
        uint256[5] memory badClue = clue;
        // flip clue[0] from grey(0) to yellow(1): a public input the proof was NOT made for.
        badClue[0] = clue[0] == 0 ? 1 : 0;
        assertFalse(rules.checkClue(a, b, c, commit, guess, badClue), "mismatched clue must not verify");
    }

    // --- negative: wrong commit (the hidden-word binding) => fails ---
    function test_wrongCommit_failsClosed() public view {
        assertFalse(rules.checkClue(a, b, c, commit + 1, guess, clue), "mismatched commit must not verify");
    }

    // --- negative: wrong guess => fails ---
    function test_wrongGuess_failsClosed() public view {
        uint256[5] memory badGuess = guess;
        badGuess[0] = (guess[0] + 1) % 26;
        assertFalse(rules.checkClue(a, b, c, commit, badGuess, clue), "mismatched guess must not verify");
    }
}
