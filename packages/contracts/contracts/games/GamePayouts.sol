// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// Pure on-chain reproduction of the msgboard-games settlement math.
/// M1 mirrored dice + limbo; Phase-1 "free reskins" add crash (==limbo curve), monte and dicex2.
/// Returns the conserved (balancePlayer, balanceHouse) split for a single-draw round. Parity with
/// the TS reference is pinned by foundry vectors generated from the canonical game code.
///
/// NOT YET mirrored on-chain (table games — same status as plinko/keno/mines): pachinko (7) and
/// wheel (8). Their settlement currently rides the co-signed transcript path; an on-chain table
/// recompute is a follow-on "table games on-chain" milestone.
library GamePayouts {
    error UnknownGame();

    // shared constants — mirror examples/games/msgboard-games/src/game.ts
    uint256 internal constant EDGE_BPS = 100;     // 1% house edge (bps)
    uint256 internal constant HUNDREDTHS = 100;   // 1.00x == 100
    uint256 internal constant BPS = 10_000;       // basis-point scale

    // dice — mirror src/games/dice.ts
    uint256 internal constant DICE_ROLL_SPACE = 10_000;
    uint256 internal constant DICE_MIN_TARGET = 1;
    uint256 internal constant DICE_MAX_TARGET = 9899;

    // limbo — mirror src/games/limbo.ts
    uint256 internal constant LIMBO_U_SPACE = 1_000_000;
    uint256 internal constant LIMBO_ONE_MINUS_EDGE_X100 = (10_000 - EDGE_BPS) / HUNDREDTHS; // 99
    uint256 internal constant LIMBO_MIN_TARGET = 100;                                       // 1.00x
    uint256 internal constant LIMBO_MAX_TARGET = LIMBO_ONE_MINUS_EDGE_X100 * LIMBO_U_SPACE; // 99_000_000

    // monte — mirror src/games/monte.ts (3 cards, pays SLOTS*(1-edge))
    uint256 internal constant MONTE_SLOTS = 3;

    // dicex2 — mirror src/games/dicex2.ts (two derived rolls; NUM = (1-edge)*ROLL_SPACE*HUNDREDTHS)
    uint256 internal constant DICEX2_MIN_TARGET = 100;
    uint256 internal constant DICEX2_MAX_TARGET = 9899;
    uint256 internal constant DICEX2_NUM = (DICE_ROLL_SPACE - EDGE_BPS) * DICE_ROLL_SPACE * HUNDREDTHS; // 9_900_000_000

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
        } else if (gameId == 2) {
            payout = _limbo(r, params, stake);
        } else if (gameId == 6) {
            // crash (auto-cashout) is the limbo curve with target == autoCashout — identical math.
            payout = _limbo(r, params, stake);
        } else if (gameId == 9) {
            payout = _monte(r, params, stake);
        } else if (gameId == 10) {
            payout = _dicex2(r, params, stake);
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

    /// limbo (gameId 2): result = (1-edge)/(1-U). Ports limboResultX100 + settleRound from
    /// src/games/limbo.ts using the EXACT TS operation order:
    ///   u          = r % U_SPACE
    ///   resultX100 = (ONE_MINUS_EDGE_X100 * U_SPACE) / (U_SPACE - u)
    ///   win        = resultX100 >= targetX100
    ///   payout     = win ? stake * targetX100 / HUNDREDTHS : 0
    function _limbo(uint256 r, bytes memory params, uint256 stake) private pure returns (uint256) {
        uint256 targetX100 = abi.decode(params, (uint256));
        require(targetX100 >= LIMBO_MIN_TARGET && targetX100 <= LIMBO_MAX_TARGET, "limbo: target out of range");
        uint256 u = r % LIMBO_U_SPACE;
        uint256 resultX100 = (LIMBO_ONE_MINUS_EDGE_X100 * LIMBO_U_SPACE) / (LIMBO_U_SPACE - u);
        if (resultX100 < targetX100) return 0; // loss
        return stake * targetX100 / HUNDREDTHS;
    }

    /// monte (gameId 9): three-card monte. Ports monteWinningSlot + monteMultiplierX100 + settleRound
    /// from src/games/monte.ts using the EXACT TS operation order:
    ///   winning = r % SLOTS
    ///   multX100 = SLOTS * HUNDREDTHS * (BPS - EDGE_BPS) / BPS    (3*100*9900/10000 = 297)
    ///   payout  = pick == winning ? stake * multX100 / HUNDREDTHS : 0
    function _monte(uint256 r, bytes memory params, uint256 stake) private pure returns (uint256) {
        uint256 pick = abi.decode(params, (uint256));
        require(pick < MONTE_SLOTS, "monte: pick out of range");
        uint256 winning = r % MONTE_SLOTS;
        if (pick != winning) return 0;
        uint256 multX100 = MONTE_SLOTS * HUNDREDTHS * (BPS - EDGE_BPS) / BPS;
        return stake * multX100 / HUNDREDTHS;
    }

    /// dicex2 (gameId 10): two independent rolls derived from r via keccak (matches src/rng.ts
    /// subRandom: uint256(keccak256(abi.encode(uint256 r, uint64 index)))). Ports settleRound from
    /// src/games/dicex2.ts using the EXACT TS operation order:
    ///   roll_i = subRandom(r, i) % ROLL_SPACE
    ///   win    = mode==0 ? (roll1<target && roll2<target) : (roll1<target || roll2<target)
    ///   winCountScaled = mode==0 ? target^2 : ROLL_SPACE^2 - (ROLL_SPACE-target)^2
    ///   multX100 = NUM / winCountScaled ; payout = win ? stake * multX100 / HUNDREDTHS : 0
    /// params = abi.encode(uint256 targetX100, uint256 mode) ; mode 0 = both, 1 = either.
    function _dicex2(uint256 r, bytes memory params, uint256 stake) private pure returns (uint256) {
        (uint256 targetX100, uint256 mode) = abi.decode(params, (uint256, uint256));
        require(targetX100 >= DICEX2_MIN_TARGET && targetX100 <= DICEX2_MAX_TARGET, "dicex2: target out of range");
        require(mode <= 1, "dicex2: bad mode");
        uint256 roll1 = uint256(keccak256(abi.encode(r, uint64(0)))) % DICE_ROLL_SPACE;
        uint256 roll2 = uint256(keccak256(abi.encode(r, uint64(1)))) % DICE_ROLL_SPACE;
        bool aUnder = roll1 < targetX100;
        bool bUnder = roll2 < targetX100;
        bool win = mode == 0 ? (aUnder && bUnder) : (aUnder || bUnder);
        if (!win) return 0;
        uint256 winCountScaled = mode == 0
            ? targetX100 * targetX100
            : DICE_ROLL_SPACE * DICE_ROLL_SPACE - (DICE_ROLL_SPACE - targetX100) * (DICE_ROLL_SPACE - targetX100);
        uint256 multX100 = DICEX2_NUM / winCountScaled;
        return stake * multX100 / HUNDREDTHS;
    }
}
