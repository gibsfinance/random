// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {ConsumerReceiver} from "./implementations/ConsumerReceiver.sol";
import {PreimageLocation} from "./PreimageLocation.sol";

/// @notice Minimal view of core Random needed to drive the ink->heat lifecycle. The shipped
/// IRandom abstract contract exposes `heat` but not `ink`, so we declare both here with the
/// exact signatures verified against contracts/Random.sol.
interface IRandomInkHeat {
    function ink(PreimageLocation.Info memory info, bytes calldata data) external payable;

    function heat(
        uint256 required,
        PreimageLocation.Info calldata settings,
        PreimageLocation.Info[] calldata potentialLocations,
        bool useTSTORE
    ) external payable returns (bytes32);
}

/// @notice Two-person coin flip. Players escrow a stake and a side; opposite-side
/// equal-stake entrants are matched first-in-first-out, the matched pair's randomness is
/// driven through core Random, and the seed's parity decides the winner of the escrowed pot.
contract CoinFlip is ConsumerReceiver {
    using SafeTransferLib for address;

    error WrongSide();
    error ZeroStake();
    error StakeMismatch();
    error NotEntrant();
    error AlreadyResolved();
    error TooEarly();
    error OnlyRandom();

    event Entered(uint256 indexed id, address indexed player, uint8 side, uint256 stake);
    event Cancelled(uint256 indexed id);
    event Paired(bytes32 indexed flipId, address heads, address tails, uint256 stake);

    enum Status { None, Pending, Settled, Refunded }

    struct Flip {
        address heads;
        address tails;
        uint256 stake;
        bytes32 preimageHeads;
        bytes32 preimageTails;
        bytes32 key;
        uint256 pairedAtBlock;
        Status status;
    }

    uint8 internal constant HEADS = 0;
    uint8 internal constant TAILS = 1;
    uint256 public constant STALE_BLOCKS = 200;

    /// @notice The publicly-known walk-away secret. A player who does not want to manage a
    /// secret commits WALK_AWAY_PREIMAGE; because the secret is public and NON-ZERO, any
    /// validator can reveal it to finalize the flip on the player's behalf. It must be
    /// non-zero: core Random.cast treats a revealed bytes32(0) as "not supplied"
    /// (MISSING_SECRET) and never finalizes the seed. (Verified by the Task 1 spike.)
    bytes32 public constant WALK_AWAY_SECRET = bytes32(uint256(1));
    /// @dev keccak256 of the 32-byte big-endian encoding of uint256(1)
    bytes32 public constant WALK_AWAY_PREIMAGE =
        keccak256(hex"0000000000000000000000000000000000000000000000000000000000000001");

    address public immutable random;

    uint256 public nextEntrant;

    struct Entry {
        address player;
        uint8 side;
        uint256 stake;
        bytes32 preimage;
        uint256 enteredAtBlock;
        bool active;
    }

    mapping(uint256 id => Entry entry) public entries;

    // stake => side => first-in-first-out queue of entry ids, with a moving head index
    mapping(uint256 stake => mapping(uint8 side => uint256[] ids)) internal _queue;
    mapping(uint256 stake => mapping(uint8 side => uint256 head)) internal _queueHead;

    mapping(bytes32 flipId => Flip flip) public flips;
    uint256 internal _flipNonce;

    /// @notice Reverse index from a Random request key to the flip it settles, so the onCast
    /// callback (Task 5) can find the flip when core Random reports the finalized seed.
    mapping(bytes32 key => bytes32 flipId) public flipByKey;

    /// @notice The running preimage offset for this contract's player pointer at
    /// (provider=address(this), token=0, price=0). Random.ink auto-appends: it ignores the
    /// caller-supplied info.offset and places the new pointer at the provider's current
    /// preimage count, then bumps that count by the batch size. Because CoinFlip is the sole
    /// inker at that section and inks exactly two preimages per flip, this counter mirrors
    /// Random's internal _preimageCount and tells us the offset our just-inked players landed
    /// at — which the heat locations must address. Hardcoding 0 would only work for the first
    /// flip; flip #2's players live at offset 2, and so on.
    uint256 internal _playerInkOffset;

    constructor(address _random) payable {
        random = _random;
    }

    /// @notice Validate, record, and emit a new entry, then look for an opposite-side match at the
    /// same stake. If none waits, the entry is queued. Shared by enter and enterAndMatch.
    /// @param side HEADS (0) or TAILS (1)
    /// @param preimage the hash of the player's secret, or WALK_AWAY_PREIMAGE for a walk-away
    /// @return id the new entry id; matchedId the opposite-side entry to pair with, or 0 if queued.
    function _intake(uint8 side, bytes32 preimage) internal returns (uint256 id, uint256 matchedId) {
        if (side > TAILS) revert WrongSide();
        if (msg.value == 0) revert ZeroStake();
        id = ++nextEntrant;
        entries[id] = Entry({
            player: msg.sender,
            side: side,
            stake: msg.value,
            preimage: preimage,
            enteredAtBlock: block.number,
            active: true
        });
        emit Entered(id, msg.sender, side, msg.value);
        uint8 opposite = side == HEADS ? TAILS : HEADS;
        matchedId = _popQueued(msg.value, opposite);
        if (matchedId == 0) {
            _queue[msg.value][side].push(id);
        }
    }

    /// @param side HEADS (0) or TAILS (1)
    /// @param preimage the hash of the player's secret, or WALK_AWAY_PREIMAGE for a walk-away
    function enter(uint8 side, bytes32 preimage) external payable returns (uint256 id) {
        uint256 matchedId;
        (id, matchedId) = _intake(side, preimage);
        if (matchedId != 0) {
            _pair(matchedId, id, msg.value);
        }
    }

    /// @return id the oldest active entry id waiting on `side` at `stake`, or 0 if none
    function _popQueued(uint256 stake, uint8 side) internal returns (uint256 id) {
        uint256[] storage q = _queue[stake][side];
        uint256 head = _queueHead[stake][side];
        while (head < q.length) {
            uint256 candidate = q[head];
            ++head;
            if (entries[candidate].active) {
                _queueHead[stake][side] = head;
                return candidate;
            }
        }
        _queueHead[stake][side] = head;
        return 0;
    }

    /// @notice Enter and, if this completes a pair, ink the two players and heat them with the
    /// supplied validator preimage locations, registering this contract as the request owner so
    /// core Random calls back onCast when the seed finalizes. `template` is the price-0 section
    /// both player preimages share (its provider/offset/index fields are advisory — the contract
    /// inks at provider=address(this) and computes its own offset). `validatorLocations` are free
    /// entropy preimages from the always-on pool, supplied off-chain in this version.
    /// @param side HEADS (0) or TAILS (1)
    /// @param preimage the hash of the player's secret, or WALK_AWAY_PREIMAGE for a walk-away
    function enterAndMatch(
        uint8 side,
        bytes32 preimage,
        PreimageLocation.Info calldata template,
        PreimageLocation.Info[] calldata validatorLocations
    ) external payable returns (uint256 id) {
        uint256 matchedId;
        (id, matchedId) = _intake(side, preimage);
        if (matchedId != 0) {
            _pairAndHeat(matchedId, id, msg.value, template, validatorLocations);
        }
    }

    /// @notice A still-waiting entrant reclaims their stake. The entry stays as an inactive
    /// tombstone in its side queue; _popQueued already skips inactive entries.
    function cancel(uint256 id) external {
        Entry storage e = entries[id];
        if (e.player != msg.sender) revert NotEntrant();
        if (!e.active) revert AlreadyResolved();
        e.active = false;
        emit Cancelled(id);
        e.player.safeTransferETH(e.stake);
    }

    /// @notice Refund both players of a paired flip whose seed never finalized in time.
    function refundStale(bytes32 flipId) external {
        Flip storage flip = flips[flipId];
        if (flip.status != Status.Pending) revert AlreadyResolved();
        if (block.number < flip.pairedAtBlock + STALE_BLOCKS) revert TooEarly();
        flip.status = Status.Refunded;
        flip.heads.safeTransferETH(flip.stake);
        flip.tails.safeTransferETH(flip.stake);
    }

    function _pair(uint256 aId, uint256 bId, uint256 stake) internal {
        (Entry storage heads, Entry storage tails) = _consumePair(aId, bId);
        _recordFlip(heads, tails, stake, bytes32(0));
    }

    /// @notice The randomness-driving pairing path. Inks both players' preimages in one batch
    /// at this contract's price-0 section, then heats all (2 players + N validators) with this
    /// contract as the request owner so Random will call onCast when the seed finalizes.
    function _pairAndHeat(
        uint256 aId,
        uint256 bId,
        uint256 stake,
        PreimageLocation.Info calldata template,
        PreimageLocation.Info[] calldata validatorLocations
    ) internal {
        (Entry storage heads, Entry storage tails) = _consumePair(aId, bId);

        // The pointer our two players share. provider is forced to this contract; price is 0 so
        // ink takes zero value; offset is whatever Random has already counted for us. callAtChange /
        // durationIsTimestamp / duration / token come from the template and define the pointer's
        // encoded-token slot — the heat locations must reuse them to address this same pointer.
        uint256 offset = _playerInkOffset;
        PreimageLocation.Info memory playerInfo = _playerLocation({offset: offset, index: 0, template: template});
        IRandomInkHeat(random).ink(playerInfo, abi.encodePacked(heads.preimage, tails.preimage));

        // Build the heat selection: the two player locations (same pointer, index 0 and 1) followed
        // by the validator locations. Order is load-bearing — cast (Task 5) must replay it exactly.
        // NOTE: each player location is a FRESH struct literal. Copying `playerInfo` into a new
        // memory variable and mutating `.index` would alias the original (memory structs assign by
        // reference in Solidity), corrupting every location that shares the reference.
        uint256 validatorCount = validatorLocations.length;
        uint256 required = 2 + validatorCount;
        PreimageLocation.Info[] memory locations = new PreimageLocation.Info[](required);
        locations[0] = _playerLocation({offset: offset, index: 0, template: template});
        locations[1] = _playerLocation({offset: offset, index: 1, template: template});
        for (uint256 i = 0; i < validatorCount; ++i) {
            locations[2 + i] = validatorLocations[i];
        }

        // settings names the request OWNER (this contract) and turns on the onCast callback.
        PreimageLocation.Info memory settings = PreimageLocation.Info({
            provider: address(this),
            callAtChange: true,
            durationIsTimestamp: template.durationIsTimestamp,
            duration: template.duration,
            token: template.token,
            price: 0,
            offset: 0,
            index: 0
        });
        bytes32 key = IRandomInkHeat(random).heat(required, settings, locations, false);

        // Players consumed two preimages from our pointer; advance so the next flip inks past them.
        _playerInkOffset = offset + 2;

        bytes32 flipId = _recordFlip(heads, tails, stake, key);
        flipByKey[key] = flipId;
    }

    /// @notice Build a fresh player preimage location. The two player preimages share ONE pointer
    /// at (provider=this, token, price=0, offset); `index` 0 is heads and 1 is tails. The
    /// token-defining fields come from `template` and MUST match the values used to ink the pointer,
    /// otherwise the encoded-token key changes and Random cannot find the pointer. Returning a new
    /// struct each call avoids the memory-aliasing trap (memory structs assign by reference).
    function _playerLocation(uint256 offset, uint256 index, PreimageLocation.Info calldata template)
        internal
        view
        returns (PreimageLocation.Info memory)
    {
        return PreimageLocation.Info({
            provider: address(this),
            callAtChange: template.callAtChange,
            durationIsTimestamp: template.durationIsTimestamp,
            duration: template.duration,
            token: template.token,
            price: 0,
            offset: offset,
            index: index
        });
    }

    /// @notice Deactivate the two matched entries and resolve which is heads / tails.
    function _consumePair(uint256 aId, uint256 bId)
        internal
        returns (Entry storage heads, Entry storage tails)
    {
        Entry storage a = entries[aId];
        Entry storage b = entries[bId];
        a.active = false;
        b.active = false;
        return a.side == HEADS ? (a, b) : (b, a);
    }

    /// @notice Persist a paired flip and emit Paired. `key` is bytes32(0) for the queue-only
    /// path (enter) and the Random request key for the randomness-driving path (enterAndMatch).
    function _recordFlip(Entry storage heads, Entry storage tails, uint256 stake, bytes32 key)
        internal
        returns (bytes32 flipId)
    {
        flipId = keccak256(abi.encode(address(this), ++_flipNonce, heads.player, tails.player));
        flips[flipId] = Flip({
            heads: heads.player,
            tails: tails.player,
            stake: stake,
            preimageHeads: heads.preimage,
            preimageTails: tails.preimage,
            key: key,
            pairedAtBlock: block.number,
            status: Status.Pending
        });
        emit Paired(flipId, heads.player, tails.player, stake);
    }

    // --- ConsumerReceiver callbacks ---
    event Settled(bytes32 indexed flipId, address indexed winner, uint8 winningSide, uint256 payout);

    /// @notice Called by core Random when a request's seed is finalized (we set callAtChange on
    /// heat). Looks up the flip by key, picks the winner from seed parity, and pays the pot.
    function onCast(bytes32 key, bytes32 seed) external override {
        if (msg.sender != random) revert OnlyRandom();
        bytes32 flipId = flipByKey[key];
        Flip storage flip = flips[flipId];
        if (flip.status != Status.Pending) revert AlreadyResolved();
        flip.status = Status.Settled;
        // even seed -> heads wins, odd -> tails wins. Provably fair fifty-fifty.
        uint8 winningSide = uint8(uint256(seed) & 1);
        address winner = winningSide == HEADS ? flip.heads : flip.tails;
        uint256 payout = flip.stake * 2;
        emit Settled(flipId, winner, winningSide, payout);
        winner.safeTransferETH(payout);
    }

    function onReverse(bytes32, address, uint256) external override {}
    function onChop(bytes32) external override {}
}
