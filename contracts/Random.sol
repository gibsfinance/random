// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {console} from "hardhat/console.sol";

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
import {ConsumerReceiver} from "./implementations/ConsumerReceiver.sol";

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
    mapping(address account => mapping(address token => uint256 amount))
        internal _custodied;
    mapping(address provider => mapping(uint256 token => mapping(uint256 price => uint256 max)))
        internal _preimageCount;
    mapping(address provider => mapping(uint256 token => mapping(uint256 price => mapping(uint256 offset => address pointer))))
        internal _pointers;
    mapping(address provider => mapping(uint256 token => mapping(uint256 price => mapping(uint256 index => uint256 accessFlags))))
        internal _accessFlags;
    mapping(address provider => mapping(uint256 token => mapping(uint256 price => mapping(uint256 index => bytes32 formerSecret))))
        internal _formerSecret;

    /**
     * start the process to reveal the ink that was written (using invisible ink as a visual analogy)
     * @dev the reason why this method uses flags (256 per slot) is because this allows a
     * central entity to benefit from requesting randomness such as an eip3074 enabled multicaller
     * and benefit greatly from the gas savings of access the same slot up to 256 times
     * @dev notice that the index is derived from the preimage key by adding [95..16] and [15..1] together
     */
    function _ignite(
        PreimageLocation.Info memory info,
        bytes32 section
    ) internal returns (bool) {
        unchecked {
            uint256 encodedToken = info.encodeToken();
            if (_consumed({info: info, encodedToken: encodedToken})) {
                return false;
            }
            _accessFlags[info.provider][encodedToken][info.price][
                (info.offset + info.index) / TWO_FIVE_SIX
            ] |= (ONE << ((info.offset + info.index) % TWO_FIVE_SIX));
            emit Heat({
                provider: info.provider,
                section: section,
                index: info.offset + info.index
            });
            return true;
        }
    }

    /**
     * check if the preimage has been consumed by randomness
     * @param info the location of a preimage
     * @param encodedToken the encoded token information (durationIsTimestamp[0,1),duration[56,95),token[96,255])
     */
    function _consumed(
        PreimageLocation.Info memory info,
        uint256 encodedToken
    ) internal view returns (bool) {
        if (
            _pointerSize({info: info, encodedToken: encodedToken}) /
                THREE_TWO <=
            info.index
        ) {
            revert Errors.Misconfigured();
        }
        // returning zero means that the secret has not been requested yet on chain
        uint256 section = _accessFlags[info.provider][encodedToken][info.price][
            (info.index + info.offset) / TWO_FIVE_SIX
        ];
        return
            ((section <<
                (TWO_FIVE_FIVE -
                    ((info.index + info.offset) % TWO_FIVE_SIX))) >>
                TWO_FIVE_FIVE) == ONE;
    }

    /**
     * gets the number of bytes held by the pointer - a contract generated from preimage bytes
     * @param info the preimage location
     * @dev the index is not used for this so it can be set to 0
     * @param encodedToken the encoded token information (durationIsTimestamp[0,1),duration[56,95),token[96,255])
     */
    function _pointerSize(
        PreimageLocation.Info memory info,
        uint256 encodedToken
    ) internal view returns (uint256 size) {
        address pntr = _pointers[info.provider][encodedToken][info.price][
            info.offset
        ];
        if (pntr == address(0)) {
            revert Errors.Misconfigured();
        }
        assembly {
            size := extcodesize(pntr)
        }
        size -= ONE;
    }

    /**
     * write the secret to storage and emit an event
     * @param info the location of the preimage that is being revealed
     * @param formerSecret the former secret - this value, when run through keccak256 must match the preimage
     * @return location the location hash of the preimage location info - this is used to create the randomness key
     * @return first whether or not this was the first time that _flick was run successfully for this preimage location
     * @dev this method will fail if an invalid info is passed and there is no pointer (storage to check against)
     * @dev this method will fail if the secret does not match the stored preimage
     */
    function _flick(
        PreimageLocation.Info calldata info,
        bytes32 formerSecret
    ) internal returns (bytes32 location, bool first) {
        unchecked {
            uint256 tkn = info.encodeToken();
            address pntr = _pointers[info.provider][tkn][info.price][
                info.offset
            ];
            // console.log(info.provider);
            // console.log(info.durationIsTimestamp);
            // console.log(info.duration);
            // console.log(info.token);
            // console.log(info.price);
            // console.log(info.offset);
            if (pntr == address(0)) {
                revert Errors.Misconfigured();
            }
            // length check is skipped because if one goes out of bounds you either err
            // or you end up with zero bytes, which would be quite the feat to find the hash for
            // always read 32 bytes
            if (
                formerSecret.hash() !=
                bytes32(
                    pntr.read(
                        (info.index * THREE_TWO),
                        ((info.index * THREE_TWO) + THREE_TWO)
                    )
                )
            ) {
                revert Errors.SecretMismatch();
            }
            // only ever set once but do not penalize for lack of coordination
            location = info.location();
            if (_secret(info, tkn) == bytes32(ZERO)) {
                _formerSecret[info.provider][tkn][info.price][
                    info.offset + info.index
                ] = formerSecret;
                _custodied[info.provider][info.token] += info.price;
                emit Reveal({
                    provider: info.provider,
                    location: location,
                    formerSecret: formerSecret
                });
                return (location, true);
            }
            return (location, false);
        }
    }

    enum CastState {
        SCATTERED,
        SEED_SET,
        MISSING_SECRET
    }

    function _secret(
        PreimageLocation.Info calldata info,
        uint256 encodedToken
    ) internal view returns (bytes32) {
        return
            _formerSecret[info.provider][encodedToken][info.price][
                info.offset + info.index
            ];
    }

    function _distribute(
        address recipient,
        address token,
        uint256 amount
    ) internal {
        if (amount == ZERO) return;
        if (token == address(0)) {
            recipient.safeTransferETH(amount);
        } else {
            token.safeTransfer(recipient, amount);
        }
    }

    function _reverseCharges(
        address owner,
        bytes32 key,
        address token,
        uint256 payout
    ) internal {
        _custodied[owner][token] += payout;
        // allow owner to take his ball and go home
        // do not check if the account call was successful
        owner.call(
            abi.encodeWithSelector(
                ConsumerReceiver.onReverse.selector,
                key,
                token,
                payout
            )
        );
    }

    function _receiveTokens(
        address account,
        address token,
        uint256 amount
    ) internal returns (uint256) {
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
                token.safeTransferFrom2(account, address(this), amount);
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

    function _decrementValue(
        address account,
        address token,
        uint256 desired
    ) internal returns (uint256 delta) {
        unchecked {
            uint256 limit = _custodied[account][token];
            delta = desired > limit ? limit : desired;
            if (delta > ZERO) {
                _custodied[account][token] = limit - delta;
            }
        }
    }

    function balanceOf(
        address account,
        address token
    ) external view returns (uint256) {
        return _custodied[account][token];
    }

    function randomness(
        bytes32 key
    ) external view override returns (Randomness memory) {
        unchecked {
            return
                Randomness({
                    owner: address(uint160(_timeline[key] >> NINE_SIX)), // 160 bits
                    start: uint256(uint48(_timeline[key] >> FOUR_EIGHT)), // 48 bits
                    duration: uint256(
                        uint256(uint48(_timeline[key])) >> (EIGHT + ONE)
                    ), // only 39 bits
                    usesTimestamp: (_timeline[key] >> EIGHT) & ONE == ONE, // 1 bit
                    contributed: uint256(uint8(_timeline[key])), // 8 bits
                    timeline: _timeline[key],
                    seed: _seed[key]
                });
        }
    }

    function latest(
        address owner,
        bool onlySameTx
    ) external view override returns (bytes32 key) {
        key = _NAMESPACE.erc7201Slot().deriveMapping(owner).asBytes32().tload();
        if (key == bytes32(ZERO)) {
            if (onlySameTx) {
                revert Errors.UnableToService();
            }
            key = _latest[owner];
        }
    }

    /**
     * check if a preimage at the provided location has been consumed / accessed for randomness
     * @param info preimage location info to locate the preimage
     * @return consumed a boolean to indicate that the location has or has not been consumed
     */
    function consumed(
        PreimageLocation.Info calldata info
    ) external view override returns (bool) {
        return _consumed({info: info, encodedToken: info.encodeToken()});
    }

    /**
     * check for a minimum number of unconsumed preimages. provide a duration in
     * seconds or blocks to consider the randomness set to be valid
     * @param required the minimum number of locations required to be a valid (desired) set
     * @param durationIsTimestamp whether or not to use timestamp (true) or block number (false)
     * @param duration the duration from start time or start block that the
     * contract should consider the randomness to be valid
     * @notice if this param is lower than any location, then the contract will err
     * @param potentialLocations the locations to check for unconsumed preimages
     * @dev note that the contract stores the latest key for each owner in transient storage
     * this allows for many other chained games to use the same randomness seeds and have guarantees
     * that no secrets have been exposed before the initiating transaction has been mined
     */
    function heat(
        uint256 required,
        bool durationIsTimestamp,
        uint256 duration,
        PreimageLocation.Info[] calldata potentialLocations
    ) external payable override returns (bytes32) {
        unchecked {
            bytes32[] memory locations = new bytes32[](required);
            address account = LibMulticaller.senderOrSigner();
            {
                _attributePushedValue({owner: account});
                if (
                    required == ZERO ||
                    required > TWO_FIVE_FIVE ||
                    required > potentialLocations.length
                ) {
                    // only 255 len or fewer allowed
                    revert Errors.UnableToService();
                }
                if ((uint256(uint40(duration << ONE)) >> ONE) != duration) {
                    revert Errors.Misconfigured();
                }
                uint256 len = potentialLocations.length;
                uint256 i;
                uint256 contributing;
                uint256 amount;
                bytes32 section;
                address token = potentialLocations[ZERO].token;
                PreimageLocation.Info calldata target;
                do {
                    target = potentialLocations[i];
                    // non zero means that the value exists
                    if (token != target.token) {
                        revert Errors.Misconfigured();
                    }
                    if (target.durationIsTimestamp != durationIsTimestamp) {
                        revert Errors.Misconfigured();
                    }
                    // target.minDuration > duration
                    if (target.duration > duration) {
                        revert Errors.Misconfigured();
                    }
                    section = target.section();
                    if (_ignite({info: target, section: section})) {
                        locations[contributing] = section.hash(
                            bytes32(target.index)
                        );
                        amount += target.price;
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
                if (
                    amount > ZERO &&
                    amount >
                    _decrementValue({
                        account: account,
                        token: token,
                        desired: amount
                    })
                ) {
                    revert Errors.MissingPayment();
                }
            }
            {
                bytes32 key = locations.hash();
                // front load the cost of requesting randomness
                // put it on the shoulders of the consumer
                // this can probably be optimized
                _timeline[key] = _timelineFromInputs({
                    owner: account,
                    // we already checked expiry offset above is constrained to 39 bits
                    expiryOffset: (duration << ONE) |
                        (durationIsTimestamp ? ONE : ZERO),
                    start: durationIsTimestamp ? block.timestamp : block.number
                });
                _NAMESPACE
                    .erc7201Slot()
                    .deriveMapping(account)
                    .asBytes32()
                    .tstore(key);
                _latest[account] = key;
                emit Start(account, key);
                return key;
            }
        }
    }

    /**
     * encodes a timeline that will only change the last 8 bits as secrets are revealed
     * @param owner the owner of the randomness - the address that will be refunded if not all secrets are provided in a timely manner
     * @param expiryOffset the expiration offset from the time that the randomness was first requested
     * @param start the start time or block number
     * @return timeline an encoded number with relevant owner, and timing data
     */
    function _timelineFromInputs(
        address owner,
        uint256 expiryOffset,
        uint256 start
    ) internal pure returns (uint256) {
        return
            (uint256(uint160(owner)) << NINE_SIX) |
            (uint256((uint48(start))) << FOUR_EIGHT) |
            (uint256(uint40(expiryOffset)) << EIGHT); // last 8 bits left blank for counting as secrets are revealed
    }

    /**
     * @param info access the pointer as defined by the preimage location
     * @return pointer the address that holds preimages
     */
    function pointer(
        PreimageLocation.Info calldata info
    ) external view override returns (address) {
        return
            _pointers[info.provider][info.encodeToken()][info.price][
                info.offset
            ];
    }

    /**
     * advertise immutable randomness preimages for future revelation. imagine painting a die with invisible ink
     * @param data the concatenated, immutable preimages to write on chain
     * @dev if data length is > (24576-32), then this method will fail
     * @dev if data is not evenly divisible by 32, then this method will fail
     * @dev it is best to call this infrequently but to do so with as
     * much calldata as possible to increase gas savings for randomness providers
     */
    function ink(
        PreimageLocation.Info memory info,
        bytes calldata data
    ) external payable {
        unchecked {
            uint256 count = data.length / THREE_TWO;
            if (data.length == ZERO || data.length % THREE_TWO != ZERO) {
                revert Errors.Misconfigured();
            }
            // access control regulated by the sender/signer
            address provider = LibMulticaller.senderOrSigner();
            _attributePushedValue({owner: provider});
            uint256 limit = _custodied[provider][info.token];
            uint256 toStake = count * info.price;
            if (limit < toStake) {
                revert Errors.MissingPayment();
            }
            // at this point, the only address that can unlock this value
            // is one that has access to the secrets or pays for randomness and does not get it in a timely manner
            _custodied[provider][info.token] -= toStake;
            // owner of the newly created randomness set by calldata
            address owner = info.provider;
            if (owner == address(0)) {
                revert Errors.UnableToService();
            }
            uint256 tkn = info.encodeToken();
            uint256 start = _preimageCount[owner][tkn][info.price];
            address pntr = data.write(); // deploy a contract with immutable preimages written into it
            _pointers[owner][tkn][info.price][start] = pntr;
            _preimageCount[owner][tkn][info.price] = start + count;
            // console.log(info.provider);
            // console.log(info.durationIsTimestamp);
            // console.log(info.duration);
            // console.log(info.token);
            // console.log(info.price);
            // console.log(info.offset);
            emit Ink({
                provider: owner,
                offset: (start << ONE_TWO_EIGHT) | (start + count),
                pointer: pntr
            });
        }
    }

    /**
     * refund an owner of randomness for any secrets that are not written on chain.
     * the amount refunded is equal to the amount of tokens for each preimage that was not revealed.
     * @dev this method will fail if the timeline has not yet expired. because the duration must be >= to the
     * location defined by each provider, implicit consent and declaration has been provided by each provider
     * that they will have their randomness on chain by the time this method can be executed
     * @param key the key of the randomness that did not have all of its secrets revealed
     * @param info the set of locations of the randomness that was requested
     */
    function chop(
        bytes32 key,
        PreimageLocation.Info[] calldata info
    ) external payable {
        unchecked {
            if (msg.value > ZERO) {
                _attributePushedValue({owner: LibMulticaller.senderOrSigner()});
            }
            if (_seed[key] != bytes32(ZERO)) {
                // don't penalize, because a provider could slip in before
                return;
            }
            if (!_expired({timeline: _timeline[key]})) {
                revert Errors.UnableToService();
            }
            uint256 remaining;
            uint256 i;
            uint256 len = info.length;
            bytes32[] memory locations = new bytes32[](len);
            do {
                if (
                    _secret({
                        info: info[i],
                        encodedToken: info[i].encodeToken()
                    }) == bytes32(ZERO)
                ) {
                    remaining += info[i].price;
                }
                locations[i] = info[i].location();
                ++i;
            } while (i < len);
            if (locations.hash() != key) {
                revert Errors.NotInCohort();
            }
            // for any secrets that do not reach the chain, the payment
            // AND the staked amount is released to the owner
            _reverseCharges({
                owner: address(uint160(_timeline[key] >> NINE_SIX)),
                key: key,
                token: info[ZERO].token,
                payout: 2 * remaining
            });
            emit Chop({key: key});
        }
    }

    function cast(
        bytes32 key,
        PreimageLocation.Info[] calldata info,
        bytes32[] memory revealed
    ) external payable returns (CastState) {
        unchecked {
            if (msg.value > ZERO) {
                _attributePushedValue(LibMulticaller.senderOrSigner());
            }
            uint256 len = info.length;
            uint256 i;
            bytes32 seed = _seed[key];
            uint256 total;
            {
                if (seed != bytes32(ZERO)) {
                    return CastState.SEED_SET;
                }
                bytes32[] memory locations = new bytes32[](len);
                uint256 firstFlicks;
                bool first;
                bool missing;
                do {
                    if (revealed[i] != bytes32(ZERO)) {
                        (locations[i], first) = _flick({
                            info: info[i],
                            formerSecret: revealed[i]
                        });
                        if (first) {
                            ++firstFlicks;
                        }
                    } else {
                        revealed[i] = _secret({
                            info: info[i],
                            encodedToken: info[i].encodeToken()
                        });
                        if (revealed[i] == bytes32(ZERO)) {
                            missing = true;
                        } else {
                            locations[i] = info[i].location();
                        }
                    }
                    total += info[i].price;
                    ++i;
                } while (i < len);
                // this allows users to submit partial secret sets and unlock their staked tokens
                // without risking omission attacks from late or downed actors
                if (missing) {
                    _timeline[key] += firstFlicks;
                    return CastState.MISSING_SECRET;
                }
                if (key != locations.hash()) {
                    revert Errors.NotInCohort();
                }
                // mark as generated
                seed = revealed.hash();
                _seed[key] = seed;
                emit Cast({key: key, seed: seed});
            }
            {
                // until the seed is properly formed, no one validator
                // knows which one of them is going to get the bonus
                // only the last validator to reveal their secret has an edge in that they can choose to
                // omit their secret, they will however, forfeit their staked tokens to whoever calls chop
                PreimageLocation.Info calldata item = info[
                    _random({key: seed, upper: len})
                ];
                if (_expired({timeline: _timeline[key]})) {
                    // if secrets are submitted late, then the owner gets half of their payment back
                    uint256 payout = total / 2;
                    total -= payout;
                    _reverseCharges({
                        owner: address(uint160(_timeline[key] >> NINE_SIX)),
                        key: key,
                        token: item.token,
                        payout: payout
                    });
                    // can be used as reputation
                    emit Expired({key: key});
                }
                _custodied[item.provider][item.token] += total;
            }
            return CastState.SCATTERED;
        }
    }

    function _random(
        bytes32 key,
        uint256 upper
    ) internal view returns (uint256) {
        return LibPRNG.PRNG({state: uint256(_seed[key])}).uniform(upper);
    }

    function handoff(
        address recipient,
        address token,
        int256 amount
    ) external payable {
        unchecked {
            address account = LibMulticaller.senderOrSigner();
            recipient = recipient == address(0) ? account : recipient;
            if (amount < 0) {
                // move take tokens from signer to recipient custodied by signer
                _custodied[recipient][token] += _receiveTokens(
                    account,
                    token,
                    uint256(-amount)
                );
            } else {
                // move tokens from signer to recipient custodied by contract
                _distribute(
                    recipient,
                    token,
                    _decrementValue(account, token, uint256(amount))
                );
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
            _attributePushedValue({owner: provider});
            if (provider != info.provider) {
                revert Errors.SignerMismatch();
            }
            uint256 size = _pointerSize({
                info: info,
                encodedToken: info.encodeToken()
            }) / THREE_TWO;
            size /= THREE_TWO;
            bytes32 section = info.section();
            emit Bleach(provider, section);
            // consumes a whole pointer
            uint256 i;
            uint256 amount;
            do {
                info.index = i;
                if (_ignite(info, section)) {
                    // attribute tokens back to provider
                    amount += info.price;
                }
                ++i;
            } while (i < size);
            if (amount > ZERO) {
                _custodied[provider][info.token] += amount;
            }
        }
    }
}
