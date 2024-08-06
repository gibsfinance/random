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

error DeploymentFailed();
error Misconfigured();
error UnableToService();
error MissingPayment();
error SecretMismatch();
error ZeroSecret();
error NotInCohort();
error NotExpired();
error Incomplete();
error SignerMismatch();

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
    uint256 internal constant MAX_PREIMAGES = 65_535 - ONE;

    address internal immutable rand;

    mapping(bytes32 key => bool completeWhenExpired) internal _completeWhenExpired;
    mapping(bytes32 preimage => bytes32 formerSecret) internal _preimageToSecret;

    function tell(bytes32 key, bytes32 revealedOrderSecret) external {
        unchecked {
            RandomImplementation.Randomness memory r = RandomImplementation(rand).randomness(key);
            bytes32 hashed = revealedOrderSecret.hash();
            if (RandomImplementation(rand).expired(r.timeline)) {
                // order preimage cannot be overriden until after all secrets have been revealed
                // this creates a high incentive for both player 1, and rule enforcer so that either way,
                // entities are incented to submit secret info before the expired line is crossed
                // either:
                // 1) player 1 wins, and they want to claim their winnings
                // 2) player 1 loses, so the rule enforcer is incented to claim their winnings
                // 3) if either one waits too long - and allows others overwrite the preimage,
                //    then the benefiting party risks a re-roll of the randomness seed
                if (r.seed > TWO_FIVE_FIVE && uint256(uint8(uint256(r.seed))) > uint256(uint8(uint256(key)))) {
                    if (hashed != r.orderPreimage) {
                        // we allow non secret holdes to update the order preimage in order to maximally incent
                        // randomenss campaign completion
                        // think of it like chips with an expiry time. you might be able to cash them in,
                        // but the desk might also refuse to honor them if the expiry time is too far from the defined values
                        // in that case, they are worthless
                        // if a casino wants to have an intermediate period they can enforce that in their own contract
                        emit OrderPreimageUpdate(key, r.orderPreimage, hashed);
                        r.orderPreimage = hashed;
                    }
                    _completeWhenExpired[key] = true;
                }
            }
            if (hashed != r.orderPreimage) {
                revert SecretMismatch();
            }
            _preimageToSecret[hashed] = revealedOrderSecret;
            // we do not emit an event here because it is more likely that users will simply
            // do it themselves via a contract or only care about the latest
        }
    }

    function fin(bytes32 key) external view returns (uint256) {
        RandomImplementation.Randomness memory r = RandomImplementation(rand).randomness(key);
        unchecked {
            return (r.seed < TWO_FIVE_SIX ? ZERO : ONE)
                + (RandomImplementation(rand).expired(r.timeline) && _completeWhenExpired[key] ? ONE : ZERO);
        }
    }

    // function held(bytes32 key, uint256 len) external view returns (bool) {
    //     // if this id does not match then either
    //     // a) the order preimage was alteredhj because the owner took too long to reveal it or
    //     // b) a refund was requsted and the data in the struct has been wiped
    //     return key == _toId(randomness[key].locationsHash.hash(randomness[key].orderPreimage), len);
    // }
}