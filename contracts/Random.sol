// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SSTORE2} from "solady/src/utils/SSTORE2.sol";
import {LibPRNG} from "solady/src/utils/LibPRNG.sol";
import {EfficientHashLib} from "solady/src/utils/EfficientHashLib.sol";
import {LibMulticaller} from "multicaller/src/LibMulticaller.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

error Misconfigured();
error UnableToService();
error MissingPayment();
error SecretMismatch();
error ZeroSecret();
error NotInCohort();
error NotExpired();
error Incomplete();

event Bleached(uint256 pointerKey);

event Reprice(address indexed provider, uint256 pricePer);

event Ink(address indexed provider, uint256 markers, address pointer);

event Heat(address indexed to, uint256 index);

event CampaignStart(address indexed owner, bytes32 key); // no need to index because all keys should be unique

event SecretRevealed(address indexed provider, uint256 index, bytes32 formerSecret);

event CampaignExpired(address indexed recipient, address indexed ender, bytes32 key);

event OrderPreimageUpdate(bytes32 key, bytes32 before, bytes32 next);

event FundingScattered(address indexed recipient, uint256 amount, bytes32 key);

contract Random {
    using SSTORE2 for address;
    using SSTORE2 for bytes;

    using LibPRNG for LibPRNG.PRNG;

    using EfficientHashLib for bytes32;
    using EfficientHashLib for bytes32[];

    address internal immutable token;
    uint256 internal immutable price;
    uint256 internal immutable targetedBlockTime;
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

    mapping(address provider => mapping(uint256 index => uint256 accessFlags)) internal _accessFlags;
    mapping(address provider => uint256 max) internal _preimageCount;
    mapping(uint256 key => address pointer) internal _pointers;
    mapping(bytes32 key => RandomCampaign campaign) internal randomness;
    mapping(address provider => mapping(uint256 index => bytes32 formerSecret)) internal _noLongerSecret;
    mapping(address account => uint256 amount) internal _custodied;
    mapping(bytes32 preimage => bytes32 formerSecret) internal _preimageToSecret;
    mapping(bytes32 key => bool completeWhenExpired) internal _completeWhenExpired;

    struct RandomCampaign {
        uint256 timeline;
        bytes32 orderPreimage;
        bytes32 locationsHash;
        uint256 seed;
    }

    constructor(address t, uint256 p, uint256 _blockTime) {
        price = p;
        token = t;
        if (_blockTime == ZERO) {
            revert Misconfigured();
        }
        targetedBlockTime = _blockTime;
    }
    /**
     * provide stored randomness for the future. imagine painting a die with invisible ink
     * @param provider the account that has provided the randomness preimage
     * @dev if data length is > 24576, then this method will fail
     * @dev it is best to call this infrequently but to do so with a lot of calldata to increase gas savings
     */

    function _ink(address provider, bytes memory data) internal {
        unchecked {
            uint256 count = data.length / THREE_TWO;
            if (data.length % THREE_TWO != ZERO) {
                revert Misconfigured();
            }
            uint256 start = _preimageCount[provider];
            address pointer = data.write();
            // over an address's lifetime, it can write up to 2^80 preimages (1.2089*1e24)
            // currently the count will be limited to 24_576/32=768 per _ink call, but future updates
            // could improve this, so 15 bits are allocated for that situation (up to 32,768)
            _pointers[(uint256(uint160(provider)) << NINE_SIX) | (start << ONE_SIX)] = pointer;
            _preimageCount[provider] = start + count;
            emit Ink(provider, start, pointer);
        }
    }
    /**
     * start the process to reveal the ink that was written (using invisible ink as a visual analogy)
     * @param preimageKey an encoded key that holds the provider [255..96], the section [95..16] and the index [15..1]
     * @dev the reason why this method uses flags (256 per slot) is because this allows a
     * central entity to benefit from requesting randomness such as an eip3074 enabled multicaller
     * and benefit greatly from the gas savings of access the same slot up to 256 times
     * @dev notice that the index is derived from the preimage key by adding [95..16] and [15..1] together
     */

    function _ignite(uint256 preimageKey) internal returns (uint256) {
        unchecked {
            uint256 index = uint256(uint16(preimageKey));
            uint256 start = uint256(uint80(preimageKey >> ONE_SIX));
            address provider = address(uint160(preimageKey >> NINE_SIX));
            address pointer = _pointers[(uint256(uint160(provider)) << NINE_SIX) | (start << ONE_SIX)];
            if (pointer == address(0)) {
                revert Misconfigured();
            }
            uint256 size;
            assembly {
                size := extcodesize(pointer)
            }
            // index too high
            if (size / THREE_TWO <= index) {
                revert Misconfigured();
            }
            // now that the index has verified on chain data, we can treat it as a global index
            index += start;
            // returning zero means that the secret has not been requested yet on chain
            uint256 section = _accessFlags[provider][index / TWO_FIVE_SIX];
            if ((section << (TWO_FIVE_FIVE - (index % TWO_FIVE_SIX)) >> TWO_FIVE_FIVE) > ZERO) {
                return ZERO;
            }
            _accessFlags[provider][index / TWO_FIVE_SIX] = (section | (ONE << (index % TWO_FIVE_SIX)));
            emit Heat(provider, index);
            return ONE;
        }
    }

    function _flick(bytes32 key, uint256 preimageKey, uint256 index, bytes32 formerSecret) internal {
        unchecked {
            address pointer = _pointers[preimageKey];
            uint256 lower = uint256(uint80(preimageKey >> ONE_SIX));
            // length check is skipped because if one goes out of bounds you either err
            // or you end up with zero bytes, which would be quite the feat to find the hash for
            uint256 start = (index - lower) * THREE_TWO;
            bytes32 hashed = formerSecret.hash();
            // always read 32 bytes
            if (hashed != bytes32(pointer.read(start, start + THREE_TWO))) {
                revert SecretMismatch();
            }
            // secret cannot be zero
            if (formerSecret == bytes32(ZERO)) {
                revert ZeroSecret();
            }
            // only ever set once but do not penalize for lack of coordination
            address provider = address(uint160(preimageKey >> NINE_SIX));
            if (_noLongerSecret[provider][index] == bytes32(ZERO)) {
                _noLongerSecret[provider][index] = formerSecret;
                ++randomness[key].seed;
                emit SecretRevealed(provider, index, formerSecret);
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
        uint256[] calldata indices,
        bytes32[] memory revealedSecrets
    ) internal returns (bool) {
        unchecked {
            uint256 i;
            uint256 len = providerKeys.length;
            RandomCampaign storage random = randomness[key];
            if (random.seed > TWO_FIVE_FIVE) {
                return false;
            }
            bytes32[] memory locations = new bytes32[](len);
            uint256 providedKey;
            do {
                providedKey = uint256(providerKeys[i]);
                _flick(key, providedKey, indices[i], revealedSecrets[i]);
                locations[i] = bytes32((providedKey >> NINE_SIX << NINE_SIX) | indices[i]);
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
        return bytes32((uint256(hashed) << EIGHT) | uint256(uint8(len)));
    }

    function _distribute(address recipient, uint256 amount) internal {
        if (token == address(0)) {
            (bool success, bytes memory b) = recipient.call{value: amount}("");
            if (!success) {
                _bubbleRevert(b);
            }
        } else {
            if (!IERC20(token).transfer(recipient, amount)) {
                _bubbleRevert("");
            }
        }
    }

    function _heat(uint256 required, uint256 expiryOffset, bytes32 orderPreimage, bytes32[] calldata locations)
        internal
        returns (bytes32)
    {
        unchecked {
            {
                if (required == ZERO || required >= TWO_FIVE_FIVE) {
                    // only 254 len or fewer allowed
                    revert UnableToService();
                }
                uint256 cost = _cost(required, price);
                if (cost > msg.value) {
                    revert MissingPayment();
                }
                uint256 i;
                uint256 len = locations.length;
                uint256 contributing;
                do {
                    // non zero means that the value exists
                    if (_ignite(uint256(locations[i])) == ONE) {
                        ++contributing;
                        if (contributing == required) {
                            break;
                        }
                    }
                    ++i;
                } while (i < len);

                if (contributing < required) {
                    // let other contracts revert if they must
                    revert UnableToService();
                }
            }
            {
                bytes32 locsHash = locations.hash();
                bytes32 key = _toId(EfficientHashLib.hash(locsHash, orderPreimage), locations.length);
                address owner = LibMulticaller.senderOrSigner();
                // front load the cost of requesting randomness
                // put it on the shoulders of the consumer
                // this can probably be optimized
                randomness[key] = RandomCampaign({
                    timeline: uint256(uint160(owner)) << NINE_SIX
                        | (
                            uint256((uint48((expiryOffset << TWO_FIVE_FIVE > ZERO) ? block.number : block.timestamp)))
                                << FOUR_EIGHT
                        ) | uint256(uint48(expiryOffset)),
                    locationsHash: locsHash,
                    orderPreimage: orderPreimage,
                    // extra cost + saves later
                    seed: ONE
                });
                emit CampaignStart(owner, key);
                return key;
            }
        }
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
        return key == _toId(EfficientHashLib.hash(randomness[key].locationsHash, randomness[key].orderPreimage), len);
    }

    function expired(bytes32 key) external view returns (bool) {
        return _expired(randomness[key].timeline);
    }

    function heat(uint256 required, uint256 expiryOffset, bytes32 orderPreimage, bytes32[] calldata locations)
        external
        payable
        returns (bytes32)
    {
        return _heat(required, expiryOffset, orderPreimage, locations);
    }

    function ink(bytes calldata data) external payable {
        _ink(LibMulticaller.senderOrSigner(), data);
    }

    function chop(bytes32 key) external payable {
        address sender = LibMulticaller.senderOrSigner();
        address owner = address(uint160(randomness[key].timeline >> NINE_SIX));
        if (sender != owner) {
            revert Misconfigured();
        }
        if (_expired(uint160(randomness[key].timeline))) {
            uint256 len = uint256(uint8(uint256(key)));
            if (randomness[key].seed - ONE == len) {
                // refund request is invalid - all secrets are on chain
                //
            } else {
                // this should delete all of the struct's keys as well
                delete randomness[key];
                // not all secrets have been revealed. this is a valid refund
                _custodied[owner] += _cost(len, price);
            }
        }
    }

    function flick(bytes32 key, uint256 providedKey, uint256 index, bytes32 revealedSecret) external payable {
        _flick(key, providedKey, index, revealedSecret);
    }

    function cast(bytes32 key, bytes32[] calldata providerKeys, uint256[] calldata indices, bytes32[] calldata revealed)
        external
        payable
    {
        unchecked {
            if (_cast(key, providerKeys, indices, revealed)) {
                // providers are paid
                _scatter(key, providerKeys);
            }
        }
    }

    function _scatter(bytes32 key, bytes32[] calldata providerKeys) internal {
        uint256 len = providerKeys.length;
        uint256 cost = _cost(len, price);
        address ender = LibMulticaller.senderOrSigner();
        address recipient = address(uint160(uint256(providerKeys[_random(key, len)]) >> NINE_SIX));
        if (_expired(randomness[key].timeline)) {
            uint256 expiredCallerPayout = cost / 2; // take half if expiry happens late
            _custodied[ender] += expiredCallerPayout;
            cost -= expiredCallerPayout;
            // can / should be used as reputation
            emit CampaignExpired(recipient, ender, key);
        }
        _custodied[recipient] += cost;
    }
    /**
     * if the data is on chain (in storage), one can pull the data from on chain and validate it
     * @param key the key for the randomness campaign
     */

    function dig(bytes32 key, bytes32[] calldata providerKeys, uint256[] calldata indices) external payable {
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
                secrets[i] = _noLongerSecret[address(uint160(uint256(providerKeys[i])))][indices[i]];
                ++i;
            } while (i < len);
            if (_cast(key, providerKeys, indices, secrets)) {
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

    function handoff(address recipient, uint256 amount) external payable {
        unchecked {
            address account = LibMulticaller.senderOrSigner();
            uint256 limit = _custodied[account];
            amount = amount == ZERO ? limit : (amount > limit ? limit : amount);
            _custodied[account] -= amount;
            _distribute(recipient == address(0) ? account : recipient, amount);
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
            uint256 size;
            address pointer = _pointers[id];
            assembly {
                size := extcodesize(pointer)
            }
            size /= THREE_TWO;
            if (size > ZERO) {
                emit Bleached(id);
                // consumes a whole pointer
                for (uint256 i; i < size; ++i) {
                    _ignite(id | i);
                }
            }
        }
    }
}
