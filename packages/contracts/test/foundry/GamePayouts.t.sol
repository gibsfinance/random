// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GamePayouts} from "../../contracts/games/GamePayouts.sol";

contract GamePayoutsTest is Test {
    uint256 internal constant ESCROW_PLAYER = 200;
    // escrowHouse for dice target 5000: stake*(mult-100)/100; mult = 99_000_000/5000/100 = 198
    // => max win profit = 200*(198-100)/100 = 196, so pot = 200 + 196 = 396 == the win payout.
    uint256 internal constant ESCROW_HOUSE = 196; // = 200*(198-100)/100 for 1.98x dice@5000

    // Vectors from gen-recompute-vectors.ts (REAL @gibs/msgboard-games), nonce 1, target 5000:
    //   dice-win : serverSeed=0x..01 clientSeed=0x..02 -> win,  payout 396
    //   dice-loss: serverSeed=0x..03 clientSeed=0x..04 -> loss, payout 0
    uint256 internal constant R_DICE_WIN =
        20349940423862035287868699599764962454537984981628200184279725786303353984557;
    uint256 internal constant R_DICE_LOSS =
        68053564258556317150349243837902514818945326343711789649774590383616699827597;
    uint256 internal constant PAYOUT_DICE_WIN = 396;

    // limbo target 200 (2.00x): every win pays stake*target/100 = 200*200/100 = 400, so pot must be
    // >= 400. Size escrowHouse = 200 => pot = 400 == the win payout (escrow ceiling exactly met).
    uint256 internal constant LIMBO_ESCROW_HOUSE = 200;
    // Vectors from gen-recompute-vectors.ts (REAL @gibs/msgboard-games), nonce 1, target 200.
    // NOTE (Task 2 review fix): seed labels were swapped — at target 200/nonce 1, s(7)/s(8) WINS and
    // s(5)/s(6) LOSES. These r values come from the corrected script:
    //   limbo-win : serverSeed=0x..07 clientSeed=0x..08 -> win,  payout 400
    //   limbo-loss: serverSeed=0x..05 clientSeed=0x..06 -> loss, payout 0
    uint256 internal constant R_LIMBO_WIN =
        108174256589026683124305912205446370618204099420522125478345491452742619876089;
    uint256 internal constant R_LIMBO_LOSS =
        84157554483925481790078325868819927141269412419533080553588607633004150223059;
    uint256 internal constant PAYOUT_LIMBO_WIN = 400;

    function _params(uint256 targetX100) internal pure returns (bytes memory) {
        return abi.encode(targetX100);
    }

    function test_dice_win_matchesTs() public pure {
        uint256 r = R_DICE_WIN; // from gen-recompute-vectors (dice-win)
        (uint256 bP, uint256 bH) =
            GamePayouts.settle(1, r, _params(5000), ESCROW_PLAYER, ESCROW_HOUSE);
        assertEq(bP, PAYOUT_DICE_WIN); // from gen-recompute-vectors (dice-win)
        assertEq(bP + bH, ESCROW_PLAYER + ESCROW_HOUSE); // conservation
    }

    function test_dice_loss_matchesTs() public pure {
        uint256 r = R_DICE_LOSS; // from gen-recompute-vectors (dice-loss)
        (uint256 bP, uint256 bH) =
            GamePayouts.settle(1, r, _params(5000), ESCROW_PLAYER, ESCROW_HOUSE);
        assertEq(bP, 0);
        assertEq(bH, ESCROW_PLAYER + ESCROW_HOUSE);
    }

    // r parity is structural; pin it with one known triple == the dice-win triple's r.
    function test_r_matchesTs() public pure {
        bytes32 serverSeed = bytes32(uint256(1));
        bytes32 clientSeed = bytes32(uint256(2));
        uint64 nonce = 1;
        uint256 r = uint256(keccak256(abi.encode(serverSeed, clientSeed, nonce)));
        assertEq(r, R_DICE_WIN); // identical to viem roundRandom(s(1), s(2), 1)
    }

    function test_limbo_win_matchesTs() public pure {
        uint256 r = R_LIMBO_WIN; // from gen-recompute-vectors (limbo-win, s(7)/s(8))
        (uint256 bP, uint256 bH) =
            GamePayouts.settle(2, r, _params(200), ESCROW_PLAYER, LIMBO_ESCROW_HOUSE);
        assertEq(bP, PAYOUT_LIMBO_WIN); // 400
        assertEq(bP + bH, ESCROW_PLAYER + LIMBO_ESCROW_HOUSE); // conservation
    }

    function test_limbo_loss_matchesTs() public pure {
        uint256 r = R_LIMBO_LOSS; // from gen-recompute-vectors (limbo-loss, s(5)/s(6))
        (uint256 bP, uint256 bH) =
            GamePayouts.settle(2, r, _params(200), ESCROW_PLAYER, LIMBO_ESCROW_HOUSE);
        assertEq(bP, 0);
        assertEq(bH, ESCROW_PLAYER + LIMBO_ESCROW_HOUSE);
    }

    // r parity for the limbo-win triple (s(7)/s(8) at nonce 1) — structural pin like test_r_matchesTs.
    function test_r_limbo_matchesTs() public pure {
        bytes32 serverSeed = bytes32(uint256(7));
        bytes32 clientSeed = bytes32(uint256(8));
        uint64 nonce = 1;
        uint256 r = uint256(keccak256(abi.encode(serverSeed, clientSeed, nonce)));
        assertEq(r, R_LIMBO_WIN); // identical to viem roundRandom(s(7), s(8), 1)
    }
}
