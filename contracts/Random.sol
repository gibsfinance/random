// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import { SSTORE2 } from "solady/src/utils/SSTORE2.sol";
import { LibPRNG } from "solady/src/utils/LibPRNG.sol";
import { EfficientHashLib } from "solady/src/utils/EfficientHashLib.sol";
import { LibMulticaller } from "multicaller/src/LibMulticaller.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns(bool);
}

error Misconfigured();
error MissingPayment();
error SecretMismatch();
error ZeroSecret();
error CohortMismatch();
error NotInCohort();
error NotExpired();
error Incomplete();

event Reprice(address indexed provider, uint256 pricePer);
event Ink(address indexed provider, uint256 markers, address pointer);
event Heat(address indexed to, uint256 index);
event Contributed(uint256 indexed cohortId, uint256 amount);
event InviteToCohort(uint256 indexed cohortId, address indexed provider);
event CampaignStart(address indexed sender, bytes32 key); // no need to index because all keys should be unique
event SecretRevealed(address indexed provider, uint256 index, bytes32 formerSecret);

contract Random {
    using SSTORE2 for address;
    using SSTORE2 for bytes;
    using LibPRNG for LibPRNG.PRNG;
    using EfficientHashLib for bytes;
    using EfficientHashLib for bytes32;
    using EfficientHashLib for bytes32[];

    address internal immutable token;
    uint256 internal immutable price;
    uint256 internal immutable targetedBlockTime;
    uint256 constant internal ZERO = 0;
    uint256 constant internal ONE = 1;
    uint256 constant internal EIGHT = 8;
    uint256 constant internal ONE_SIX = 16;
    uint256 constant internal THREE_TWO = 32;
    uint256 constant internal FOUR_EIGHT = 48;
    uint256 constant internal NINE_SIX = 96;
    uint256 constant internal ONE_TWO_EIGHT = 128;
    uint256 constant internal ONE_SIX_ZERO = 160;
    uint256 constant internal TWO_ZERO_EIGHT = 208;
    uint256 constant internal TWO_ZERO_NINE = ONE + TWO_ZERO_EIGHT;
    uint256 constant internal TWO_FOUR_EIGHT = 248;
    uint256 constant internal TWO_FIVE_FIVE = 255;
    uint256 constant internal TWO_FIVE_SIX = 256;
    uint256 constant internal ONE_HUNDRED_ETHER = 100 ether;

    mapping(uint256 cohortId => uint256 value) internal _payouts;
    mapping(uint256 cohortId => mapping(address provider => uint256 value)) internal _perCohortParticipantPayout;
    mapping(address provider => mapping(uint256 index => uint256 accessFlags)) internal _accessFlags;
    mapping(address provider => uint256 max) internal _preimageCount;
    mapping(uint256 key => address pointer) internal _pointers;
    mapping(bytes32 key => Campaign campaign) internal randomness;
    mapping(address provider => mapping(uint256 index => bytes32 formerSecret)) internal _noLongerSecret;
    mapping(address account => uint256 amount) internal _custodied;
    mapping(bytes32 preimage => bytes32 formerSecret) internal _preimageToSecret;

    struct Campaign {
        uint256 timeline;
        uint256 cohortId;
        bytes32 orderPreimage;
        bytes32 locationsHash;
        uint256 upper;
        uint256 result;
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
            uint256 start = _preimageCount[provider];
            address pointer = data.write();
            // over an address's lifetime, it can write up to 2^80 preimages (1.2089*1e24)
            // currently the count will be limited to 24_576/32=768 per _inc call, but future updates
            // could improve this, so 15 bits are allocated for that situation (up to 32,768)
            uint256 markers = (start << ONE_SIX) | (count << ONE);
            _pointers[uint256(uint160(provider)) << NINE_SIX | markers] = pointer;
            _preimageCount[provider] = start + count;
            emit Ink(provider, markers, pointer);
        }
    }
    /**
     * start the process to reveal the ink that was written (using invisible ink as a visual analogy)
     * @param provider the provider to purchase randomness from
     * @param index the index of the preimage to access
     * @dev the reason why this method uses flags (256 per slot) is because this allows a
     * central entity to benefit from requesting randomness such as an eip3074 enabled multicaller
     * and benefit greatly from the gas savings of access the same slot multiple times
     */
    function _heat(address provider, uint256 index) internal returns(bool) {
        unchecked {
            // returning zero means that the secret has not been requested yet on chain
            uint256 section = _accessFlags[provider][index / TWO_FIVE_SIX];
            if ((section << (index % TWO_FIVE_SIX) >> TWO_FIVE_FIVE) > ZERO) {
                return true;
            }
            _accessFlags[provider][index / TWO_FIVE_SIX] = (section | (ONE << index));
            emit Heat(provider, index);
            return true;
        }
    }
    function _flick(bytes32 campaignKey, uint256 preimageKey, uint256 index, bytes32 formerSecret) internal {
        unchecked {
            address pointer = _pointers[preimageKey];
            uint256 lower = uint256(uint80(preimageKey >> ONE_SIX));
            // length check is skipped because if one goes out of bounds you either err
            // or you end up with zero bytes, which would be quite the feat to find the hash for
            uint256 start = (index - lower) * THREE_TWO;
            bytes32 hashed = formerSecret.hash();
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
                ++randomness[campaignKey].result;
                emit SecretRevealed(provider, index, formerSecret);
            }
        }
    }
    function _cost(uint256 required, uint256 priceFraction) internal virtual pure returns(uint256) {
        unchecked {
            return (uint256(priceFraction >> ONE_TWO_EIGHT) * (required + ONE))
                / (priceFraction << ONE_TWO_EIGHT >> ONE_TWO_EIGHT);
        }
    }
    function _contribute(uint256 cohortId, uint256 contributed) internal returns(bool) {
        // any value above required is distributed to the cohort
        unchecked {
            uint256 before = _payouts[cohortId];
            uint256 total = before >> ONE;
            _payouts[cohortId] = (total << ONE | ONE);
            if (contributed > ZERO) {
                emit Contributed(cohortId, contributed);
            }
            return before << TWO_FIVE_FIVE > ZERO;
        }
    }
    function _unlock(uint256 cohortId, uint256 amount) internal {
        // i don't need to do bitshifting here so long as i am confident that
        // the amount will never accumulate more than 1^128-1
        unchecked {
            _payouts[cohortId] = _payouts[cohortId] + amount;
        }
    }
    function _notifyCohort(uint256 cohortId, bytes32[] memory cohort) internal {
        uint256 i = ONE;
        uint256 len = cohort.length;
        do {
            // ui's should not expect that a cohort has been joined until an
            // acceptance through participation has been observed
            emit InviteToCohort(cohortId, address(uint160(uint256(cohort[i]))));
            unchecked {
                ++i;
            }
        } while (i < len);
    }
    function heat(
        uint256 required, uint256 expiryOffset,
        bytes32 orderPreimage,
        bytes32[] calldata locations
    ) external payable returns(bytes32) {
        unchecked {
            uint256 cohortId;
            {
                if (required == ZERO) {
                    return bytes32(ZERO);
                }
                if (required >= TWO_FIVE_FIVE) {
                    revert CohortMismatch();
                }
                uint256 i;
                uint256 len = locations.length;
                bytes32[] memory cohort = new bytes32[](required);
                uint256 contributing;
                uint256 cost = _cost(required, price);
                uint160 providerAddr;
                do {
                    providerAddr = uint160(uint256(bytes32(locations[i] >> NINE_SIX)));
                    if (_heat(address(providerAddr), uint256(uint96(uint256(bytes32(locations[i])))))) {
                        cohort[contributing] = bytes32(uint256(providerAddr));
                        ++contributing;
                        if (contributing == required) {
                            break;
                        }
                    }
                    ++i;
                } while (i < len);
                if (contributing < required) {
                    // let other contracts revert if they must
                    revert Misconfigured();
                }
                if (cost > msg.value) {
                    revert MissingPayment();
                }
                // this is the key under which funds are locked and how payments will be tracked
                cohortId = _toId(cohort.hash(), required);
                if (_contribute(cohortId, msg.value)) {
                    _notifyCohort(cohortId, cohort);
                }
            }
            {
                bytes32 locsHash = locations.hash();
                bytes32 key = EfficientHashLib.hash(bytes32(cohortId), locsHash, orderPreimage);
                address caller = LibMulticaller.senderOrSigner();
                // front load the cost of requesting randomness
                // put it on the shoulders of the consumer
                // this can probably be optimized
                randomness[key] = Campaign({
                    timeline: uint256(uint160(caller)) << NINE_SIX
                        | (uint256((uint48((expiryOffset << TWO_FIVE_FIVE > ZERO) ? block.number : block.timestamp))) << TWO_FOUR_EIGHT)
                        | uint256(uint48(expiryOffset)),
                    cohortId: cohortId,
                    locationsHash: locsHash,
                    orderPreimage: orderPreimage,
                    upper: ONE, // extra cost
                    result: ONE // extra cost
                });
                emit CampaignStart(caller, key);
                return key;
            }
        }
    }
    function ink(bytes calldata data) external payable {
        _ink(LibMulticaller.senderOrSigner(), data);
    }
    function _cast(
        bytes32 campaignKey,
        bytes32[] calldata providerKeys,
        uint256[] calldata indices,
        bytes32[] memory revealedSecrets
    ) internal {
        unchecked {
            uint256 i;
            uint256 len = providerKeys.length;
            Campaign storage campaign = randomness[campaignKey];
            if (campaign.upper > TWO_FIVE_FIVE) {
                return;
            }
            bytes32[] memory locations = new bytes32[](len);
            uint256 providedKey;
            do {
                providedKey = uint256(providerKeys[i]);
                _flick(campaignKey, providedKey, indices[i], revealedSecrets[i]);
                locations[i] = bytes32(
                    (providedKey >> NINE_SIX << NINE_SIX) | indices[i]
                );
                ++i;
            } while (i < len);
            if (campaign.locationsHash != locations.hash()) {
                revert NotInCohort();
            }
            // mark as revealable
            campaign.timeline = campaign.timeline | ONE;
            campaign.upper = uint256(revealedSecrets.hash());
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
    function _expired(uint256 timeline) internal view returns(bool) {
        unchecked {
            return (
                // end
                timeline << TWO_FIVE_FIVE > ZERO ? block.number : block.timestamp
            ) - uint256(
                // beginning
                uint48(timeline >> FOUR_EIGHT)
            ) > (
                // expiration delta
                uint256(uint48(timeline) >> ONE)
            );
        }
    }
    function _toId(bytes32 hashed, uint256 len) internal pure returns(uint256) {
        return (uint256(hashed) << EIGHT) | uint256(uint8(len));
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
    function flick(bytes32 campaignKey, uint256 providedKey, uint256 index, bytes32 revealedSecret) external payable {
        _flick(campaignKey, providedKey, index, revealedSecret);
    }
    function cast(
        bytes32 campaignKey,
        bytes32[] calldata providerKeys,
        uint256[] calldata indices,
        bytes32[] calldata revealed
    ) external payable {
        unchecked {
            _cast(campaignKey, providerKeys, indices, revealed);
            _scatter(campaignKey, providerKeys.length);
        }
    }
    function _scatter(bytes32 campaignKey, uint256 len) internal {
        uint256 paid = _cost(len, price);
        if (_expired(randomness[campaignKey].timeline)) {
            _custodied[LibMulticaller.senderOrSigner()] += paid / len;
            paid -= (paid / len);
        }
        _unlock(randomness[campaignKey].cohortId, paid);
    }
    function dig(
        bytes32 campaignKey,
        bytes32[] calldata providerKeys,
        uint256[] calldata indices
    ) external payable {
        unchecked {
            uint256 len = uint256(uint8(uint256(campaignKey)));
            if ((randomness[campaignKey].result - ONE) != len) {
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
            _cast(campaignKey, providerKeys, indices, secrets);
            _scatter(campaignKey, providerKeys.length);
        }
    }
    function tell(bytes32 campaignKey, bytes32 revealedOrderSecret) external payable returns(uint256) {
        if (randomness[campaignKey].result > TWO_FIVE_FIVE) {
            return randomness[campaignKey].result;
        }
        unchecked {
            if (randomness[campaignKey].timeline << TWO_FIVE_FIVE >> TWO_FIVE_FIVE == ZERO) {
                revert Incomplete();
            }
            if (revealedOrderSecret.hash() != randomness[campaignKey].orderPreimage) {
                revert SecretMismatch();
            }
            // seed the prng
            LibPRNG.PRNG memory prng = LibPRNG.PRNG({
                state: uint256(revealedOrderSecret)
            });
            uint256 result = prng.uniform(randomness[campaignKey].upper);
            randomness[campaignKey].result = result;
            return result;
        }
    }
    /**
     * contribute to a list of providers a given amount of native token
     * @param cohort the list of randomness providers in a set
     * @dev this method can be called to create a cohort
     */
    function contribute(bytes32[] calldata cohort) external payable {
        uint256 cohortId = _toId(cohort.hash(), cohort.length);
        if (_contribute(cohortId, msg.value)) {
            _notifyCohort(cohortId, cohort);
        }
    }
    function collect(uint256 cohortId, bytes32[] calldata cohort, uint256 index, uint256 amount, address recipient) external payable {
        unchecked {
            address account = LibMulticaller.senderOrSigner();
            uint256 total = _payouts[cohortId];
            // if an invalid
            if (total == ZERO) {
                revert MissingPayment();
            }
            if (cohortId != _toId(cohort.hash(), cohort.length)) {
                revert CohortMismatch();
            }
            if (address(uint160(uint256(cohort[index]))) != account) {
                revert NotInCohort();
            }
            uint256 limit;
            limit = (
                (total - ONE) / uint256(cohortId >> TWO_FOUR_EIGHT)
            ) - _perCohortParticipantPayout[cohortId][account];
            amount = amount == ZERO ? limit : amount;
            amount = amount > limit ? limit : amount;
            if (amount == ZERO) {
                return;
            }
            _perCohortParticipantPayout[cohortId][account] += amount;
            _custodied[recipient == address(0) ? account : recipient] += amount;
        }
    }
    function handoff(address recipient, uint256 amount) external payable {
        unchecked {
            address account = LibMulticaller.senderOrSigner();
            uint256 limit = _custodied[account];
            amount = amount == ZERO ? limit : (
                amount > limit ? limit : amount
            );
            _custodied[account] -= amount;
            _distribute(recipient == address(0) ? account : recipient, amount);
        }
    }
    /**
     * when a provider no longer has access to appropriate data, he should
     * invalidate the data that he has written so that he does not confuse front ends
     */
    function bleach(uint256 start, uint256 count) external payable {
        unchecked {
            uint256 id = (uint256(uint160(LibMulticaller.senderOrSigner())) << ONE_SIX_ZERO)
                | (uint256(uint80(start)) << ONE_SIX)
                | uint256(uint16(count << ONE));
            if (_pointers[id] == address(0)) {
                return;
            }
            _pointers[id | ONE] = _pointers[id];
            _pointers[id] = address(0);
        }
    }
}
