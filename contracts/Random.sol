// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SSTORE2} from "solady/src/utils/SSTORE2.sol";
import {LibPRNG} from "solady/src/utils/LibPRNG.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {EfficientHashLib} from "solady/src/utils/EfficientHashLib.sol";
import {LibMulticaller} from "multicaller/src/LibMulticaller.sol";
import {IRandom} from "./implementations/IRandom.sol";
import {PreimageLocation} from "./PreimageLocation.sol";
import {Errors, Cast, Reveal, Ink, Heat, Start, Expired, Chop, Bleach} from "./Constants.sol";
import {StorageSlot} from "./StorageSlot.sol";
import {SlotDerivation} from "./SlotDerivation.sol";

contract Random is IRandom {
    // this error is used inside of sstore to so we surface it here so that it sticks in the abi
    using SSTORE2 for address;
    using SSTORE2 for bytes;

    using SafeTransferLib for address;

    using StorageSlot for bytes32;
    using StorageSlot for StorageSlot.Bytes32SlotType;
    using SlotDerivation for *;

    using LibPRNG for LibPRNG.PRNG;

    using EfficientHashLib for bytes32;
    using EfficientHashLib for bytes32[];

    using PreimageLocation for PreimageLocation.Info;

    string private constant _NAMESPACE = "random";

    mapping(address account => bytes32 latest) internal _latest;
    mapping(address account => mapping(address token => uint256 amount)) internal _custodied;
    mapping(address provider => mapping(address token => mapping(uint256 price => uint256 max))) internal _preimageCount;
    mapping(
        address provider
            => mapping(address token => mapping(uint256 price => mapping(uint256 offset => address pointer)))
    ) internal _pointers;
    mapping(
        address provider
            => mapping(address token => mapping(uint256 price => mapping(uint256 index => uint256 accessFlags)))
    ) internal _accessFlags;
    mapping(
        address provider
            => mapping(address token => mapping(uint256 price => mapping(uint256 index => bytes32 formerSecret)))
    ) internal _formerSecret;

    /**
     * start the process to reveal the ink that was written (using invisible ink as a visual analogy)
     * @dev the reason why this method uses flags (256 per slot) is because this allows a
     * central entity to benefit from requesting randomness such as an eip3074 enabled multicaller
     * and benefit greatly from the gas savings of access the same slot up to 256 times
     * @dev notice that the index is derived from the preimage key by adding [95..16] and [15..1] together
     */
    function _ignite(PreimageLocation.Info memory nfo, bytes32 section) internal returns (bool) {
        unchecked {
            if (_consumed(nfo)) {
                return false;
            }
            _accessFlags[nfo.provider][nfo.token][nfo.price][(nfo.offset + nfo.index) / TWO_FIVE_SIX] |=
                (ONE << ((nfo.offset + nfo.index) % TWO_FIVE_SIX));
            emit Heat(nfo.provider, section, nfo.offset + nfo.index);
            return true;
        }
    }

    function _consumed(PreimageLocation.Info memory nfo) internal view returns (bool) {
        if (_pointerSize(nfo) / THREE_TWO <= nfo.index) {
            revert Errors.Misconfigured();
        }
        // returning zero means that the secret has not been requested yet on chain
        uint256 section = _accessFlags[nfo.provider][nfo.token][nfo.price][(nfo.index + nfo.offset) / TWO_FIVE_SIX];
        return (section << (TWO_FIVE_FIVE - ((nfo.index + nfo.offset) % TWO_FIVE_SIX)) >> TWO_FIVE_FIVE) == ONE;
    }

    function _pointerSize(PreimageLocation.Info memory nfo) internal view returns (uint256 size) {
        address pntr = _pointers[nfo.provider][nfo.token][nfo.price][nfo.offset];
        if (pntr == address(0)) {
            revert Errors.Misconfigured();
        }
        assembly {
            size := extcodesize(pntr)
        }
    }

    function _flick(PreimageLocation.Info calldata nfo, bytes32 formerSecret)
        internal
        returns (bytes32 location, bool first)
    {
        unchecked {
            address pntr = _pointers[nfo.provider][nfo.token][nfo.price][nfo.offset];
            if (pntr == address(0)) {
                revert Errors.Misconfigured();
            }
            // length check is skipped because if one goes out of bounds you either err
            // or you end up with zero bytes, which would be quite the feat to find the hash for
            // always read 32 bytes
            if (
                formerSecret.hash()
                    != bytes32(pntr.read((nfo.index * THREE_TWO), ((nfo.index * THREE_TWO) + THREE_TWO)))
            ) {
                revert Errors.SecretMismatch();
            }
            // only ever set once but do not penalize for lack of coordination
            location = nfo.hash();
            if (_secret(nfo) == bytes32(ZERO)) {
                _formerSecret[nfo.provider][nfo.token][nfo.price][nfo.offset + nfo.index] = formerSecret;
                emit Reveal(nfo.provider, location, formerSecret);
                return (location, true);
            }
            return (location, false);
        }
    }

    function _cast(bytes32 key, PreimageLocation.Info[] calldata preimageInfo, bytes32[] memory revealedSecrets)
        internal
        returns (bool)
    {
        unchecked {
            uint256 i;
            uint256 len = preimageInfo.length;
            bytes32 seed = _seed[key];
            if (seed != bytes32(ZERO)) {
                return false;
            }
            bytes32[] memory locations = new bytes32[](len);
            uint256 firstFlicks;
            bool first;
            bool missing;
            do {
                if (revealedSecrets[i] != bytes32(0)) {
                    (locations[i], first) = _flick(preimageInfo[i], revealedSecrets[i]);
                    if (first) {
                        ++firstFlicks;
                    }
                } else {
                    revealedSecrets[i] = _secret(preimageInfo[i]);
                    if (revealedSecrets[i] == bytes32(ZERO)) {
                        missing = true;
                    }
                }
                ++i;
            } while (i < len);
            if (missing) {
                _timeline[key] += firstFlicks;
                return false;
            }
            if (key != _toId(locations.hash(), locations.length)) {
                revert Errors.NotInCohort();
            }
            _timeline[key] += firstFlicks;
            // mark as generated
            seed = revealedSecrets.hash();
            _seed[key] = seed;
            emit Cast(key, seed);
            _scatter(key, preimageInfo);
            return true;
        }
    }

    function _secret(PreimageLocation.Info calldata info) internal view returns (bytes32) {
        return _formerSecret[info.provider][info.token][info.price][info.offset + info.index];
    }

    function _toId(bytes32 hashed, uint256 len) internal pure returns (bytes32) {
        unchecked {
            return bytes32((uint256(hashed) << EIGHT) | uint256(uint8(len)));
        }
    }

    function _distribute(address token, address recipient, uint256 amount) internal {
        if (amount == ZERO) return;
        if (token == address(0)) {
            recipient.safeTransferETH(amount);
        } else {
            token.safeTransfer(recipient, amount);
        }
    }

    function _scatter(bytes32 key, PreimageLocation.Info[] calldata info) internal {
        unchecked {
            uint256 len = info.length;
            PreimageLocation.Info calldata item = info[_random(key, len)];
            uint256 total;
            uint256 i;
            do {
                total += item.price;
                ++i;
            } while (i < len);
            if (_expired(_timeline[key])) {
                address ender = LibMulticaller.senderOrSigner();
                uint256 expiredCallerPayout = total / 2; // take half if cast happens late
                _custodied[ender][item.token] += expiredCallerPayout;
                total -= expiredCallerPayout;
                // can be used as reputation
                emit Expired(item.provider, ender, key);
            }
            _custodied[item.provider][item.token] += total;
        }
    }

    function _receiveTokens(address owner, address token, uint256 amount) internal returns (uint256) {
        unchecked {
            if (token == address(0)) {
                if (amount > msg.value) {
                    revert Errors.MissingPayment();
                }
                amount = msg.value;
            } else {
                // because we do not check balanceof delta, we will
                // not correctly attribute tax/reflection tokens
                uint256 before = token.balanceOf(address(this));
                token.safeTransferFrom2(owner, address(this), amount);
                amount = token.balanceOf(address(this)) - before;
            }
            return amount;
        }
    }

    function _attributePushedValue(address owner) internal {
        unchecked {
            if (msg.value > ZERO) {
                _custodied[owner][address(0)] += msg.value;
            }
        }
    }

    function _decrementValue(address account, address token, uint256 desired) internal returns (uint256 delta) {
        unchecked {
            uint256 limit = _custodied[account][token];
            delta = desired > limit ? limit : desired;
            if (delta > ZERO) {
                _custodied[account][token] = limit - delta;
            }
        }
    }

    function balanceOf(address account, address token) external view returns (uint256) {
        return _custodied[account][token];
    }

    function randomness(bytes32 key) external view override returns (Randomness memory) {
        return Randomness({timeline: _timeline[key], seed: _seed[key]});
    }

    function latest(address owner, bool onlySameTx) external view override returns (bytes32 key) {
        key = _NAMESPACE.erc7201Slot().deriveMapping(owner).asBytes32().tload();
        if (key == bytes32(ZERO)) {
            if (onlySameTx) {
                revert Errors.UnableToService();
            }
            key = _latest[owner];
        }
    }

    function consumed(PreimageLocation.Info calldata nfo) external view override returns (bool) {
        return _consumed(nfo);
    }

    function heat(
        uint256 required,
        uint256 expiryOffset,
        address token,
        PreimageLocation.Info[] calldata potentialLocations
    ) external payable override returns (bytes32) {
        unchecked {
            bytes32[] memory locations = new bytes32[](required);
            address account = LibMulticaller.senderOrSigner();
            {
                _attributePushedValue(account);
                if (required == ZERO || required > TWO_FIVE_FIVE || required > potentialLocations.length) {
                    // only 254 len or fewer allowed
                    revert Errors.UnableToService();
                }
                uint256 len = potentialLocations.length;
                uint256 i;
                uint256 contributing;
                uint256 amount;
                do {
                    // non zero means that the value exists
                    if (
                        token == potentialLocations[i].token
                            && _ignite(potentialLocations[i], potentialLocations[i].section())
                    ) {
                        locations[contributing] = potentialLocations[i].hash();
                        amount += potentialLocations[i].price;
                        ++contributing;
                        if (required == contributing) {
                            break;
                        }
                    }
                    ++i;
                } while (i < len);

                if (contributing < required) {
                    // let other contracts revert if they must
                    revert Errors.UnableToService();
                }
                if (amount > ZERO && amount > _decrementValue(account, token, amount)) {
                    revert Errors.MissingPayment();
                }
            }
            {
                bytes32 key = _toId(locations.hash(), locations.length);
                // front load the cost of requesting randomness
                // put it on the shoulders of the consumer
                // this can probably be optimized
                _timeline[key] = _timelineFromInputs({
                    owner: account,
                    expiryOffset: expiryOffset,
                    start: expiryOffset << TWO_FIVE_FIVE == ZERO ? block.number : block.timestamp
                });
                _NAMESPACE.erc7201Slot().deriveMapping(account).asBytes32().tstore(key);
                _latest[account] = key;
                emit Start(account, key);
                return key;
            }
        }
    }

    function _timelineFromInputs(address owner, uint256 expiryOffset, uint256 start) internal pure returns (uint256) {
        return (uint256(uint160(owner)) << NINE_SIX) | (uint256((uint48(start))) << FOUR_EIGHT)
            | (uint256(uint40(expiryOffset)) << EIGHT); // last 8 bits left blank for counting
    }

    /**
     * @param info access the pointer as defined by the preimage location
     * @return pointer the address that holds preimages
     */
    function pointer(PreimageLocation.Info calldata info) external view override returns (address) {
        return _pointers[info.provider][info.token][info.price][info.offset];
    }

    /**
     * provide stored randomness for the future. imagine painting a die with invisible ink
     * @param data the concatenated, immutable preimages to write on chain
     * @dev if data length is > (24576-32), then this method will fail
     * @dev it is best to call this infrequently but to do so with as
     * much calldata as possible to increase gas savings for randomness providers
     */
    function ink(address token, uint256 price, bytes calldata data) external payable {
        unchecked {
            uint256 count = data.length / THREE_TWO;
            if (data.length == ZERO || data.length % THREE_TWO != ZERO) {
                revert Errors.Misconfigured();
            }
            address provider = LibMulticaller.senderOrSigner();
            _attributePushedValue(provider);
            uint256 start = _preimageCount[provider][token][price];
            address pntr = data.write();
            // over an address's lifetime, it can write up to 2^32 preimages
            // currently the count will be limited to 24_576/32=768 per _ink call, but future updates
            // could improve this, so 16 bits are allocated for that situation (up to 65_535)
            _pointers[provider][token][price][start] = pntr;
            _preimageCount[provider][token][price] = start + count;
            emit Ink(provider, (start << ONE_TWO_EIGHT) | (start + count), pntr);
        }
    }

    function chop(bytes32 key, PreimageLocation.Info[] calldata preimageInfo) external payable {
        unchecked {
            address signer = LibMulticaller.senderOrSigner();
            if (signer != address(uint160(_timeline[key] >> NINE_SIX))) {
                revert Errors.SignerMismatch();
            }
            _attributePushedValue(signer);
            if (_seed[key] != bytes32(ZERO)) {
                // don't penalize, because a provider could slip in before
                return;
            }
            uint256 total;
            uint256 i;
            uint256 len = preimageInfo.length;
            do {
                total += preimageInfo[i].price;
                ++i;
            } while (i < len);
            _custodied[signer][preimageInfo[ZERO].token] += total;
            emit Chop(key);
        }
    }

    function cast(bytes32 key, PreimageLocation.Info[] calldata preimageInfo, bytes32[] calldata revealed)
        external
        payable
        returns (bool)
    {
        unchecked {
            if (msg.value > ZERO) {
                _attributePushedValue(LibMulticaller.senderOrSigner());
            }
            return _cast(key, preimageInfo, revealed);
        }
    }

    function _random(bytes32 key, uint256 upper) internal view returns (uint256) {
        return LibPRNG.PRNG({state: uint256(_seed[key])}).uniform(upper);
    }

    function handoff(address token, address recipient, int256 amount) external payable {
        unchecked {
            address account = LibMulticaller.senderOrSigner();
            recipient = recipient == address(0) ? account : recipient;
            if (amount < 0) {
                // move take tokens from signer to recipient custodied by signer
                _custodied[recipient][token] += _receiveTokens(account, token, uint256(-amount));
            } else {
                // move tokens from signer to recipient custodied by contract
                _distribute(token, recipient, _decrementValue(account, token, uint256(amount)));
            }
        }
    }
    /**
     * when a provider no longer has access to appropriate data, he should
     * invalidate the data that he has written so that he does not confuse front ends
     */

    function bleach(PreimageLocation.Info memory info) external payable {
        unchecked {
            address provider = LibMulticaller.senderOrSigner();
            _attributePushedValue(provider);
            if (provider != info.provider) {
                revert Errors.SignerMismatch();
            }
            uint256 size = _pointerSize(info) / THREE_TWO;
            size /= THREE_TWO;
            bytes32 section = info.section();
            emit Bleach(provider, section);
            // consumes a whole pointer
            uint256 i;
            do {
                info.index = i;
                _ignite(info, section);
                ++i;
            } while (i < size);
        }
    }
}
