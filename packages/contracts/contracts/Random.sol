// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SSTORE2} from "solady/src/utils/SSTORE2.sol";
import {LibPRNG} from "solady/src/utils/LibPRNG.sol";
import {LibBitmap} from "solady/src/utils/LibBitmap.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {EfficientHashLib} from "solady/src/utils/EfficientHashLib.sol";
import {LibMulticaller} from "multicaller/src/LibMulticaller.sol";
import {IRandom} from "./implementations/IRandom.sol";
import {PreimageLocation} from "./PreimageLocation.sol";
import {Errors, Cast, Reveal, Link, Ink, Heat, Start, Expired, Chop, Bleach} from "./Constants.sol";
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

    using LibBitmap for LibBitmap.Bitmap;

    string private constant _NAMESPACE = "random";

    mapping(address account => bytes32 latest) internal _latest;
    mapping(address account => mapping(address token => uint256 amount)) internal _custodied;
    mapping(address provider => mapping(uint256 token => mapping(uint256 price => uint256 max))) internal _preimageCount;
    mapping(
        address provider
            => mapping(uint256 token => mapping(uint256 price => mapping(uint256 offset => address pointer)))
    ) internal _pointers;
    mapping(address provider => mapping(uint256 token => mapping(uint256 price => LibBitmap.Bitmap bitmap))) internal
        _accessFlags;
    mapping(
        address provider
            => mapping(uint256 token => mapping(uint256 price => mapping(uint256 index => bytes32 formerSecret)))
    ) internal _linkedSecret;
    mapping(
        address provider
            => mapping(uint256 token => mapping(uint256 price => mapping(uint256 index => bytes32 formerSecret)))
    ) internal _revealedSecret;
    mapping(bytes32 key => bool chopped) internal _chopped;
    mapping(address account => mapping(bytes32 txHash => bytes32 latest)) internal _latestInTx;

    /**
     * start the process to reveal the ink that was written (using invisible ink as a visual analogy)
     * @dev the reason why this method uses flags (256 per slot) is because this allows a
     * central entity to benefit from requesting randomness such as an eip3074 enabled multicaller
     * and benefit greatly from the gas savings of access the same slot up to 256 times
     * @dev notice that the index is derived from the preimage key by adding [95..16] and [15..1] together
     */
    function _ignite(PreimageLocation.Info memory info, bytes32 section) internal returns (bool) {
        unchecked {
            uint256 encodedToken = info.encodeToken();
            if (_consumed({info: info, encodedToken: encodedToken})) {
                return false;
            }
            _accessFlags[info.provider][encodedToken][info.price].set(info.offset + info.index);
            emit Heat({provider: info.provider, section: section, index: info.offset + info.index});
            return true;
        }
    }

    /**
     * check if the preimage has been consumed by randomness
     * @param info the location of a preimage
     * @param encodedToken the encoded token information (durationIsTimestamp[0,1),duration[56,95),token[96,255])
     */
    function _consumed(PreimageLocation.Info memory info, uint256 encodedToken) internal view returns (bool) {
        if (_pointerSize({info: info, encodedToken: encodedToken}) / THREE_TWO <= info.index) {
            revert Errors.Misconfigured();
        }
        // returning zero means that the secret has not been requested yet on chain
        return _accessFlags[info.provider][encodedToken][info.price].get(info.offset + info.index);
    }

    /**
     * gets the number of bytes held by the pointer - a contract generated from preimage bytes
     * @param info the preimage location
     * @dev the index is not used for this so it can be set to 0
     * @param encodedToken the encoded token information (durationIsTimestamp[0,1),duration[56,95),token[96,255])
     */
    function _pointerSize(PreimageLocation.Info memory info, uint256 encodedToken)
        internal
        view
        returns (uint256 size)
    {
        address pntr = _pointers[info.provider][encodedToken][info.price][info.offset];
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
    function _flick(PreimageLocation.Info calldata info, bytes32 formerSecret)
        internal
        returns (bytes32 location, bool first)
    {
        unchecked {
            // length check is skipped because if one goes out of bounds you either err
            // or you end up with zero bytes, which would be quite the feat to find the hash for
            // always read 32 bytes
            if (formerSecret.hash() != _toPreimage(info)) {
                revert Errors.SecretMismatch();
            }
            uint256 tkn = info.encodeToken();
            // only ever set once but do not penalize for lack of coordination
            location = info.location();
            (bytes32 linkedSecret,) = _secret(info, tkn);
            if (linkedSecret == bytes32(ZERO)) {
                _linkedSecret[info.provider][tkn][info.price][info.offset + info.index] = formerSecret;
                // gives provider access to staked tokens
                _custodied[info.provider][info.token] += info.price;
                emit Link({provider: info.provider, location: location, formerSecret: formerSecret});
                return (location, true);
            }
            return (location, false);
        }
    }

    function _toPreimage(PreimageLocation.Info calldata info) internal view returns (bytes32) {
        uint256 tkn = info.encodeToken();
        address pntr = _pointers[info.provider][tkn][info.price][info.offset];
        if (pntr == address(0)) {
            revert Errors.Misconfigured();
        }
        // length check is skipped because if one goes out of bounds you either err
        // or you end up with zero bytes, which would be quite the feat to find the hash for
        // always read 32 bytes
        return bytes32(pntr.read((info.index * THREE_TWO), ((info.index * THREE_TWO) + THREE_TWO)));
    }

    function reveal(PreimageLocation.Info calldata info, bytes32 formerSecret) external payable {
        if (_toPreimage(info) == keccak256(abi.encode(formerSecret))) {
            // this event is the same one used during cast
            // but it should not be used as a signal that the randomness has been cast
            // only the cast event should be used for that
            _revealedSecret[info.provider][info.encodeToken()][info.price][info.offset + info.index] = formerSecret;
            emit Reveal({provider: info.provider, location: info.location(), formerSecret: formerSecret});
        }
    }

    enum CastState {
        SCATTERED,
        SEED_SET,
        MISSING_SECRET
    }

    /**
     * accesses the stored secret
     * @param info the info to access the location
     * @param encodedToken encoded token info
     */
    function _secret(PreimageLocation.Info calldata info, uint256 encodedToken)
        internal
        view
        returns (bytes32 linkedSecret, bytes32 revealedSecret)
    {
        linkedSecret = _linkedSecret[info.provider][encodedToken][info.price][info.offset + info.index];
        if (linkedSecret == bytes32(ZERO)) {
            revealedSecret = _revealedSecret[info.provider][encodedToken][info.price][info.offset + info.index];
        } else {
            revealedSecret = linkedSecret;
        }
    }

    /**
     * distribute tokens to a recipient
     * @param recipient the recipient of the tokens
     * @param token the token to send
     * @param amount the number of tokens
     */
    function _distribute(address recipient, address token, uint256 amount) internal {
        if (amount == ZERO) return;
        if (token == address(0)) {
            recipient.safeTransferETH(amount);
        } else {
            token.safeTransfer(recipient, amount);
        }
    }

    /**
     * reverse previous charges toward the owner. owner can end up with up to 2x the amount they put in and
     * will have to handle distributing tokens according to their own policy
     * @param owner owner of the randomness that is having its charges reversed
     * @param key the randomness key
     * @param token the token being reversed
     * @param payout the amount of the token being reversed
     */
    function _reverseCharges(address owner, bytes32 key, address token, uint256 payout) internal {
        _custodied[owner][token] += payout;
        // allow owner to take his ball and go home
        // do not check if the account call was successful
        owner.call(abi.encodeWithSelector(ConsumerReceiver.onReverse.selector, key, token, payout));
    }

    /**
     * receive a number of tokens and attribute them to an account
     * @param account the account to attribute tokens to
     * @param token the tokens being received
     * @param amount the number of tokens being received
     */
    function _receiveTokens(address account, address token, uint256 amount) internal returns (uint256) {
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

    /**
     * decrement a desired amount from the provided account's token balance
     * @param account the address to decrement against
     * @param token the token balance to decrement
     * @param desired the desired decrementation
     * @return delta may be less than the desired. note that the amount
     * actually decremented may be less than the desired input
     */
    function _decrementTokenAmount(address account, address token, uint256 desired) internal returns (uint256 delta) {
        unchecked {
            uint256 limit = _custodied[account][token];
            delta = desired > limit ? limit : desired;
            if (delta > ZERO) {
                _custodied[account][token] = limit - delta;
            }
        }
    }

    /**
     * get a account's token balance - the number of tokens that can be used
     * to perform certain actions such as inking or heating
     * @param account the account in question
     * @param token the token balance being queried
     */
    function balanceOf(address account, address token) external view returns (uint256) {
        return _custodied[account][token];
    }

    /**
     * access the timeline, owner, duration, contribution count and seed if it exists
     * the number of locations that recreates the final hash is equivalent the number of required seed contributions
     * @param key the randomness key
     */
    function randomness(bytes32 key) external view override returns (Randomness memory) {
        unchecked {
            return Randomness({
                owner: address(uint160(_timeline[key] >> NINE_SIX)), // 160 bits
                start: uint256(uint48(_timeline[key] >> FOUR_EIGHT)), // 48 bits
                duration: uint256(uint256(uint48(_timeline[key])) >> (EIGHT + ONE)), // only 39 bits
                usesTimestamp: (_timeline[key] >> EIGHT) & ONE == ONE, // 1 bit
                contributed: uint256(uint8(_timeline[key])), // 8 bits
                timeline: _timeline[key],
                seed: _seed[key]
            });
        }
    }

    /**
     * get the latest key generated by a provided address. restrict to same transaction if desired
     * @param owner the address that requested randomness
     * @param onlySameTx whether or not to only consider randomness that has been requested within this transaction
     * utilizes transient storage and provides certain guarantees regarding the relationship between randomness
     * and the its utility to outsiders depending on how the transaction was executed
     */
    function latest(address owner, bool onlySameTx) external view override returns (bytes32 key) {
        // key = _NAMESPACE.erc7201Slot().deriveMapping(owner).asBytes32().tload();
        key = _latestInTx[owner][_txHash()];
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
    function consumed(PreimageLocation.Info calldata info) external view override returns (bool) {
        return _consumed({info: info, encodedToken: info.encodeToken()});
    }

    /**
     * check for a minimum number of unconsumed preimages. provide a duration in
     * seconds or blocks to consider the randomness set to be valid
     * @param required the minimum number of locations required to be a valid (desired) set
     * @param settings the settings required to setup the randomness campaign
     * @notice if the duration in the settings is lower than any location or the
     * duration is timestamp does not match, then the contract will err
     * @param potentialLocations the locations to check for unconsumed preimages
     * @dev note that the contract stores the latest key for each owner in transient storage
     * this allows for many other chained games to use the same randomness seeds and have guarantees
     * that no secrets have been exposed before the initiating transaction has been mined
     */
    function heat(
        uint256 required,
        PreimageLocation.Info calldata settings,
        PreimageLocation.Info[] calldata potentialLocations
    ) external payable override returns (bytes32) {
        unchecked {
            bytes32[] memory locations = new bytes32[](required);
            address account = LibMulticaller.senderOrSigner();
            {
                if (msg.value > ZERO) {
                    _custodied[account][address(0)] += msg.value;
                }
                if (settings.provider == address(0)) {
                    revert Errors.UnableToService();
                }
                if (required == ZERO || required > TWO_FIVE_FIVE || required > potentialLocations.length) {
                    // only 255 len or fewer allowed
                    revert Errors.UnableToService();
                }
                if ((uint256(uint40(settings.duration << ONE)) >> ONE) != settings.duration) {
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
                    if (target.durationIsTimestamp != settings.durationIsTimestamp) {
                        revert Errors.Misconfigured();
                    }
                    // target.minDuration > duration
                    if (target.duration > settings.duration) {
                        revert Errors.Misconfigured();
                    }
                    section = target.section();
                    if (_ignite({info: target, section: section})) {
                        locations[contributing] = section.hash(bytes32(target.index));
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
                if (amount > ZERO && amount > _decrementTokenAmount({account: account, token: token, desired: amount}))
                {
                    revert Errors.MissingPayment();
                }
            }
            {
                bytes32 key = locations.hash();
                // front load the cost of requesting randomness
                // put it on the shoulders of the consumer
                // this can probably be optimized
                _timeline[key] = _timelineFromInputs({
                    owner: settings.provider,
                    // we already checked expiry offset above is constrained to 39 bits
                    expiryOffset: (settings.duration << ONE) | (settings.durationIsTimestamp ? ONE : ZERO),
                    start: settings.durationIsTimestamp ? block.timestamp : block.number
                });
                _storeLatest({provider: settings.provider, key: key});
                emit Start({owner: settings.provider, key: key});
                return key;
            }
        }
    }

    function _storeLatest(address provider, bytes32 key) internal {
        // _NAMESPACE
        //     .erc7201Slot()
        //     .deriveMapping(settings.provider)
        //     .asBytes32()
        //     .store(key);
        // this mode is insufficient for randomness due to block builders
        // being able to name their own transaction order
        _latestInTx[provider][_txHash()] = key;
        _latest[provider] = key;
    }

    function _txHash() internal view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                block.coinbase,
                block.basefee,
                block.chainid,
                block.timestamp,
                block.number,
                blockhash(block.number),
                tx.origin,
                tx.gasprice
            )
        );
    }

    /**
     * encodes a timeline that will only change the last 8 bits as secrets are revealed
     * @param owner the owner of the randomness - the address that will be refunded if not all secrets are provided in a timely manner
     * @param expiryOffset the expiration offset from the time that the randomness was first requested
     * @param start the start time or block number
     * @return timeline an encoded number with relevant owner, and timing data
     */
    function _timelineFromInputs(address owner, uint256 expiryOffset, uint256 start) internal pure returns (uint256) {
        return (uint256(uint160(owner)) << NINE_SIX) | (uint256((uint48(start))) << FOUR_EIGHT)
            | (uint256(uint40(expiryOffset)) << EIGHT); // last 8 bits left blank for counting as secrets are revealed
    }

    /**
     * retrieve the pointer or address that holds the series of preimages for a tranche of secrets
     * @param info access the pointer as defined by the preimage location
     * @return pointer the address that holds preimages
     */
    function pointer(PreimageLocation.Info calldata info) external view override returns (address) {
        return _pointers[info.provider][info.encodeToken()][info.price][info.offset];
    }

    /**
     * advertise immutable randomness preimages for future revelation. imagine painting a die with invisible ink
     * @param data the concatenated, immutable preimages to write on chain
     * @dev if data length is > (24576-32), then this method will fail
     * @dev if data is not evenly divisible by 32, then this method will fail
     * @dev it is best to call this infrequently but to do so with as
     * much calldata as possible to increase gas savings for randomness providers
     */
    function ink(PreimageLocation.Info memory info, bytes calldata data) external payable {
        unchecked {
            uint256 count = data.length / THREE_TWO;
            if (data.length == ZERO || data.length % THREE_TWO != ZERO) {
                revert Errors.Misconfigured();
            }
            // access control regulated by the sender/signer
            address account = LibMulticaller.senderOrSigner();
            if (msg.value > ZERO) {
                _custodied[account][address(0)] += msg.value;
            }
            uint256 limit = _custodied[account][info.token];
            uint256 toStake = count * info.price;
            if (limit < toStake) {
                revert Errors.MissingPayment();
            }
            // at this point, the only address that can unlock this value
            // is one that has access to the secrets or pays for randomness and does not get it in a timely manner
            _custodied[account][info.token] -= toStake;
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
            info.provider = owner;
            info.offset = start;
            emit Ink({
                sender: account,
                provider: owner,
                section: info.section(),
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
    function chop(bytes32 key, PreimageLocation.Info[] calldata info) external payable {
        unchecked {
            if (msg.value > ZERO) {
                _custodied[LibMulticaller.senderOrSigner()][address(0)] += msg.value;
            }
            if (_seed[key] != bytes32(ZERO)) {
                // don't penalize, because a provider could slip in before
                return;
            }
            if (!_expired({timeline: _timeline[key]})) {
                revert Errors.UnableToService();
            }
            if (_chopped[key]) {
                revert Errors.UnableToService();
            }
            uint256 remaining;
            uint256 original;
            uint256 i;
            uint256 len = info.length;
            bytes32[] memory locations = new bytes32[](len);
            bytes32 revealedSecret;
            do {
                (, revealedSecret) = _secret({info: info[i], encodedToken: info[i].encodeToken()});
                if (revealedSecret == bytes32(ZERO)) {
                    // take the provider's stake
                    remaining += info[i].price;
                }
                original += info[i].price;
                locations[i] = info[i].location();
                ++i;
            } while (i < len);
            if (locations.hash() != key) {
                revert Errors.NotInCohort();
            }
            // for any secrets that do not reach the chain, the payment
            // AND the staked amount is released to the owner
            _chopped[key] = true;
            _reverseCharges({
                owner: address(uint160(_timeline[key] >> NINE_SIX)),
                key: key,
                token: info[ZERO].token,
                payout: remaining + original
            });
            emit Chop({key: key});
        }
    }

    /**
     * write a randomness request's secrets into storage
     * @param key the randomness key. provided info param must be hashed to recreate this key
     * @param info the raw location info of preimages
     * @param revealed the list of secrets that must match the written preimages
     */
    function cast(bytes32 key, PreimageLocation.Info[] calldata info, bytes32[] memory revealed)
        external
        payable
        returns (CastState)
    {
        unchecked {
            if (msg.value > ZERO) {
                _custodied[LibMulticaller.senderOrSigner()][address(0)] += msg.value;
            }
            bytes32 seed = _seed[key];
            if (seed != bytes32(ZERO)) {
                return CastState.SEED_SET;
            }
            if (_chopped[key]) {
                revert Errors.UnableToService();
            }
            uint256 len = info.length;
            uint256 i;
            uint256 total;
            {
                bytes32[] memory locations = new bytes32[](len);
                uint256 firstFlicks;
                bool first;
                bool missing;
                bytes32 linkedSecret;
                do {
                    if (revealed[i] != bytes32(ZERO)) {
                        (locations[i], first) = _flick({info: info[i], formerSecret: revealed[i]});
                        if (first) {
                            ++firstFlicks;
                        }
                    } else {
                        (revealed[i], linkedSecret) = _secret({info: info[i], encodedToken: info[i].encodeToken()});
                        if (revealed[i] == bytes32(ZERO)) {
                            if (linkedSecret == bytes32(ZERO)) {
                                missing = true;
                                locations[i] = info[i].location();
                            } else {
                                (locations[i], first) = _flick({info: info[i], formerSecret: linkedSecret});
                                revealed[i] = linkedSecret;
                                if (first) {
                                    ++firstFlicks;
                                }
                            }
                        } else {
                            locations[i] = info[i].location();
                        }
                    }
                    total += info[i].price;
                    ++i;
                } while (i < len);
                if (key != locations.hash()) {
                    revert Errors.NotInCohort();
                }
                // this allows users to submit partial secret sets and unlock their staked tokens
                // without risking omission attacks from late or downed actors
                _timeline[key] += firstFlicks;
                if (missing) {
                    return CastState.MISSING_SECRET;
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
                PreimageLocation.Info calldata item = info[_random({key: seed, upper: len})];
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

    /**
     * retrieve a random number between 0 and the upper limit (exclusive)
     * @param key the randomness key
     * @param upper the upper limit of the uniform range
     */
    function _random(bytes32 key, uint256 upper) internal view returns (uint256) {
        return LibPRNG.PRNG({state: uint256(_seed[key])}).uniform(upper);
    }

    /**
     * hand off tokens between an address (caller) or optional recipient and this contract
     * @param recipient the recipient of tokens - either the account in this contract or an address outside of this contract
     * @param token the token address to transfer - use zero address for native tokens
     * @param amount a number of tokens to transfer
     */
    function handoff(address recipient, address token, int256 amount) external payable {
        unchecked {
            address account = LibMulticaller.senderOrSigner();
            recipient = recipient == address(0) ? account : recipient;
            if (amount < 0) {
                // move take tokens from signer to recipient custodied by signer
                _custodied[recipient][token] += _receiveTokens(account, token, uint256(-amount));
            } else {
                // move tokens from signer to recipient custodied by contract
                _distribute(recipient, token, _decrementTokenAmount(account, token, uint256(amount)));
            }
        }
    }

    /**
     * when a provider no longer has access to appropriate data, he should
     * invalidate the data that he has written so that he does not confuse front ends
     * @param info the unhashed section to bleach
     * @dev calling this method means that all preimages will be invalidated. it will be costly
     */
    function bleach(PreimageLocation.Info memory info) external payable {
        unchecked {
            address provider = LibMulticaller.senderOrSigner();
            if (msg.value > ZERO) {
                _custodied[provider][address(0)] += msg.value;
            }
            if (provider != info.provider) {
                revert Errors.SignerMismatch();
            }
            uint256 encodedToken = info.encodeToken();
            uint256 size = _pointerSize({info: info, encodedToken: encodedToken}) / THREE_TWO;
            bytes32 section = info.section();
            // consumes a whole pointer
            uint256 amount;
            uint256 start = info.offset;
            uint256 end = start + size; // exclusive end
            uint256 mask;
            uint256 len;
            uint256 f;
            uint256 i;
            LibBitmap.Bitmap storage bitmap = _accessFlags[info.provider][encodedToken][info.price];
            uint256 flags;
            uint256 targetedFlags;
            uint256 max = type(uint256).max;
            do {
                if (len == ZERO) {
                    len = TWO_FIVE_SIX - (start % TWO_FIVE_SIX);
                }
                if (start + len > end) {
                    len = end - start;
                }
                mask = (max >> (TWO_FIVE_SIX - len)); // at root (all f's to the right)
                flags = bitmap.map[start / TWO_FIVE_SIX];
                targetedFlags = ((flags << (TWO_FIVE_SIX - (start + len))) >> (TWO_FIVE_SIX - len)); // at root (all bits to the right)
                if (targetedFlags < mask) {
                    bitmap.setBatch(start, len);
                    i = start % TWO_FIVE_SIX;
                    f = i + len;
                    do {
                        if (((flags >> i) & ONE) == ZERO) {
                            amount += info.price;
                        }
                        ++i;
                    } while (i < f);
                }
                start += len;
                len = TWO_FIVE_SIX;
            } while (start < end);
            if (amount > ZERO) {
                emit Bleach({provider: provider, section: section});
                // assume that amount is > 0 otherwise there is not economic reason to run this fn
                // therefore writing the sstore is always going to have a non zero delta
                _custodied[provider][info.token] += amount;
            }
        }
    }
}
