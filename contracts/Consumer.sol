// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SSTORE2} from "solady/src/utils/SSTORE2.sol";
import {LibPRNG} from "solady/src/utils/LibPRNG.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {EfficientHashLib} from "solady/src/utils/EfficientHashLib.sol";
import {LibMulticaller} from "multicaller/src/LibMulticaller.sol";
import {Random as RandomImplementation} from "./implementations/Random.sol";
import {PreimageLocation} from "./PreimageLocation.sol";
import {console} from "hardhat/console.sol";

error SecretMismatch();

event OrderPreimageUpdate(bytes32 key, bytes32 before, bytes32 next);

contract Consumer {
    using EfficientHashLib for bytes32;

    uint256 internal constant ZERO = 0;
    uint256 internal constant ONE = 1;
    uint256 internal constant EIGHT = 8;
    uint256 internal constant ONE_SIX = 16;
    uint256 internal constant THREE_TWO = 32;
    uint256 internal constant FOUR_EIGHT = 48;
    uint256 internal constant NINE_SIX = 96;
    uint256 internal constant ONE_TWO_EIGHT = 128;
    uint256 internal constant ONE_SIX_ZERO = 160;
    uint256 internal constant TWO_ZERO_EIGHT = 208;
    uint256 internal constant TWO_ZERO_NINE = ONE + TWO_ZERO_EIGHT;
    uint256 internal constant TWO_FOUR_EIGHT = 248;
    uint256 internal constant TWO_FIVE_FIVE = 255;
    uint256 internal constant TWO_FIVE_SIX = 256;
    uint256 internal constant ONE_HUNDRED_ETHER = 100 ether;

    address internal immutable rand;

    mapping(bytes32 key => bool completeWhenExpired) internal _completeWhenExpired;
    mapping(bytes32 preimage => bytes32 formerSecret) internal _preimageToSecret;
    mapping(bytes32 key => bytes32 preimage) internal _keyToPreimage;

    function tell(bytes32 key, bytes32 revealedOrderSecret) external {
        unchecked {
            RandomImplementation.Randomness memory r = RandomImplementation(rand).randomness(key);
            bytes32 hashed = revealedOrderSecret.hash();
            if (RandomImplementation(rand).expired(key)) {
                // order preimage cannot be overriden until after all secrets have been revealed
                // this creates a high incentive for both player 1, and rule enforcer so that either way,
                // entities are incented to submit secret info before the expired line is crossed
                // either:
                // 1) player 1 wins, and they want to claim their winnings
                // 2) player 1 loses, so the rule enforcer is incented to claim their winnings
                // 3) if either one waits too long - and allows others overwrite the preimage,
                //    then the benefiting party risks a re-roll of the randomness seed
                if (r.seed > TWO_FIVE_FIVE && uint256(uint8(uint256(r.seed))) > uint256(uint8(uint256(key)))) {
                    if (hashed != _keyToPreimage[key]) {
                        // we allow non secret holdes to update the order preimage in order to maximally incent
                        // randomenss campaign completion
                        // think of it like chips with an expiry time. you might be able to cash them in,
                        // but the desk might also refuse to honor them if the expiry time is too far from the defined values
                        // in that case, they are worthless
                        // if a casino wants to have an intermediate period they can enforce that in their own contract
                        emit OrderPreimageUpdate(key, _keyToPreimage[key], hashed);
                        _keyToPreimage[key] = hashed;
                    }
                    // note that the preimage may not be what was originally intended - we do not track in the contract
                    _completeWhenExpired[key] = true;
                }
            }
            if (hashed != _keyToPreimage[key]) {
                revert SecretMismatch();
            }
            _preimageToSecret[hashed] = revealedOrderSecret;
            // we do not emit an event here because it is more likely that users will simply
            // do it themselves via a contract or only care about the latest
        }
    }

    function fin(bytes32 key) external view returns (uint256) {
        unchecked {
            return (RandomImplementation(rand).randomness(key).seed < TWO_FIVE_SIX ? ZERO : ONE)
                + (RandomImplementation(rand).expired(key) && _completeWhenExpired[key] ? ONE : ZERO);
        }
    }

    function heat(
        uint256 required,
        uint256 expiryOffset,
        address token,
        bytes32 preimage,
        PreimageLocation.Info[] calldata potentialLocations
    ) external payable {
        //
    }
}
