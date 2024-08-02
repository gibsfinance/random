// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SSTORE2} from "solady/src/utils/SSTORE2.sol";
import {LibPRNG} from "solady/src/utils/LibPRNG.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {EfficientHashLib} from "solady/src/utils/EfficientHashLib.sol";
import {LibMulticaller} from "multicaller/src/LibMulticaller.sol";
import {Random as RandomImplementation} from "./implementations/Random.sol";

error DeploymentFailed();
error Misconfigured();
error UnableToService();
error MissingPayment();
error SecretMismatch();
error ZeroSecret();
error NotInCohort();
error NotExpired();
error Incomplete();

event Ok(address indexed provider, uint256 startIndices);

event Bleached(bytes32 pointerKey);

event Reprice(address indexed provider, uint256 pricePer);

event Ink(address indexed provider, uint256 offset, address pointer);

event Heat(address indexed to, uint256 index);

event RandomnessStart(address indexed owner, bytes32 key); // no need to index because all keys should be unique

event SecretRevealed(address indexed provider, uint256 index, bytes32 formerSecret);

event CampaignExpired(address indexed recipient, address indexed ender, bytes32 key);

event OrderPreimageUpdate(bytes32 key, bytes32 before, bytes32 next);

event FundingScattered(address indexed recipient, uint256 amount, bytes32 key);

