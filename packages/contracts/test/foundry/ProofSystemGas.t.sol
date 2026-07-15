// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SudokuSolveVerifier} from "../../contracts/zk/generated/SudokuSolveVerifier.sol";
import {SudokuPlonkVerifier} from "../../contracts/zk/generated/SudokuPlonkVerifier.sol";

/// SPIKE: what does dropping Groth16's PER-CIRCUIT trusted setup cost on-chain?
///
/// Groth16 needs a circuit-specific phase-2 ceremony (re-run on EVERY circuit change), and our current
/// zkey has ZERO contributions — i.e. forgeable. PLONK consumes the SAME universal Hermez powers-of-tau
/// and has NO per-circuit setup at all, so the ceremony requirement disappears. The only question is
/// price. This measures both verifiers on the IDENTICAL circuit (sudoku_solve), vector, and public
/// signals (83), with real proofs from scripts/spikePlonkGas.ts.
///
/// Two numbers matter for a real settle tx:
///   1. EXECUTION gas — the verify call itself (measured here via gasleft()).
///   2. CALLDATA gas — paid at tx level, 16 gas/nonzero byte. Both take uint256[83] pubSignals (equal),
///      but the proof differs: groth16 8 words (256B) vs plonk 24 words (768B).
contract ProofSystemGasTest is Test {
    SudokuSolveVerifier internal g16;
    SudokuPlonkVerifier internal plonk;

    uint256[2] internal pA;
    uint256[2][2] internal pB;
    uint256[2] internal pC;
    uint256[24] internal plonkProof;
    uint256[83] internal pub;

    function setUp() public {
        g16 = new SudokuSolveVerifier();
        plonk = new SudokuPlonkVerifier();

        string memory json = vm.readFile("test/foundry/fixtures/proofSystemGas.json");
        uint256[] memory ps = vm.parseJsonUintArray(json, ".publicSignals");
        assertEq(ps.length, 83, "expected 83 public signals");
        for (uint256 i = 0; i < 83; i++) pub[i] = ps[i];

        uint256[] memory a = vm.parseJsonUintArray(json, ".groth16.pA");
        uint256[] memory b0 = vm.parseJsonUintArray(json, ".groth16.pB0");
        uint256[] memory b1 = vm.parseJsonUintArray(json, ".groth16.pB1");
        uint256[] memory c = vm.parseJsonUintArray(json, ".groth16.pC");
        pA = [a[0], a[1]];
        pB = [[b0[0], b0[1]], [b1[0], b1[1]]];
        pC = [c[0], c[1]];

        uint256[] memory pp = vm.parseJsonUintArray(json, ".plonk.proof");
        assertEq(pp.length, 24, "expected 24 plonk proof fields");
        for (uint256 i = 0; i < 24; i++) plonkProof[i] = pp[i];
    }

    /// Both systems must actually VERIFY the real proof — a gas number for a rejecting verifier is
    /// meaningless.
    function test_bothProofsVerify() public view {
        assertTrue(g16.verifyProof(pA, pB, pC, pub), "groth16 proof must verify");
        assertTrue(plonk.verifyProof(plonkProof, pub), "plonk proof must verify");
    }

    function test_gas_groth16_verify() public view {
        uint256 g0 = gasleft();
        bool ok = g16.verifyProof(pA, pB, pC, pub);
        uint256 used = g0 - gasleft();
        assertTrue(ok);
        console.log("GROTH16 verify execution gas:", used);
    }

    function test_gas_plonk_verify() public view {
        uint256 g0 = gasleft();
        bool ok = plonk.verifyProof(plonkProof, pub);
        uint256 used = g0 - gasleft();
        assertTrue(ok);
        console.log("PLONK   verify execution gas:", used);
    }

    /// Deployment cost is a one-off, but the PLONK verifier is ~7x the source — check it even fits
    /// under the 24,576-byte EIP-170 limit.
    function test_deployedCodeSize() public view {
        console.log("GROTH16 verifier code size:", address(g16).code.length);
        console.log("PLONK   verifier code size:", address(plonk).code.length);
        assertLt(address(plonk).code.length, 24_576, "plonk verifier must fit EIP-170");
    }
}
