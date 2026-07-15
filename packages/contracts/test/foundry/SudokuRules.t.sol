// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SudokuRules} from "../../contracts/zk/SudokuRules.sol";
import {SudokuSolveVerifier} from "../../contracts/zk/generated/SudokuSolveVerifier.sol";

/// On-chain Groth16 verification of the ZK-Sudoku skill circuit (M3 role-flip). Deploys the generated
/// SudokuSolveVerifier + the SudokuRules wrapper, then feeds a REAL proof fixture produced by
/// examples/games/zk-skill/scripts/genProofFixtures.ts (the band-rotation solution/puzzle vector the
/// vitest suite uses, bound to a fixed fixture player 0xabab..ab).
///
/// Public-signal order (asserted here, enforced by SudokuRules.checkSolve's packing):
///   circuits/sudoku_solve.circom  `component main {public [puzzle, player]}` + `signal output nullifier`
///   snarkjs emits outputs first => pub = [nullifier, puzzle[0..80], player]  (83 signals).
contract SudokuRulesTest is Test {
    SudokuRules internal rules;

    uint256[2] internal a;
    uint256[2][2] internal b;
    uint256[2] internal c;
    uint256[83] internal pub;

    uint256[81] internal puzzle;
    uint256 internal player;
    uint256 internal nullifier;

    function setUp() public {
        SudokuSolveVerifier verifier = new SudokuSolveVerifier();
        rules = new SudokuRules(address(verifier));

        string memory json = vm.readFile("test/foundry/fixtures/sudokuSolveProof.json");
        uint256[] memory pa = vm.parseJsonUintArray(json, ".pA");
        uint256[] memory pb0 = vm.parseJsonUintArray(json, ".pB0");
        uint256[] memory pb1 = vm.parseJsonUintArray(json, ".pB1");
        uint256[] memory pc = vm.parseJsonUintArray(json, ".pC");
        uint256[] memory ps = vm.parseJsonUintArray(json, ".pubSignals");
        assertEq(ps.length, 83, "fixture must have 83 public signals");

        a = [pa[0], pa[1]];
        b = [[pb0[0], pb0[1]], [pb1[0], pb1[1]]];
        c = [pc[0], pc[1]];
        for (uint256 i = 0; i < 83; i++) pub[i] = ps[i];

        // Decompose: [nullifier, puzzle[0..80], player].
        nullifier = ps[0];
        for (uint256 i = 0; i < 81; i++) puzzle[i] = ps[1 + i];
        player = ps[82];
    }

    // --- positive: a real proof verifies through both entrypoints ---
    function test_verifySolve_realProof() public view {
        assertTrue(rules.verifySolve(a, b, c, pub), "verifySolve rejected a valid proof");
    }

    function test_checkSolve_realProof() public view {
        assertTrue(rules.checkSolve(a, b, c, puzzle, player, nullifier), "checkSolve rejected a valid proof");
    }

    // --- the typed helper packs pub in the SAME order the raw path expects ---
    function test_checkSolve_matches_verifySolve_packing() public view {
        assertEq(
            rules.checkSolve(a, b, c, puzzle, player, nullifier),
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
        assertFalse(rules.checkSolve(a, b, c, badPuzzle, player, nullifier), "mismatched puzzle must not verify");
    }

    // --- negative: wrong player binding (the anti-front-run binding) => fails ---
    function test_wrongPlayer_failsClosed() public view {
        assertFalse(rules.checkSolve(a, b, c, puzzle, player + 1, nullifier), "mismatched player must not verify");
    }

    // --- negative: wrong nullifier (the solution binding) => fails ---
    function test_wrongNullifier_failsClosed() public view {
        assertFalse(rules.checkSolve(a, b, c, puzzle, player, nullifier + 1), "mismatched nullifier must not verify");
    }
}
