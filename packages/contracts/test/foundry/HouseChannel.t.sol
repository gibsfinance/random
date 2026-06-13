// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Chips} from "../../contracts/games/Chips.sol";
import {HouseChannel, OpenTerms} from "../../contracts/games/HouseChannel.sol";
import {SessionState} from "../../contracts/games/SessionState.sol";

contract HouseChannelTest is Test {
    Chips internal chips;
    HouseChannel internal ch;

    uint256 internal pkPlayerKey = 0xA11CE;
    uint256 internal pkHouse = 0xB0B;
    // a deterministic non-key wallet address (distinct from playerKey/houseKey)
    address internal playerWallet = address(uint160(uint256(keccak256("player-wallet"))));
    address internal playerKey;
    address internal house;

    bytes32 internal constant TID = keccak256("ct1");
    uint64 internal constant CLOCK = 30;

    function setUp() public {
        chips = new Chips();
        ch = new HouseChannel(address(chips));
        playerKey = vm.addr(pkPlayerKey);
        house = vm.addr(pkHouse);
        ch.setHouseKey(house);

        chips.mint(playerWallet, 1_000);
        chips.mint(address(this), 10_000);
        chips.approve(address(ch), type(uint256).max);
        ch.fundHouse(10_000);
        vm.prank(playerWallet);
        chips.approve(address(ch), type(uint256).max);
    }

    function _terms() internal view returns (OpenTerms memory t) {
        t.tableId = TID;
        t.player = playerWallet;
        t.playerKey = playerKey;
        t.escrowPlayer = 200;
        t.escrowHouse = 200;
        t.gameId = 1;
        t.rngCommit = keccak256("commit");
        t.clockBlocks = CLOCK;
        t.expiry = uint64(block.timestamp + 1 hours);
    }

    function _signHouseTerms(OpenTerms memory t) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pkHouse, ch.openTermsDigest(t));
        return abi.encodePacked(r, s, v);
    }

    function _open() internal returns (OpenTerms memory t) {
        t = _terms();
        bytes memory sig = _signHouseTerms(t); // hoist: vm.prank affects only the very next call
        vm.prank(playerWallet);
        ch.open(t, sig);
    }

    function _state(uint64 nonce, uint256 bp, uint256 bh) internal pure returns (SessionState memory s) {
        s.tableId = TID;
        s.nonce = nonce;
        s.balancePlayer = bp;
        s.balanceHouse = bh;
        s.settlementMode = 1;
        s.gameId = 1;
        s.gameStateHash = bytes32(0);
        s.rngCommit = keccak256("commit");
    }

    function _coSign(SessionState memory s) internal view returns (bytes memory sp, bytes memory sh) {
        bytes32 d = ch.stateDigest(s);
        (uint8 v1, bytes32 r1, bytes32 ss1) = vm.sign(pkPlayerKey, d);
        (uint8 v2, bytes32 r2, bytes32 ss2) = vm.sign(pkHouse, d);
        sp = abi.encodePacked(r1, ss1, v1);
        sh = abi.encodePacked(r2, ss2, v2);
    }

    function test_openEscrowsAndReserves() public {
        _open();
        assertEq(chips.balanceOf(address(ch)), 10_200); // pool 10k + player escrow 200
        assertEq(ch.housePool(), 9_800);                // 10k - reserved 200
        assertEq(chips.balanceOf(playerWallet), 800);
    }

    function test_settlePaysFromEscrow() public {
        _open();
        SessionState memory f = _state(5, 260, 140); // player won 60 within the 400 escrow
        (bytes memory sp, bytes memory sh) = _coSign(f);
        ch.settle(f, sp, sh);
        assertEq(chips.balanceOf(playerWallet), 800 + 260);
        assertEq(ch.housePool(), 9_800 + 140);
    }

    function test_settleRejectsConservation() public {
        _open();
        SessionState memory f = _state(5, 260, 200); // 460 != 400
        (bytes memory sp, bytes memory sh) = _coSign(f);
        vm.expectRevert(HouseChannel.ConservationViolated.selector);
        ch.settle(f, sp, sh);
    }

    function test_openRejectsBadHouseSig() public {
        OpenTerms memory t = _terms();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pkPlayerKey, ch.openTermsDigest(t)); // wrong signer
        bytes memory sig = abi.encodePacked(r, s, v); // hoist before prank+expectRevert
        vm.prank(playerWallet);
        vm.expectRevert(HouseChannel.BadSig.selector);
        ch.open(t, sig);
    }

    function test_doubleSettleRejected() public {
        _open();
        SessionState memory f = _state(5, 260, 140);
        (bytes memory sp, bytes memory sh) = _coSign(f);
        ch.settle(f, sp, sh);
        vm.expectRevert(HouseChannel.BadStatus.selector); // table now Settled
        ch.settle(f, sp, sh);
    }

    function test_disputeTimeoutPaysPostedState() public {
        _open();
        SessionState memory s = _state(3, 240, 160);
        (bytes memory sp, bytes memory sh) = _coSign(s);
        vm.prank(playerWallet);
        ch.dispute(s, sp, sh);
        vm.roll(block.number + CLOCK + 1);
        ch.resolveTimeout(TID);
        assertEq(chips.balanceOf(playerWallet), 800 + 240);
        assertEq(ch.housePool(), 9_800 + 160);
    }

    function test_resolveTimeoutBeforeClockReverts() public {
        _open();
        SessionState memory s = _state(3, 240, 160);
        (bytes memory sp, bytes memory sh) = _coSign(s);
        vm.prank(playerWallet);
        ch.dispute(s, sp, sh);
        vm.expectRevert(HouseChannel.ClockNotExpired.selector);
        ch.resolveTimeout(TID);
    }

    function test_respondWithNewerStateOverrides() public {
        _open();
        SessionState memory stale = _state(3, 300, 100); // player-favorable, posted by player
        (bytes memory sp1, bytes memory sh1) = _coSign(stale);
        vm.prank(playerWallet);
        ch.dispute(stale, sp1, sh1);
        // house overrides with a strictly-newer co-signed state
        SessionState memory newer = _state(7, 150, 250);
        (bytes memory sp2, bytes memory sh2) = _coSign(newer);
        ch.respondWithState(newer, sp2, sh2);
        assertEq(chips.balanceOf(playerWallet), 800 + 150);
        assertEq(ch.housePool(), 9_800 + 250);
    }

    function test_respondWithOlderStateReverts() public {
        _open();
        SessionState memory s = _state(7, 150, 250);
        (bytes memory sp1, bytes memory sh1) = _coSign(s);
        vm.prank(playerWallet);
        ch.dispute(s, sp1, sh1);
        SessionState memory older = _state(3, 300, 100);
        (bytes memory sp2, bytes memory sh2) = _coSign(older);
        vm.expectRevert(HouseChannel.StaleNonce.selector);
        ch.respondWithState(older, sp2, sh2);
    }
}
