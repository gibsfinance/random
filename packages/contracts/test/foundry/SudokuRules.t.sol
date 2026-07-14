// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SudokuRules} from "../../contracts/zk/SudokuRules.sol";
import {SudokuSolveVerifier} from "../../contracts/zk/generated/SudokuSolveVerifier.sol";

/// M1: on-chain Groth16 verification of the ZK-Sudoku skill circuit. Deploys the generated
/// SudokuSolveVerifier + the SudokuRules wrapper, then feeds a REAL proof fixture produced by
/// examples/games/zk-skill/scripts/genOnchainVerifiers.ts (the band-rotation solution/puzzle
/// vector the M0 vitest suite uses).
///
/// Public-signal order (asserted here, enforced by SudokuRules.checkSolve's packing):
///   circuits/sudoku_solve.circom  `component main {public [puzzle, commit]}`
///   => pub = [puzzle[0..80], commit]  (82 signals).
contract SudokuRulesTest is Test {
    SudokuRules internal rules;

    uint256[2] internal a;
    uint256[2][2] internal b;
    uint256[2] internal c;
    uint256[82] internal pub;

    uint256[81] internal puzzle;
    uint256 internal commit;

    function setUp() public {
        SudokuSolveVerifier verifier = new SudokuSolveVerifier();
        rules = new SudokuRules(address(verifier));

        string memory json = vm.readFile("test/foundry/fixtures/sudokuSolveProof.json");
        uint256[] memory pa = vm.parseJsonUintArray(json, ".pA");
        uint256[] memory pb0 = vm.parseJsonUintArray(json, ".pB0");
        uint256[] memory pb1 = vm.parseJsonUintArray(json, ".pB1");
        uint256[] memory pc = vm.parseJsonUintArray(json, ".pC");
        uint256[] memory ps = vm.parseJsonUintArray(json, ".pubSignals");
        assertEq(ps.length, 82, "fixture must have 82 public signals");

        a = [pa[0], pa[1]];
        b = [[pb0[0], pb0[1]], [pb1[0], pb1[1]]];
        c = [pc[0], pc[1]];
        for (uint256 i = 0; i < 82; i++) pub[i] = ps[i];

        // Decompose: [puzzle[0..80], commit].
        for (uint256 i = 0; i < 81; i++) puzzle[i] = ps[i];
        commit = ps[81];
    }

    // --- positive: a real proof verifies through both entrypoints ---
    function test_verifySolve_realProof() public view {
        assertTrue(rules.verifySolve(a, b, c, pub), "verifySolve rejected a valid proof");
    }

    function test_checkSolve_realProof() public view {
        assertTrue(rules.checkSolve(a, b, c, puzzle, commit), "checkSolve rejected a valid proof");
    }

    // --- the typed helper packs pub in the SAME order the raw path expects ---
    function test_checkSolve_matches_verifySolve_packing() public view {
        assertEq(
            rules.checkSolve(a, b, c, puzzle, commit),
            rules.verifySolve(a, b, c, pub),
            "checkSolve and verifySolve disagree - packing order mismatch"
        );
    }

    // --- negative: flip one byte of the proof (pA.x) => Groth16 verify fails, fail-closed ---
    function test_tamperedProof_failsClosed() public view {
        uint256[2] memory badA = [a[0] ^ 0xff, a[1]];
        assertFalse(rules.verifySolve(badA, b, c, pub), "tampered proof must not verify");
    }

    // --- negative: valid proof but a MISMATCHED public input (wrong puzzle clue) => fails ---
    function test_wrongPuzzle_failsClosed() public view {
        uint256[81] memory badPuzzle = puzzle;
        // puzzle[0] is a revealed clue (value 1); change it to a different digit the proof
        // was NOT made for.
        badPuzzle[0] = puzzle[0] == 9 ? 8 : 9;
        assertFalse(rules.checkSolve(a, b, c, badPuzzle, commit), "mismatched puzzle must not verify");
    }

    // --- negative: wrong commit (the hidden-solution binding) => fails ---
    function test_wrongCommit_failsClosed() public view {
        assertFalse(rules.checkSolve(a, b, c, puzzle, commit + 1), "mismatched commit must not verify");
    }
}