contract Random is RandomImplementation {
    using SSTORE2 for address;
    using SSTORE2 for bytes;

    using SafeTransferLib for address;

    using LibPRNG for LibPRNG.PRNG;

    using EfficientHashLib for bytes32;
    using EfficientHashLib for bytes32[];

    // address internal immutable token;
    // uint256 internal immutable price;
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

    mapping(bytes32 key => address pointer) internal _pointers;
    mapping(address provider => uint256 max) internal _preimageCount;
    mapping(address provider => mapping(uint256 index => uint256 accessFlags)) internal _accessFlags;
    mapping(bytes32 key => Randomness campaign) internal randomness;
    mapping(address account => mapping(address token => uint256 amount)) internal _custodied;
    mapping(bytes32 key => bytes32 formerSecret) internal _noLongerSecret;
    mapping(bytes32 preimage => bytes32 formerSecret) internal _preimageToSecret;
    mapping(bytes32 key => bool completeWhenExpired) internal _completeWhenExpired;

    struct Randomness {
        uint256 timeline;
        bytes32 orderPreimage;
        bytes32 locationsHash;
        uint256 seed;
        uint256 tokenAndAmount;
    }
    /**
     * start the process to reveal the ink that was written (using invisible ink as a visual analogy)
     * @param preimageKeyWithIndex an encoded key that holds the provider [255..96], the section [95..16] and the index [15..1]
     * @dev the reason why this method uses flags (256 per slot) is because this allows a
     * central entity to benefit from requesting randomness such as an eip3074 enabled multicaller
     * and benefit greatly from the gas savings of access the same slot up to 256 times
     * @dev notice that the index is derived from the preimage key by adding [95..16] and [15..1] together
     */

    function _ignite(uint256 preimageKeyWithIndex) internal returns (bool) {
        unchecked {
            if (_consumed(preimageKeyWithIndex)) {
                return false;
            }
            uint256 index = uint256(uint80(preimageKeyWithIndex >> ONE_SIX)) + uint256(uint16(preimageKeyWithIndex));
            _accessFlags[
                address(uint160(preimageKeyWithIndex >> NINE_SIX))
            ][index / TWO_FIVE_SIX] |= (ONE << (index % TWO_FIVE_SIX));
            emit Heat(
                address(uint160(preimageKeyWithIndex >> NINE_SIX)),
                index
            );
            return true;
        }
    }

    function _consumed(uint256 preimageKeyWithIndex) internal view returns(bool) {
        address provider = address(uint160(preimageKeyWithIndex >> NINE_SIX));
        uint256 offset = uint256(uint16(preimageKeyWithIndex));
        // offset too high
        if (_pointerSize(bytes32(preimageKeyWithIndex >> ONE_SIX << ONE_SIX)) / THREE_TWO <= offset) {
            revert Misconfigured();
        }
        uint256 index = uint256(uint80(preimageKeyWithIndex >> ONE_SIX)) + offset;
        // returning zero means that the secret has not been requested yet on chain
        uint256 section = _accessFlags[provider][index / TWO_FIVE_SIX];
        return (section << (TWO_FIVE_FIVE - (index % TWO_FIVE_SIX)) >> TWO_FIVE_FIVE) == ONE;
    }

    function consumed(uint256 preimageKeyWithIndex) external override view returns(bool) {
        return _consumed(preimageKeyWithIndex);
    }

    function _pointerSize(bytes32 preimageKey) internal view returns(uint256 size) {
        address pntr = _pointers[preimageKey];
        if (pntr == address(0)) {
            revert Misconfigured();
        }
        assembly {
            size := extcodesize(pntr)
        }
    }

    function _flick(bytes32 randomnessKey, bytes32 preimageKeyWithIndex, bytes32 formerSecret) internal {
        unchecked {
            address pntr = _pointers[preimageKeyWithIndex >> ONE_SIX << ONE_SIX];
            uint256 offset = uint256(uint16(uint256(preimageKeyWithIndex)));
            // secret cannot be zero
            if (formerSecret == bytes32(ZERO)) {
                revert ZeroSecret();
            }
            // length check is skipped because if one goes out of bounds you either err
            // or you end up with zero bytes, which would be quite the feat to find the hash for
            // always read 32 bytes
            if (formerSecret.hash() != bytes32(pntr.read((offset * THREE_TWO), ((offset * THREE_TWO) + THREE_TWO)))) {
                revert SecretMismatch();
            }
            // only ever set once but do not penalize for lack of coordination
            if (_noLongerSecret[preimageKeyWithIndex] == bytes32(ZERO)) {
                _noLongerSecret[preimageKeyWithIndex] = formerSecret;
                ++randomness[randomnessKey].seed;
                emit SecretRevealed(
                    address(uint160(uint256(preimageKeyWithIndex) >> NINE_SIX)),
                    uint256(uint80(uint256(preimageKeyWithIndex) >> ONE_SIX)) + offset,
                    formerSecret
                );
            }
        }
    }

    function _cost(uint256 required, uint256 priceFraction) internal pure virtual returns (uint256) {
        unchecked {
            return (uint256(priceFraction >> ONE_TWO_EIGHT) * (required + 2))
                / (priceFraction << ONE_TWO_EIGHT >> ONE_TWO_EIGHT);
        }
    }

    function _cast(
        bytes32 key,
        bytes32[] calldata providerKeys,
        bytes32[] memory revealedSecrets
    ) internal returns (bool) {
        unchecked {
            uint256 i;
            uint256 len = providerKeys.length;
            Randomness storage random = randomness[key];
            if (random.seed > TWO_FIVE_FIVE) {
                return false;
            }
            bytes32[] memory locations = new bytes32[](len);
            do {
                _flick(key, providerKeys[i], revealedSecrets[i]);
                locations[i] = providerKeys[i];
                ++i;
            } while (i < len);
            if (random.locationsHash != locations.hash()) {
                revert NotInCohort();
            }
            // mark as generated
            random.seed = uint256(revealedSecrets.hash());
            return true;
        }
    }
    /**
     * after an error is caught, it can be reverted again
     * @param data the data to repackage and revert with
     */

    function _bubbleRevert(bytes memory data) internal pure {
        if (data.length == ZERO) revert();
        assembly {
            revert(add(32, data), mload(data))
        }
    }

    function _expired(uint256 timeline) internal view returns (bool) {
        unchecked {
            // end
            return (timeline << TWO_FIVE_FIVE > ZERO ? block.number : block.timestamp)
            // start
            - (uint256(uint48(timeline >> FOUR_EIGHT)))
            // expiration delta
            > (uint256(uint48(timeline) >> ONE));
        }
    }

    function _toId(bytes32 hashed, uint256 len) internal pure returns (bytes32) {
        unchecked {
            return bytes32((uint256(hashed) << EIGHT) | uint256(uint8(len)));
        }
    }

    function _distribute(address token, address recipient, uint256 amount) internal {
        if (token == address(0)) {
            recipient.safeTransferETH(amount);
        } else {
            token.safeTransfer(recipient, amount);
        }
    }

    function _scatter(bytes32 key, bytes32[] calldata providerKeys) internal {
        uint256 len = providerKeys.length;
        // uint256 cost = _cost(len, price);
        address ender = LibMulticaller.senderOrSigner();
        address recipient = address(uint160(uint256(providerKeys[_random(key, len)]) >> NINE_SIX));
        uint256 tokenAndAmount = randomness[key].tokenAndAmount;
        address token = address(uint160(uint256(tokenAndAmount) >> NINE_SIX));
        uint256 cost = uint256(uint96(uint256(tokenAndAmount)));
        if (_expired(randomness[key].timeline)) {
            uint256 expiredCallerPayout = cost / 2; // take half if expiry happens late
            _custodied[ender][token] += expiredCallerPayout;
            cost -= expiredCallerPayout;
            // can / should be used as reputation
            emit CampaignExpired(recipient, ender, key);
        }
        _custodied[recipient][token] += cost;
    }

    function _heat(
        uint256 required, uint256 expiryOffset,
        address token,
        bytes32 orderPreimage, bytes32[] calldata potentialLocations
    )
        internal
        returns (bytes32)
    {
        unchecked {
            bytes32[] memory locations = new bytes32[](required);
            uint256 amount;
            address owner = LibMulticaller.senderOrSigner();
            {
                if (required == ZERO || required >= TWO_FIVE_FIVE) {
                    // only 254 len or fewer allowed
                    revert UnableToService();
                }
                uint256 i;
                uint256 len = potentialLocations.length;
                uint256 contributing;
                do {
                    // non zero means that the value exists
                    if (_ignite(uint256(potentialLocations[i]))) {
                        locations[contributing] = potentialLocations[i];
                        ++contributing;
                        if (required == contributing) {
                            break;
                        }
                    }
                    ++i;
                } while (i < len);

                if (token == address(0)) {
                    if (amount > msg.value) {
                        revert MissingPayment();
                    }
                    amount = msg.value;
                } else {
                    token.safeTransferFrom2(owner, address(this), amount);
                }
                if (i == len) {
                    // let other contracts revert if they must
                    revert UnableToService();
                }
            }
            {
                bytes32 locationsHash = locations.hash();
                bytes32 key = _toId(locationsHash.hash(orderPreimage), locations.length);
                // front load the cost of requesting randomness
                // put it on the shoulders of the consumer
                // this can probably be optimized
                randomness[key] = Randomness({
                    timeline: _timeline(owner, expiryOffset),
                    locationsHash: locationsHash,
                    orderPreimage: orderPreimage,
                    // extra cost + saves later
                    seed: ONE,
                    tokenAndAmount: (uint256(uint160(token)) << NINE_SIX) | uint256(uint96(amount))
                });
                emit RandomnessStart(owner, key);
                return key;
            }
        }
    }
    function _timeline(address owner, uint256 expiryOffset) internal view returns(uint256) {
        return uint256(uint160(owner)) << NINE_SIX
            | (uint256((uint48(
                (expiryOffset << TWO_FIVE_FIVE > ZERO) ? block.number : block.timestamp
            ))) << FOUR_EIGHT) | uint256(uint48(expiryOffset));
    }

    function pointer(address provider, uint256 start) external override view returns(address) {
        return _pointers[bytes32(uint256(uint160(provider)) << NINE_SIX | start << ONE_SIX)];
    }

    function fin(bytes32 key) external view returns (uint256) {
        unchecked {
            return (randomness[key].seed < TWO_FIVE_SIX ? ZERO : ONE)
                + (_expired(randomness[key].timeline) && _completeWhenExpired[key] ? ONE : ZERO);
        }
    }

    function held(bytes32 key, uint256 len) external view returns (bool) {
        // if this id does not match then either
        // a) the order preimage was alteredhj because the owner took too long to reveal it or
        // b) a refund was requsted and the data in the struct has been wiped
        return key == _toId(randomness[key].locationsHash.hash(randomness[key].orderPreimage), len);
    }

    function expired(bytes32 key) external view returns (bool) {
        return _expired(randomness[key].timeline);
    }

    function heat(
        uint256 required, uint256 expiryOffset,
        address token,
        bytes32 orderPreimage, bytes32[] calldata locations)
        external
        payable
        returns (bytes32)
    {
        return _heat(required, expiryOffset, token, orderPreimage, locations);
    }

    /**
     * provide stored randomness for the future. imagine painting a die with invisible ink
     * @param data the concatenated, immutable preimages to write on chain
     * @dev if data length is > (24576-32), then this method will fail
     * @dev it is best to call this infrequently but to do so with as
     * much calldata as possible to increase gas savings for randomness providers
     */
    function ink(bytes calldata data) external payable {
        address provider = LibMulticaller.senderOrSigner();
        unchecked {
            uint256 count = data.length / THREE_TWO;
            if (data.length % THREE_TWO != ZERO) {
                revert Misconfigured();
            }
            uint256 start = _preimageCount[provider];
            address pntr = data.write();
            // over an address's lifetime, it can write up to 2^80 preimages (1.2089*1e24)
            // currently the count will be limited to 24_576/32=768 per _ink call, but future updates
            // could improve this, so 15 bits are allocated for that situation (up to 32,768)
            _pointers[bytes32((uint256(uint160(provider)) << NINE_SIX) | (start << ONE_SIX))] = pntr;
            _preimageCount[provider] = start + count;
            emit Ink(provider, start, pntr);
        }
    }

    function chop(bytes32 key) external payable {
        unchecked {
            if (randomness[key].seed > TWO_FIVE_FIVE || randomness[key].seed == ZERO) {
                // don't penalize, as someone could slip in before
                return;
            }
            if (LibMulticaller.senderOrSigner() != address(uint160(randomness[key].timeline >> NINE_SIX))) {
                revert Misconfigured();
            }
            address token = address(uint160(uint256(randomness[key].tokenAndAmount) >> NINE_SIX));
            uint256 amount = uint256(uint96(uint256(randomness[key].tokenAndAmount)));
            _custodied[address(uint160(randomness[key].timeline >> NINE_SIX))][token] += amount;
            delete randomness[key];
        }
    }

    function flick(bytes32 key, bytes32 providedKey, bytes32 revealedSecret) external payable {
        _flick(key, providedKey, revealedSecret);
    }

    function cast(bytes32 key, bytes32[] calldata providerKeys, bytes32[] calldata revealed)
        external
        payable
    {
        unchecked {
            if (_cast(key, providerKeys, revealed)) {
                // providers are paid
                _scatter(key, providerKeys);
            }
        }
    }

    /**
     * if the data is on chain (in storage), one can pull the data from on chain and validate it
     * @param key the key for the randomness campaign
     */
    function dig(bytes32 key, bytes32[] calldata providerKeys) external payable {
        unchecked {
            uint256 len = uint256(uint8(uint256(key)));
            if (randomness[key].seed - ONE != len) {
                return;
            }
            // all secrets have been written on chain and yet, the die has not been cast
            // do a lookup on all preimages and cast
            bytes32[] memory secrets = new bytes32[](len);
            uint256 i;
            do {
                secrets[i] = _noLongerSecret[providerKeys[i]];
                ++i;
            } while (i < len);
            if (_cast(key, providerKeys, secrets)) {
                _scatter(key, providerKeys);
            }
        }
    }

    function hear(bytes32 key) external payable returns (uint256) {
        if (randomness[key].seed < TWO_FIVE_SIX) {
            revert Incomplete();
        }
        return _random(key, uint256(_preimageToSecret[randomness[key].orderPreimage]));
    }

    function tell(bytes32 key, bytes32 revealedOrderSecret) external payable {
        unchecked {
            if (randomness[key].seed < TWO_FIVE_SIX) {
                revert Incomplete();
            }
            bytes32 hashed = revealedOrderSecret.hash();
            if (_expired(randomness[key].timeline)) {
                if (randomness[key].seed <= uint256(uint8(uint256(key)))) {
                    if (hashed != randomness[key].orderPreimage) {
                        // we allow non secret holdes to update the order preimage in order to maximally incent
                        // randomenss campaign completion
                        // think of it like chips with an expiry time. you might be able to cash them in,
                        // but the desk might also refuse to honor them if the expiry time is too far from the defined values
                        // in that case, they are worthless
                        // if a casino wants to have an intermediate period they can enforce that in their own contract
                        emit OrderPreimageUpdate(key, randomness[key].orderPreimage, hashed);
                        randomness[key].orderPreimage = hashed;
                    }
                    _completeWhenExpired[key] = true;
                }
            }
            if (hashed != randomness[key].orderPreimage) {
                revert SecretMismatch();
            }
            _preimageToSecret[hashed] = revealedOrderSecret;
        }
    }

    function _random(bytes32 key, uint256 upper) internal view returns (uint256) {
        LibPRNG.PRNG memory prng = LibPRNG.PRNG({state: randomness[key].seed});
        return prng.uniform(upper);
    }

    function handoff(
        address token,
        address recipient,
        uint256 amount
    ) external payable {
        unchecked {
            address account = LibMulticaller.senderOrSigner();
            uint256 limit = _custodied[account][token];
            amount = amount == ZERO ? limit : (amount > limit ? limit : amount);
            _custodied[account][token] -= amount;
            _distribute(token, recipient == address(0) ? account : recipient, amount);
        }
    }
    /**
     * when a provider no longer has access to appropriate data, he should
     * invalidate the data that he has written so that he does not confuse front ends
     */

    function bleach(uint256 start) external payable {
        unchecked {
            uint256 id = (uint256(uint160(LibMulticaller.senderOrSigner())) << ONE_SIX_ZERO)
                | (uint256(uint80(start)) << ONE_SIX);
            uint256 size = _pointerSize(bytes32(id)) / THREE_TWO;
            size /= THREE_TWO;
            if (size > ZERO) {
                emit Bleached(bytes32(id));
                // consumes a whole pointer
                uint256 i;
                do {
                    _ignite(id | i);
                    ++i;
                } while (i < size);
            }
        }
    }
    function ok(uint256[] calldata startIndices) external payable {
        unchecked {
            address provider = LibMulticaller.senderOrSigner();
            uint256 len = startIndices.length;
            uint256 i;
            do {
                emit Ok(provider, startIndices[i]);
                ++i;
            } while (i < len);
        }
    }
}
