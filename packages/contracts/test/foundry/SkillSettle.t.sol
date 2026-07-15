// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Chips} from "../../contracts/games/Chips.sol";
import {SkillSettle} from "../../contracts/games/SkillSettle.sol";
import {SkillPayouts} from "../../contracts/games/SkillPayouts.sol";
import {SudokuRules} from "../../contracts/zk/SudokuRules.sol";
import {WordleRules} from "../../contracts/zk/WordleRules.sol";
import {SudokuSolveVerifier} from "../../contracts/zk/generated/SudokuSolveVerifier.sol";
import {WordleClueVerifier} from "../../contracts/zk/generated/WordleClueVerifier.sol";

/// Thin harness exposing SkillPayouts' pure funcs so the foundry suite can assert TS↔Solidity parity
/// of the published payout curves directly (library internals aren't externally callable).
contract SkillPayoutsHarness {
    function wordleMultX100(uint256 g) external pure returns (uint256) { return SkillPayouts.wordleMultX100(g); }
    function sudokuMultX100(bool s) external pure returns (uint256) { return SkillPayouts.sudokuMultX100(s); }
    function payout(uint256 stake, uint256 m) external pure returns (uint256) { return SkillPayouts.payout(stake, m); }
    function isAllGreen(uint256[5] calldata c) external pure returns (bool) {
        uint256[5] memory m = c;
        return SkillPayouts.isAllGreen(m);
    }
}

