// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SudokuSolvePlonkVerifier} from "../../contracts/zk/generated/SudokuSolvePlonkVerifier.sol";
import {WordleCluePlonkVerifier} from "../../contracts/zk/generated/WordleCluePlonkVerifier.sol";
import {WordleSolvePlonkVerifier} from "../../contracts/zk/generated/WordleSolvePlonkVerifier.sol";

/// On-chain verify COST + EIP-170 fit for all three ZK-skill PLONK verifiers, measured against the
/// same committed fixtures the functional suites use — so every number here is for a proof that
/// actually verifies (a gas figure for a rejecting verifier is meaningless).
///
/// WHY PLONK (this file is the evidence for that migration): Groth16 needs a per-circuit phase-2
/// ceremony, re-run on EVERY circuit change, and our groth16 zkeys were produced by `snarkjs groth16
/// setup` with ZERO contributions — the toxic waste was effectively public, i.e. anyone could forge a
/// winning proof and drain the house. PLONK consumes the same universal Hermez ptau and has NO
/// per-circuit setup, so that requirement disappears entirely.
///
/// It was also CHEAPER here, inverting the usual "groth16 is cheapest" wisdom. Measured on the
/// IDENTICAL sudoku_solve circuit/vector/public signals (83) with real proofs, before the migration.
/// The groth16 verifier + the spike harness are deleted now that the decision is made, so this
/// baseline is the record (it can no longer be re-measured from this tree):
///
///   GROTH16 verify: 933,945 gas | proof 256B | code 14,281B | ceremony REQUIRED
///   PLONK   verify: ~528.8k gas | proof 768B | code 15,550B | ceremony NONE
///
/// PLONK is ~43% cheaper on sudoku_solve because groth16 does one EC scalar-mul (~6k gas) per public
/// input and sudoku_solve has 83 (81 puzzle cells + nullifier + player) — ~510k of its 934k. PLONK
/// evaluates public inputs in the field, so its cost is near-flat in public-input count. Net ~400k
/// saved per settle even after PLONK's +512B of calldata. The two Wordle circuits have far fewer
/// public signals (11 and 4), so they were never where groth16 hurt — they move to PLONK for the
/// TRUST property (no ceremony); their gas is measured here for the record.
///
/// WHY THE PLONK FIGURES ARE APPROXIMATE (~) AND THE GROTH16 ONE IS NOT: a PLONK proof is randomized
/// (fresh blinding scalars every run), and verify gas is mildly DATA-dependent, so re-proving the same
/// statement shifts the number slightly. Measured directly: regenerating only the wordle_solve fixture
/// moved it 321,089 -> 321,801 (+712) while the two untouched fixtures measured bit-identical. So
/// treat these as ~1k-band figures, not constants — the tests below print the live number for the
/// currently committed fixtures on every run. (This also explains the spike's 528,824 vs the current
/// 528,778 for sudoku_solve: a different random proof, not a code change.)
///
/// Two numbers matter for a real settle tx:
///   1. EXECUTION gas — the verify call itself (measured here via gasleft()).
///   2. CALLDATA gas — paid at tx level, 16 gas/nonzero byte: the proof is 24 words (768B) for every
///      PLONK circuit, plus that circuit's public signals.
contract ProofSystemGasTest is Test {
    SudokuSolvePlonkVerifier internal sudoku;
    WordleCluePlonkVerifier internal wordleClue;
    WordleSolvePlonkVerifier internal wordleSolve;

    uint256[24] internal sudokuProof;
    uint256[83] internal sudokuPub;

    uint256[24] internal clueProof;
    uint256[11] internal cluePub;

    uint256[24] internal solveProof;
    uint256[4] internal solvePub;

    function setUp() public {
        sudoku = new SudokuSolvePlonkVerifier();
        wordleClue = new WordleCluePlonkVerifier();
        wordleSolve = new WordleSolvePlonkVerifier();

        uint256[] memory ps;

        ps = _loadProof("test/foundry/fixtures/sudokuSolveProof.json", sudokuProof);
        assertEq(ps.length, 83, "sudoku_solve: expected 83 public signals");
        for (uint256 i = 0; i < 83; i++) sudokuPub[i] = ps[i];

        ps = _loadProof("test/foundry/fixtures/wordleClueProof.json", clueProof);
        assertEq(ps.length, 11, "wordle_clue: expected 11 public signals");
        for (uint256 i = 0; i < 11; i++) cluePub[i] = ps[i];

        ps = _loadProof("test/foundry/fixtures/wordleSolveProof.json", solveProof);
        assertEq(ps.length, 4, "wordle_solve: expected 4 public signals");
        for (uint256 i = 0; i < 4; i++) solvePub[i] = ps[i];
    }

    /// Load a fixture's 24-field PLONK proof into `proof` and return its public signals (whose count
    /// is per-circuit, so the caller sizes them).
    function _loadProof(string memory path, uint256[24] storage proof) internal returns (uint256[] memory) {
        string memory json = vm.readFile(path);
        uint256[] memory pf = vm.parseJsonUintArray(json, ".proof");
        assertEq(pf.length, 24, "expected 24 plonk proof fields");
        for (uint256 i = 0; i < 24; i++) proof[i] = pf[i];
        return vm.parseJsonUintArray(json, ".pubSignals");
    }

    function test_gas_sudokuSolve_verify() public view {
        uint256 g0 = gasleft();
        bool ok = sudoku.verifyProof(sudokuProof, sudokuPub);
        uint256 used = g0 - gasleft();
        assertTrue(ok, "sudoku_solve plonk proof must verify");
        console.log("PLONK sudoku_solve verify gas (83 public signals):", used);
    }

    function test_gas_wordleClue_verify() public view {
        uint256 g0 = gasleft();
        bool ok = wordleClue.verifyProof(clueProof, cluePub);
        uint256 used = g0 - gasleft();
        assertTrue(ok, "wordle_clue plonk proof must verify");
        console.log("PLONK wordle_clue verify gas (11 public signals):", used);
    }

    function test_gas_wordleSolve_verify() public view {
        uint256 g0 = gasleft();
        bool ok = wordleSolve.verifyProof(solveProof, solvePub);
        uint256 used = g0 - gasleft();
        assertTrue(ok, "wordle_solve plonk proof must verify");
        console.log("PLONK wordle_solve verify gas (4 public signals):", used);
    }

    /// Deployment is a one-off, but a verifier that exceeds EIP-170 (24,576 B) is undeployable.
    function test_deployedCodeSize_fitsEIP170() public view {
        uint256 s = address(sudoku).code.length;
        uint256 c = address(wordleClue).code.length;
        uint256 w = address(wordleSolve).code.length;
        console.log("PLONK sudoku_solve verifier code size:", s);
        console.log("PLONK wordle_clue  verifier code size:", c);
        console.log("PLONK wordle_solve verifier code size:", w);
        assertLt(s, 24_576, "sudoku_solve verifier must fit EIP-170");
        assertLt(c, 24_576, "wordle_clue verifier must fit EIP-170");
        assertLt(w, 24_576, "wordle_solve verifier must fit EIP-170");
    }
}
