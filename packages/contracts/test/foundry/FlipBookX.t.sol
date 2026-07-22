// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FlipBookX} from "../../contracts/games/FlipBookX.sol";
import {MockX402, Mock1271Wallet} from "../../contracts/test/MockX402.sol";

/// Variant B of the P2P coin flip: off-chain signed offers over the x402 wrapper, hidden guesses
/// both sides, two-phase reveal with two bonds. The mock carries the REAL wrapper's EIP-712 shape,
/// so every signature here is built exactly as it would be against the deployed x402PLS.
contract FlipBookXTest is Test {
    MockX402 internal token;
    FlipBookX internal book;

    uint256 internal makerKey = 0xA11CE;
    uint256 internal takerKey = 0xB0B;
    uint256 internal crankKey = 0xC4A2; // a stranger who relays / cranks
    address internal maker;
    address internal taker;
    address internal crank;

    uint256 internal constant STAKE = 10e18;
    uint256 internal constant MAKER_BOND = 2e18;
    uint256 internal constant TAKER_BOND = 1e18;
    uint32 internal constant W1 = 3600; // maker choice window
    uint32 internal constant W2 = 1800; // taker guess window
    bytes32 internal constant SALT = keccak256("maker-salt");
    bytes32 internal constant SALT2 = keccak256("taker-salt");

    bytes32 internal constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 internal constant CANCEL_TYPEHASH = keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    function setUp() public {
        token = new MockX402();
        book = new FlipBookX(address(token));
        maker = vm.addr(makerKey);
        taker = vm.addr(takerKey);
        crank = vm.addr(crankKey);
        token.mint(maker, 100e18);
        token.mint(taker, 100e18);
        vm.warp(1_000_000);
    }

    // ── helpers ─────────────────────────────────────────────────────────────────────────────────

    function _offer(bool choice) internal view returns (FlipBookX.Offer memory o) {
        o = FlipBookX.Offer({
            maker: maker,
            commit: keccak256(abi.encode(maker, choice, SALT)),
            stake: STAKE,
            makerBond: MAKER_BOND,
            takerBond: TAKER_BOND,
            takeDeadline: uint64(block.timestamp + 1 days),
            makerRevealWindow: W1,
            takerRevealWindow: W2
        });
    }

    function _receiveDigest(address from, uint256 value, uint64 validBefore, bytes32 nonce)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_TYPEHASH, from, address(book), value, uint256(0), validBefore, nonce));
        return keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signedOffer(bool choice)
        internal
        view
        returns (FlipBookX.Offer memory o, bytes32 id, bytes memory makerSig)
    {
        o = _offer(choice);
        id = book.offerId(o);
        makerSig = _sign(makerKey, _receiveDigest(maker, STAKE + MAKER_BOND, o.takeDeadline, id));
    }

    function _takerSig(FlipBookX.Offer memory o, bytes32 id) internal view returns (bytes memory) {
        return _sign(takerKey, _receiveDigest(taker, STAKE + TAKER_BOND, o.takeDeadline, book.takerNonce(id, taker)));
    }

    function _guessCommit(bool guess) internal view returns (bytes32) {
        return keccak256(abi.encode(taker, guess, SALT2));
    }

    /// Full take by a RELAYER (crank) — proves the flow is submitter-agnostic end to end.
    function _take(bool choice, bool guess) internal returns (bytes32 id) {
        (FlipBookX.Offer memory o, bytes32 id_, bytes memory makerSig) = _signedOffer(choice);
        vm.prank(crank);
        book.take(o, makerSig, taker, _guessCommit(guess), _takerSig(o, id_));
        id = id_;
    }

    // ── happy paths ─────────────────────────────────────────────────────────────────────────────

    function test_fullFlip_takerWins_exactBalances_noDust() public {
        uint256 m0 = token.balanceOf(maker);
        uint256 t0 = token.balanceOf(taker);
        bytes32 id = _take(true, true); // choice=heads, guess=heads → taker wins

        assertEq(token.balanceOf(address(book)), 2 * STAKE + MAKER_BOND + TAKER_BOND, "both escrows locked");

        vm.warp(block.timestamp + 100);
        vm.prank(crank);
        book.revealChoice(id, true, SALT);
        assertEq(token.balanceOf(maker), m0 - STAKE - MAKER_BOND + MAKER_BOND, "maker bond back at their reveal");

        vm.warp(block.timestamp + 100);
        vm.prank(crank);
        book.revealGuess(id, true, SALT2);
        assertEq(token.balanceOf(taker), t0 + STAKE, "taker nets +stake");
        assertEq(token.balanceOf(maker), m0 - STAKE, "maker nets -stake");
        assertEq(token.balanceOf(address(book)), 0, "no dust");
    }

    function test_fullFlip_makerWins() public {
        uint256 m0 = token.balanceOf(maker);
        uint256 t0 = token.balanceOf(taker);
        bytes32 id = _take(true, false); // guess misses → maker wins
        book.revealChoice(id, true, SALT);
        book.revealGuess(id, false, SALT2);
        assertEq(token.balanceOf(maker), m0 + STAKE, "maker nets +stake");
        assertEq(token.balanceOf(taker), t0 - STAKE, "taker nets -stake (bond returned)");
        assertEq(token.balanceOf(address(book)), 0, "no dust");
    }

    // ── term authentication: the offerId IS the signature binding ───────────────────────────────

    function test_tamperedTerm_breaksMakerSignature() public {
        (FlipBookX.Offer memory o, bytes32 id, bytes memory makerSig) = _signedOffer(true);
        o.stake = STAKE + 1; // taker tries to sweeten the pot
        bytes32 gc = _guessCommit(true);
        bytes memory ts = _takerSig(o, id);
        vm.expectRevert(MockX402.InvalidSignature.selector);
        book.take(o, makerSig, taker, gc, ts);
    }

    function test_takerSigBoundToOffer_and_toTaker() public {
        (FlipBookX.Offer memory o, bytes32 id, bytes memory makerSig) = _signedOffer(true);
        // a different taker cannot ride Bob's authorization
        bytes32 gc = _guessCommit(true);
        bytes memory ts = _takerSig(o, id);
        vm.expectRevert(MockX402.InvalidSignature.selector);
        book.take(o, makerSig, crank, gc, ts);
    }

    // ── the free-option closure ─────────────────────────────────────────────────────────────────

    function test_cancelAuthorization_killsOffer_blindly() public {
        (FlipBookX.Offer memory o, bytes32 id, bytes memory makerSig) = _signedOffer(true);
        // The maker cancels ON THE WRAPPER — no FlipBookX involvement, and (the point of hidden
        // guesses) no way to know whether this dodged a win or a loss.
        bytes32 cancelDigest = keccak256(
            abi.encodePacked(
                "\x19\x01", token.DOMAIN_SEPARATOR(), keccak256(abi.encode(CANCEL_TYPEHASH, maker, id))
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerKey, cancelDigest);
        token.cancelAuthorization(maker, id, v, r, s);

        bytes32 gc = _guessCommit(true);
        bytes memory ts = _takerSig(o, id);
        vm.expectRevert(abi.encodeWithSelector(MockX402.AuthorizationAlreadyUsed.selector, maker, id));
        book.take(o, makerSig, taker, gc, ts);
    }

    function test_settledOffer_cannotBeReplayed() public {
        bytes32 id = _take(true, true);
        book.revealChoice(id, true, SALT);
        book.revealGuess(id, true, SALT2);
        // Same offer, same signatures: the wrapper burned the maker's nonce at the first take.
        (FlipBookX.Offer memory o,, bytes memory makerSig) = _signedOffer(true);
        bytes32 gc = _guessCommit(true);
        bytes memory ts = _takerSig(o, id);
        vm.expectRevert(abi.encodeWithSelector(MockX402.AuthorizationAlreadyUsed.selector, maker, id));
        book.take(o, makerSig, taker, gc, ts);
    }

    // ── liveness defaults ───────────────────────────────────────────────────────────────────────

    function test_makerDefault_paysTakerEverything() public {
        uint256 t0 = token.balanceOf(taker);
        bytes32 id = _take(true, true);

        vm.expectRevert(FlipBookX.RevealWindowOpen.selector);
        book.claimMakerDefault(id);

        vm.warp(block.timestamp + W1 + 1);
        vm.expectRevert(FlipBookX.RevealWindowOver.selector);
        book.revealChoice(id, true, SALT); // too late — the default path owns it

        vm.prank(crank);
        book.claimMakerDefault(id);
        assertEq(token.balanceOf(taker), t0 + STAKE + MAKER_BOND, "taker nets pot-share + maker bond");
        assertEq(token.balanceOf(address(book)), 0, "no dust");
    }

    function test_takerDefault_paysMaker() public {
        uint256 m0 = token.balanceOf(maker);
        bytes32 id = _take(true, false); // losing guess — the taker who might bail
        book.revealChoice(id, true, SALT);

        vm.expectRevert(FlipBookX.RevealWindowOpen.selector);
        book.claimTakerDefault(id);

        vm.warp(block.timestamp + W2 + 1);
        vm.expectRevert(FlipBookX.RevealWindowOver.selector);
        book.revealGuess(id, false, SALT2);

        vm.prank(crank);
        book.claimTakerDefault(id);
        assertEq(token.balanceOf(maker), m0 + STAKE + TAKER_BOND, "maker nets stake + taker bond");
        assertEq(token.balanceOf(address(book)), 0, "no dust");
    }

    function test_takerDefaultClaim_requiresChoiceRevealed() public {
        bytes32 id = _take(true, true);
        vm.warp(block.timestamp + W1 + W2 + 2);
        vm.expectRevert(FlipBookX.ChoiceNotRevealed.selector);
        book.claimTakerDefault(id); // wrong crank — this is a MAKER default
        book.claimMakerDefault(id);
    }

    // ── commit binding + guards ─────────────────────────────────────────────────────────────────

    function test_wrongReveals_revert() public {
        bytes32 id = _take(true, true);
        vm.expectRevert(FlipBookX.BadReveal.selector);
        book.revealChoice(id, false, SALT); // wrong choice
        book.revealChoice(id, true, SALT);
        vm.expectRevert(FlipBookX.BadReveal.selector);
        book.revealGuess(id, true, keccak256("wrong-salt"));
    }

    function test_guards() public {
        (FlipBookX.Offer memory o, bytes32 id, bytes memory makerSig) = _signedOffer(true);
        bytes32 gc = _guessCommit(true);
        bytes memory ts = _takerSig(o, id);

        vm.expectRevert(FlipBookX.SelfTake.selector);
        book.take(o, makerSig, maker, gc, makerSig);

        // NOTE: memory-struct assignment aliases (no copy), so each case restores its field.
        FlipBookX.Offer memory bad = o;
        bad.takerBond = 0;
        vm.expectRevert(FlipBookX.ZeroBond.selector);
        book.take(bad, makerSig, taker, gc, ts);
        bad.takerBond = TAKER_BOND;

        bad.makerRevealWindow = 60; // under MIN
        vm.expectRevert(FlipBookX.BadWindow.selector);
        book.take(bad, makerSig, taker, gc, ts);
        bad.makerRevealWindow = W1;

        vm.warp(o.takeDeadline + 1);
        vm.expectRevert(FlipBookX.OfferExpired.selector);
        book.take(o, makerSig, taker, gc, ts);
    }

    // ── EIP-7598 / ERC-1271: a smart-wallet maker ───────────────────────────────────────────────

    function test_erc1271Maker_bytesSignaturePath() public {
        Mock1271Wallet wallet = new Mock1271Wallet();
        token.mint(address(wallet), 50e18);

        FlipBookX.Offer memory o = _offer(true);
        o.maker = address(wallet);
        o.commit = keccak256(abi.encode(address(wallet), true, SALT));
        bytes32 id = book.offerId(o);
        wallet.approveDigest(_receiveDigest(address(wallet), STAKE + MAKER_BOND, o.takeDeadline, id));

        // A 64-byte payload routes through the 7598 `bytes` overload → ERC-1271 verification.
        bytes memory contractSig = new bytes(64);
        vm.prank(crank);
        book.take(o, contractSig, taker, _guessCommit(true), _takerSig(o, id));
        assertEq(token.balanceOf(address(book)), 2 * STAKE + MAKER_BOND + TAKER_BOND, "1271 maker escrowed");
    }
}