/// M2: the on-chain SKILL settle. Sudoku settles FULLY TRUSTLESSLY from a real Groth16 solve proof
/// (the flagship end-to-end round); Wordle's payout math + all-green solve predicate + proof wiring
/// are exercised via parity + fail-closed paths (a happy-path Wordle solve needs an all-green fixture,
/// deferred with the interactive-channel binding — see the M3 design note).
contract SkillSettleTest is Test {
    Chips internal chips;
    SkillSettle internal skill;
    SudokuRules internal sudokuRules;
    WordleRules internal wordleRules;
    SkillPayoutsHarness internal pay;

    uint256 internal pkHouse = 0xB0B;
    address internal house;
    address internal player = address(uint160(uint256(keccak256("skill-player"))));

    // sudoku fixture (83 signals: nullifier, puzzle[0..80], player). The win proof is BOUND to the
    // player it was proved for — the fixed fixture player 0xabab..ab — so the sudoku table player must
    // be that address for the proof to verify (this binding is exactly the anti-front-run property).
    uint256[2] internal sa;
    uint256[2][2] internal sb;
    uint256[2] internal sc;
    uint256[81] internal puzzle;
    uint256 internal sudokuNullifier;
    address internal sudokuPlayer; // == the fixture's public `player` signal, as an address

    // wordle fixture (11 signals: commit, guess[0..4], clue[0..4]) — a NON-solve (clue not all-green)
    uint256[2] internal wa;
    uint256[2][2] internal wb;
    uint256[2] internal wc;
    uint256[5] internal guess;
    uint256[5] internal clue;
    uint256 internal wordleCommit;

    uint64 internal constant CLOCK = 30;

    function setUp() public {
        chips = new Chips();
        sudokuRules = new SudokuRules(address(new SudokuSolveVerifier()));
        wordleRules = new WordleRules(address(new WordleClueVerifier()));
        skill = new SkillSettle(address(chips), address(sudokuRules), address(wordleRules));
        pay = new SkillPayoutsHarness();

        house = vm.addr(pkHouse);
        skill.setHouseKey(house);

        chips.mint(address(this), 100_000);
        chips.approve(address(skill), type(uint256).max);
        skill.fundHouse(100_000);
        chips.mint(player, 10_000);
        vm.prank(player);
        chips.approve(address(skill), type(uint256).max);

        _loadSudoku();
        _loadWordle();

        // fund + approve the fixture-bound sudoku player (the proof only verifies for this address)
        chips.mint(sudokuPlayer, 10_000);
        vm.prank(sudokuPlayer);
        chips.approve(address(skill), type(uint256).max);
    }

    function _loadSudoku() internal {
        string memory json = vm.readFile("test/foundry/fixtures/sudokuSolveProof.json");
        uint256[] memory pa = vm.parseJsonUintArray(json, ".pA");
        uint256[] memory pb0 = vm.parseJsonUintArray(json, ".pB0");
        uint256[] memory pb1 = vm.parseJsonUintArray(json, ".pB1");
        uint256[] memory pc = vm.parseJsonUintArray(json, ".pC");
        uint256[] memory ps = vm.parseJsonUintArray(json, ".pubSignals");
        assertEq(ps.length, 83, "sudoku fixture must have 83 signals");
        sa = [pa[0], pa[1]];
        sb = [[pb0[0], pb0[1]], [pb1[0], pb1[1]]];
        sc = [pc[0], pc[1]];
        // [nullifier, puzzle[0..80], player]
        sudokuNullifier = ps[0];
        for (uint256 i = 0; i < 81; i++) puzzle[i] = ps[1 + i];
        sudokuPlayer = address(uint160(ps[82]));
    }

    function _loadWordle() internal {
        string memory json = vm.readFile("test/foundry/fixtures/wordleClueProof.json");
        uint256[] memory pa = vm.parseJsonUintArray(json, ".pA");
        uint256[] memory pb0 = vm.parseJsonUintArray(json, ".pB0");
        uint256[] memory pb1 = vm.parseJsonUintArray(json, ".pB1");
        uint256[] memory pc = vm.parseJsonUintArray(json, ".pC");
        uint256[] memory ps = vm.parseJsonUintArray(json, ".pubSignals");
        assertEq(ps.length, 11, "wordle fixture must have 11 signals");
        wa = [pa[0], pa[1]];
        wb = [[pb0[0], pb0[1]], [pb1[0], pb1[1]]];
        wc = [pc[0], pc[1]];
        wordleCommit = ps[0];
        for (uint256 i = 0; i < 5; i++) {
            guess[i] = ps[1 + i];
            clue[i] = ps[6 + i];
        }
    }

    // ---- open helpers ----------------------------------------------------------------------------

    function _sudokuTerms(bytes32 tableId, uint256 stake, uint256 escrowHouse)
        internal view returns (SkillSettle.SkillOpenTerms memory t)
    {
        t.tableId = tableId;
        t.player = sudokuPlayer; // the proof is bound to this address
        t.escrowPlayer = stake;
        t.escrowHouse = escrowHouse;
        t.gameId = SkillPayouts.SUDOKU_GAME_ID;
        t.commit = 0; // sudoku no longer uses a house solution-commit (M3 role-flip)
        t.puzzleHash = keccak256(abi.encode(puzzle));
        t.clockBlocks = CLOCK;
        t.expiry = uint64(block.timestamp + 1 hours);
    }

    /// Open a sudoku table via openSudoku, using the fixture proof itself as the house SOLVABILITY
    /// proof (any proof that verifies for this puzzle establishes ≥1 solution exists). Caller = the
    /// fixture-bound sudoku player.
    function _openSudoku(SkillSettle.SkillOpenTerms memory t) internal {
        bytes memory sig = _sign(t);
        vm.prank(sudokuPlayer);
        skill.openSudoku(t, sig, sa, sb, sc, puzzle, uint256(uint160(sudokuPlayer)), sudokuNullifier);
    }

    function _wordleTerms(bytes32 tableId, uint256 stake, uint256 escrowHouse)
        internal view returns (SkillSettle.SkillOpenTerms memory t)
    {
        t.tableId = tableId;
        t.player = player;
        t.escrowPlayer = stake;
        t.escrowHouse = escrowHouse;
        t.gameId = SkillPayouts.WORDLE_GAME_ID;
        t.commit = wordleCommit;
        t.puzzleHash = bytes32(0);
        t.clockBlocks = CLOCK;
        t.expiry = uint64(block.timestamp + 1 hours);
    }

    function _sign(SkillSettle.SkillOpenTerms memory t) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pkHouse, skill.openDigest(t));
        return abi.encodePacked(r, s, v);
    }

    function _open(SkillSettle.SkillOpenTerms memory t) internal {
        bytes memory sig = _sign(t);
        vm.prank(player);
        skill.open(t, sig);
    }

    // ============================ PARITY: on-chain curves == TS reference ==========================

    function test_wordlePayoutParity() public view {
        assertEq(pay.wordleMultX100(1), 2500);
        assertEq(pay.wordleMultX100(2), 350);
        assertEq(pay.wordleMultX100(3), 130);
        assertEq(pay.wordleMultX100(4), 80);
        assertEq(pay.wordleMultX100(5), 55);
        assertEq(pay.wordleMultX100(6), 25);
        assertEq(pay.wordleMultX100(0), 0); // out of range → miss
        assertEq(pay.wordleMultX100(7), 0);
    }

    function test_sudokuPayoutParity() public view {
        assertEq(pay.sudokuMultX100(true), 190);
        assertEq(pay.sudokuMultX100(false), 0);
        assertEq(pay.payout(1000, 190), 1900);
    }

    function test_isAllGreen() public view {
        assertTrue(pay.isAllGreen([uint256(2), 2, 2, 2, 2]));
        assertFalse(pay.isAllGreen([uint256(2), 2, 1, 2, 2]));
        assertFalse(pay.isAllGreen(clue)); // the fixture clue is NOT a solve
    }

    // ============================ SUDOKU — full trustless round ====================================

    function test_sudoku_fullRound_realProof_pays1_90x() public {
        bytes32 tid = keccak256("sudoku-win");
        uint256 stake = 200;
        uint256 escrowHouse = 200; // covers the 180 profit (payout 380 <= pot 400)
        _openSudoku(_sudokuTerms(tid, stake, escrowHouse));

        assertEq(chips.balanceOf(sudokuPlayer), 10_000 - stake, "stake escrowed");
        assertEq(skill.housePool(), 100_000 - escrowHouse, "house escrow reserved");

        // ANYONE may relay the REAL solve proof (permissionless); the payout goes to t.player. Relay it
        // from a stranger to prove the front-run resistance: the proof is bound to sudokuPlayer.
        skill.settleSudoku(tid, sa, sb, sc, puzzle, sudokuNullifier);

        // payout = stake * 1.90 = 380; player net +180
        assertEq(chips.balanceOf(sudokuPlayer), 10_000 - stake + 380, "player paid 1.90x");
        assertEq(skill.housePool(), 100_000 - 180, "house pool down exactly the profit");
        assertTrue(skill.spentSudokuNullifier(sudokuNullifier), "nullifier recorded spent");
    }

    function test_open_plainOpen_rejectsSudoku() public {
        bytes32 tid = keccak256("sudoku-plainopen");
        SkillSettle.SkillOpenTerms memory t = _sudokuTerms(tid, 200, 200);
        bytes memory sig = _sign(t);
        vm.prank(sudokuPlayer);
        vm.expectRevert(SkillSettle.UseOpenSudoku.selector);
        skill.open(t, sig); // sudoku must go through openSudoku (solvability-gated)
    }

    function test_openSudoku_rejects_unsolvableProof() public {
        bytes32 tid = keccak256("sudoku-unsolvable");
        SkillSettle.SkillOpenTerms memory t = _sudokuTerms(tid, 200, 200);
        bytes memory sig = _sign(t);
        // a tampered (non-verifying) solvability proof: the house cannot open without exhibiting a
        // solution — this is what stops it posting an unsolvable/ambiguous board.
        uint256[2] memory badA = [sa[0] ^ 0xff, sa[1]];
        vm.prank(sudokuPlayer);
        vm.expectRevert(SkillSettle.BadProof.selector);
        skill.openSudoku(t, sig, badA, sb, sc, puzzle, uint256(uint160(sudokuPlayer)), sudokuNullifier);
    }

    function test_sudoku_tamperedProof_failsClosed() public {
        bytes32 tid = keccak256("sudoku-tamper");
        _openSudoku(_sudokuTerms(tid, 200, 200));
        uint256[2] memory badA = [sa[0] ^ 0xff, sa[1]];
        vm.expectRevert(SkillSettle.BadProof.selector);
        skill.settleSudoku(tid, badA, sb, sc, puzzle, sudokuNullifier);
    }

    function test_sudoku_swappedPuzzle_failsClosed() public {
        bytes32 tid = keccak256("sudoku-swap");
        _openSudoku(_sudokuTerms(tid, 200, 200));
        // present a DIFFERENT puzzle than the one hashed into the open terms
        uint256[81] memory badPuzzle = puzzle;
        badPuzzle[0] = puzzle[0] == 9 ? 8 : 9;
        vm.expectRevert(SkillSettle.BadPuzzle.selector);
        skill.settleSudoku(tid, sa, sb, sc, badPuzzle, sudokuNullifier);
    }

    function test_sudoku_wrongPlayerBinding_failsClosed() public {
        // Open a table whose player is NOT the fixture-bound player: the fixture proof (bound to
        // sudokuPlayer) must not settle it — the contract passes t.player as the circuit's `player`
        // signal, so the proof fails. This is the anti-front-run binding: a copied proof cannot be
        // re-aimed at another player's table.
        bytes32 tid = keccak256("sudoku-otherplayer");
        SkillSettle.SkillOpenTerms memory t = _sudokuTerms(tid, 200, 200);
        t.player = player; // the OTHER (non-fixture) player
        bytes memory sig = _sign(t);
        vm.prank(player);
        skill.openSudoku(t, sig, sa, sb, sc, puzzle, uint256(uint160(sudokuPlayer)), sudokuNullifier);
        // settle with the fixture proof: bound to sudokuPlayer, but the table player is `player` → fails
        vm.expectRevert(SkillSettle.BadProof.selector);
        skill.settleSudoku(tid, sa, sb, sc, puzzle, sudokuNullifier);
    }

    function test_sudoku_nullifierReplay_failsClosed() public {
        // Two tables, SAME puzzle + player + solution → same nullifier. The first settles; the second
        // (a replay of the identical winning proof) is blocked by the spent-nullifier record.
        bytes32 tid1 = keccak256("sudoku-replay-1");
        bytes32 tid2 = keccak256("sudoku-replay-2");
        _openSudoku(_sudokuTerms(tid1, 200, 200));
        _openSudoku(_sudokuTerms(tid2, 200, 200));
        skill.settleSudoku(tid1, sa, sb, sc, puzzle, sudokuNullifier);
        vm.expectRevert(SkillSettle.NullifierSpent.selector);
        skill.settleSudoku(tid2, sa, sb, sc, puzzle, sudokuNullifier);
    }

    function test_sudoku_reclaimAfterDeadline_houseKeepsStake() public {
        bytes32 tid = keccak256("sudoku-loss");
        _openSudoku(_sudokuTerms(tid, 200, 200));
        // before the deadline: reclaim reverts
        vm.expectRevert(SkillSettle.DeadlineNotPassed.selector);
        skill.reclaim(tid);
        // roll past the deadline: the player never solved → house reclaims the whole pot
        vm.roll(block.number + CLOCK + 1);
        skill.reclaim(tid);
        assertEq(chips.balanceOf(sudokuPlayer), 10_000 - 200, "player loses the stake");
        // pool = start (100k) + the player's forfeited 200 stake; the house's own 200 reserve nets out
        assertEq(skill.housePool(), 100_000 + 200, "house keeps the lost stake");
    }

    // ============================ escrow ceiling (funds-safety) ====================================

    function test_open_rejects_escrowHouse_below_ceiling() public {
        bytes32 tid = keccak256("thin-escrow");
        // sudoku profit for stake 200 is 180; 179 must be rejected (checked in _openTable, after the
        // solvability proof verifies)
        SkillSettle.SkillOpenTerms memory t = _sudokuTerms(tid, 200, 179);
        bytes memory sig = _sign(t);
        vm.prank(sudokuPlayer);
        vm.expectRevert(SkillSettle.EscrowTooSmall.selector);
        skill.openSudoku(t, sig, sa, sb, sc, puzzle, uint256(uint160(sudokuPlayer)), sudokuNullifier);
    }

    function test_open_rejects_forgedHouseSig() public {
        bytes32 tid = keccak256("forged");
        SkillSettle.SkillOpenTerms memory t = _sudokuTerms(tid, 200, 200);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(uint256(0xBADBAD), skill.openDigest(t));
        vm.prank(sudokuPlayer);
        vm.expectRevert(SkillSettle.BadSig.selector);
        skill.openSudoku(t, abi.encodePacked(r, s, v), sa, sb, sc, puzzle, uint256(uint160(sudokuPlayer)), sudokuNullifier);
    }

    // ============================ WORDLE — solve predicate + proof wiring ==========================

    function test_wordle_settle_rejects_nonAllGreen_clue() public {
        bytes32 tid = keccak256("wordle-notgreen");
        _open(_wordleTerms(tid, 100, 2400)); // ceiling: stake*24 = 2400
        // the fixture's clue is a real, honestly-scored clue but NOT all-green → not a solve
        bytes memory countSig = _wordleCountSig(tid, 2);
        vm.prank(player);
        vm.expectRevert(SkillSettle.NotAllGreen.selector);
        skill.settleWordle(tid, wa, wb, wc, guess, clue, 2, countSig);
    }

    function test_wordle_settle_rejects_allGreen_clue_without_matching_proof() public {
        bytes32 tid = keccak256("wordle-fakegreen");
        _open(_wordleTerms(tid, 100, 2400));
        // claim an all-green clue, but the fixture proof was made for the real (non-green) clue, so
        // the Groth16 verify fails: the player cannot fabricate a solve.
        uint256[5] memory allGreen = [uint256(2), 2, 2, 2, 2];
        bytes memory countSig = _wordleCountSig(tid, 1);
        vm.prank(player);
        vm.expectRevert(SkillSettle.BadProof.selector);
        skill.settleWordle(tid, wa, wb, wc, guess, allGreen, 1, countSig);
    }

    function test_wordle_settle_rejects_forged_countSig() public {
        bytes32 tid = keccak256("wordle-badcount");
        _open(_wordleTerms(tid, 100, 2400));
        uint256[5] memory allGreen = [uint256(2), 2, 2, 2, 2];
        // house count-signature forged by a non-house key → BadSig (checked before the proof)
        bytes32 countDigest = keccak256(abi.encodePacked("\x19\x01", skill.domainSeparator(), keccak256(abi.encode(tid, uint256(1)))));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(uint256(0xBADBAD), countDigest);
        vm.prank(player);
        vm.expectRevert(SkillSettle.BadSig.selector);
        skill.settleWordle(tid, wa, wb, wc, guess, allGreen, 1, abi.encodePacked(r, s, v));
    }

    function _wordleCountSig(bytes32 tid, uint256 guessesUsed) internal view returns (bytes memory) {
        bytes32 countDigest = keccak256(abi.encodePacked("\x19\x01", skill.domainSeparator(), keccak256(abi.encode(tid, guessesUsed))));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pkHouse, countDigest);
        return abi.encodePacked(r, s, v);
    }
}
