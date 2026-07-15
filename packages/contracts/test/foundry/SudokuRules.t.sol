// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SudokuRules} from "../../contracts/zk/SudokuRules.sol";
import {SudokuSolvePlonkVerifier} from "../../contracts/zk/generated/SudokuSolvePlonkVerifier.sol";

/// On-chain PLONK verification of the ZK-Sudoku skill circuit (M3 role-flip). Deploys the generated
/// SudokuSolvePlonkVerifier + the SudokuRules wrapper, then feeds a REAL proof fixture produced by
/// examples/games/zk-skill/scripts/genProofFixtures.ts (the band-rotation solution/puzzle vector the
/// vitest suite uses, bound to a fixed fixture player 0xabab..ab).
///
/// The verifier and the fixture are exported from the SAME zkey in one pass by that script — a desync
/// there is silent and is exactly what broke M1.
///
/// Public-signal order (asserted here, enforced by SudokuRules.checkSolve's packing):
///   circuits/sudoku_solve.circom  `component main {public [puzzle, player]}` + `signal output nullifier`
///   snarkjs emits outputs first => pub = [nullifier, puzzle[0..80], player]  (83 signals).
contract SudokuRulesTest is Test {
    SudokuRules internal rules;

    uint256[24] internal proof;
    uint256[83] internal pub;

    uint256[81] internal puzzle;
    uint256 internal player;
    uint256 internal nullifier;

    function setUp() public {
        SudokuSolvePlonkVerifier verifier = new SudokuSolvePlonkVerifier();
        rules = new SudokuRules(address(verifier));

        string memory json = vm.readFile("test/foundry/fixtures/sudokuSolveProof.json");
        uint256[] memory pf = vm.parseJsonUintArray(json, ".proof");
        uint256[] memory ps = vm.parseJsonUintArray(json, ".pubSignals");
        assertEq(pf.length, 24, "fixture must have 24 plonk proof fields");
        assertEq(ps.length, 83, "fixture must have 83 public signals");

        for (uint256 i = 0; i < 24; i++) proof[i] = pf[i];
        for (uint256 i = 0; i < 83; i++) pub[i] = ps[i];

        // Decompose: [nullifier, puzzle[0..80], player].
        nullifier = ps[0];
        for (uint256 i = 0; i < 81; i++) puzzle[i] = ps[1 + i];
        player = ps[82];
    }

    // --- positive: a real proof verifies through both entrypoints ---
    function test_verifySolve_realProof() public view {
        assertTrue(rules.verifySolve(proof, pub), "verifySolve rejected a valid proof");
    }

    function test_checkSolve_realProof() public view {
        assertTrue(rules.checkSolve(proof, puzzle, player, nullifier), "checkSolve rejected a valid proof");
    }

    // --- the typed helper packs pub in the SAME order the raw path expects ---
    function test_checkSolve_matches_verifySolve_packing() public view {
        assertEq(
            rules.checkSolve(proof, puzzle, player, nullifier),
            rules.verifySolve(proof, pub),
            "checkSolve and verifySolve disagree - packing order mismatch"
        );
    }

    // --- negative: flip one byte of the proof (A.x) => PLONK verify fails, fail-closed ---
    function test_tamperedProof_failsClosed() public view {
        uint256[24] memory badProof = proof;
        badProof[0] = proof[0] ^ 0xff;
        assertFalse(rules.verifySolve(badProof, pub), "tampered proof must not verify");
    }

    // --- negative: valid proof but a MISMATCHED public input (wrong puzzle clue) => fails ---
    function test_wrongPuzzle_failsClosed() public view {
        uint256[81] memory badPuzzle = puzzle;
        // puzzle[0] is a revealed clue (value 1); change it to a different digit the proof
        // was NOT made for.
        badPuzzle[0] = puzzle[0] == 9 ? 8 : 9;
        assertFalse(rules.checkSolve(proof, badPuzzle, player, nullifier), "mismatched puzzle must not verify");
    }

    // --- negative: wrong player binding (the anti-front-run binding) => fails ---
    function test_wrongPlayer_failsClosed() public view {
        assertFalse(rules.checkSolve(proof, puzzle, player + 1, nullifier), "mismatched player must not verify");
    }

    // --- negative: wrong nullifier (the solution binding) => fails ---
    function test_wrongNullifier_failsClosed() public view {
        assertFalse(rules.checkSolve(proof, puzzle, player, nullifier + 1), "mismatched nullifier must not verify");
    }
}
