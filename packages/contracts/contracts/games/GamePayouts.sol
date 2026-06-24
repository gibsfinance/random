// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// Pure on-chain reproduction of the msgboard-games settlement math (dice + limbo for M1).
/// Returns the conserved (balancePlayer, balanceHouse) split for a single-draw round. Parity with
/// the TS reference is pinned by foundry vectors generated from the canonical game code.
library GamePayouts {
    error UnknownGame();

    // shared constants — mirror examples/games/msgboard-games/src/game.ts
    uint256 internal constant EDGE_BPS = 100;     // 1% house edge (bps)
    uint256 internal constant HUNDREDTHS = 100;   // 1.00x == 100

    // dice — mirror src/games/dice.ts
    uint256 internal constant DICE_ROLL_SPACE = 10_000;
    uint256 internal constant DICE_MIN_TARGET = 1;
    uint256 internal constant DICE_MAX_TARGET = 9899;

    function settle(
        uint8 gameId,
        uint256 r,
        bytes memory params,
        uint256 escrowPlayer,
        uint256 escrowHouse
    ) internal pure returns (uint256 balancePlayer, uint256 balanceHouse) {
        uint256 stake = escrowPlayer; // escrowFor: escrowPlayer == stake
        uint256 payout;

        if (gameId == 1) {
            payout = _dice(r, params, stake);
        } else {
            revert UnknownGame();
        }

        uint256 pot = escrowPlayer + escrowHouse;
        require(payout <= pot, "payout exceeds pot"); // escrow ceiling guarantees this; assert for safety
        balancePlayer = payout;
        balanceHouse = pot - payout;
    }

    /// dice (gameId 1): roll-under target in hundredths of a percent. Ports diceMultiplierX100 +
    /// settleRound from src/games/dice.ts using the EXACT TS operation order:
    ///   multX100 = (ROLL_SPACE - EDGE_BPS) * ROLL_SPACE / targetX100 / HUNDREDTHS
    ///   payout   = win ? stake * multX100 / HUNDREDTHS : 0
    function _dice(uint256 r, bytes memory params, uint256 stake) private pure returns (uint256) {
        uint256 targetX100 = abi.decode(params, (uint256));
        require(targetX100 >= DICE_MIN_TARGET && targetX100 <= DICE_MAX_TARGET, "dice: target out of range");
        uint256 roll = r % DICE_ROLL_SPACE;
        if (roll >= targetX100) return 0; // loss
        uint256 multX100 = (DICE_ROLL_SPACE - EDGE_BPS) * DICE_ROLL_SPACE / targetX100 / HUNDREDTHS;
        return stake * multX100 / HUNDREDTHS;
    }
}
