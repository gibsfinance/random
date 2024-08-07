// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SSTORE2} from "solady/src/utils/SSTORE2.sol";
import {LibPRNG} from "solady/src/utils/LibPRNG.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {EfficientHashLib} from "solady/src/utils/EfficientHashLib.sol";
import {LibMulticaller} from "multicaller/src/LibMulticaller.sol";
import {Random as RandomImplementation} from "./implementations/Random.sol";
import {PreimageLocation} from "./PreimageLocation.sol";
import {ERC20} from "solady/src/tokens/ERC20.sol";
import {Errors} from "./Errors.sol";

error SecretMismatch();

event OrderPreimageUpdate(uint256 id, bytes32 preimage);

event Chain(bytes32 indexed owner, uint256 id);

contract Consumer {
    using EfficientHashLib for bytes32;
    using SafeTransferLib for address;

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

    address internal immutable rand;

    uint256 internal _id;

    mapping(address sender => bytes32 latest) internal latest;

    mapping(bytes32 key => bool completeWhenExpired) internal _completeWhenExpired;
    mapping(bytes32 preimage => bytes32 formerSecret) internal _preimageToSecret;
    mapping(bytes32 preimage => uint256 id) internal _preimageToId;
    mapping(uint256 id => bytes32 owner) internal _owner;
    mapping(uint256 id => bytes32 preimage) internal _preimage;
    mapping(uint256 id => bytes32 key) internal _key;

    /**
     * @param id the id of the chained randomness to reveal
     */
    function tell(uint256 id, bytes32 revealedOrderSecret) external {
        unchecked {
            bytes32 key = _key[id];
            RandomImplementation.Randomness memory r = RandomImplementation(rand).randomness(key);
            bytes32 hashed = revealedOrderSecret.hash();
            if (RandomImplementation(rand).expired(r.timeline)) {
                // order preimage cannot be overriden until after all secrets have been revealed
                // this creates a high incentive for both player 1, and rule enforcer so that either way,
                // entities are incented to submit secret on chain before the expired line is crossed
                // either:
                // 1) player 1 wins, and they want to claim their winnings (high incentive to keep secret safe)
                // 2) player 1 loses, so the rule enforcer is incented to claim their winnings
                // 3) if either one waits too long - and allows others overwrite the preimage,
                //    then the benefiting party risks a re-roll of the randomness seed
                if (_completeWhenExpired[key]) {
                    return;
                }
                if (r.seed != bytes32(ZERO) && uint256(uint8(uint256(r.timeline))) == uint256(uint8(uint256(key)))) {
                    if (hashed != _preimage[id]) {
                        bytes32 owner = _owner[id];
                        // originator of the chained secret+preimage can reject updates
                        // it is up to anyone who would wish to turn this feature on to check that it will work ahead of time
                        if (uint256(owner >> ONE_SIX_ZERO) == ZERO) {
                            revert Errors.Misconfigured();
                        }
                        // we allow non secret holdes to update the order preimage in order to maximally incent
                        // randomenss campaign completion
                        // think of it like chips with an expiry time. you might be able to cash them in,
                        // but the desk might also refuse to honor them if the expiry time is too far from the defined values
                        // in that case, they are worthless
                        // if a casino wants to have an intermediate period they can enforce that in their own contract
                        emit OrderPreimageUpdate(id, hashed);
                        _preimage[id] = hashed;
                    }
                    // note that the preimage may not be what was originally intended - we do not track in the contract
                    _completeWhenExpired[key] = true;
                }
            }
            if (hashed != _preimage[id]) {
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
            return (r.seed != bytes32(ZERO) ? ZERO : ONE)
                + (RandomImplementation(rand).expired(r.timeline) && _completeWhenExpired[key] ? ONE : ZERO);
        }
    }

    function heat(
        uint256 required,
        uint256 expiryOffset,
        address token,
        PreimageLocation.Info[] calldata potentialLocations
    ) external payable returns (bytes32 key) {
        if (token != address(0)) {
            token.safeApprove(rand, type(uint256).max);
        }
        key = RandomImplementation(rand).heat{value: msg.value}(required, expiryOffset, token, potentialLocations);
        latest[LibMulticaller.senderOrSigner()] = key;
    }

    function chain(address owner, bool underminable, bytes32 preimage) external returns (uint256 id) {
        if (preimage == bytes32(ZERO)) {
            revert Errors.Misconfigured();
        }
        bytes32 key = latest[owner];
        if (key == bytes32(ZERO)) {
            revert Errors.Misconfigured();
        }
        id = _preimageToId[preimage];
        if (_preimage[id] == preimage) {
            return id;
        }
        id = ++_id;
        bytes32 o = bytes32((underminable ? ONE : ZERO << ONE_SIX_ZERO) | uint256(uint160(owner)));
        _owner[id] = o;
        _preimage[id] = preimage;
        _key[id] = key;
        // allow for reverse lookup
        _preimageToId[preimage] = id;
        emit Chain({owner: o, id: id});
    }
}
