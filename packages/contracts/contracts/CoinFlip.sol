// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {ConsumerReceiver} from "./implementations/ConsumerReceiver.sol";
import {IRandom} from "./implementations/IRandom.sol";
import {PreimageLocation} from "./PreimageLocation.sol";

/// @notice The one method core Random exposes that the shipped IRandom abstract contract omits.
/// Everything else this contract needs (heat, randomness) is single-sourced from IRandom, so the
/// only hand-declared signature here is `ink`, verified against contracts/Random.sol.
interface IRandomInk {
    function ink(PreimageLocation.Info memory info, bytes calldata data) external payable;
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
    error InvalidPreimage();

    event Entered(uint256 indexed id, address indexed player, uint8 side, uint256 stake);
    event Cancelled(uint256 indexed id);
    event Paired(bytes32 indexed flipId, address heads, address tails, uint256 stake);
    event Heated(bytes32 indexed flipId, bytes32 indexed key, uint256 playerOffset, uint256 validatorCount);
    event Settled(bytes32 indexed flipId, address indexed winner, uint8 winningSide, uint256 payout, bytes32 seed);

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

    /// @notice Upper bound on how many queue slots _popQueued will skip past in one call. A griefer
    /// can stack many cancelled (inactive) entries at one (stake, side); without a cap a matcher's
    /// gas could be exhausted walking tombstones. When the cap is hit with no active entry found,
    /// the advanced head is persisted and the entrant simply queues (treated as no match).
    uint256 internal constant MAX_QUEUE_SCAN = 32;

    // The canonical section for every player preimage pointer. Fixed so this contract's single
    // _playerInkOffset stays in lockstep with Random's per-(provider,encodeToken,price) counter.
    // Native token only (v1); price 0 (only the escrowed wager moves value). The pointer's own
    // callAtChange is false — the request-level callback is set on the heat `settings`, not here.
    address internal constant FLIP_TOKEN = address(0);
    bool internal constant FLIP_DURATION_IS_TIMESTAMP = false;
    uint256 public constant FLIP_DURATION = 12; // blocks; matches the validator pool section

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
    /// same stake. If none waits, the entry is queued. Used by enterAndMatch.
    /// @param side HEADS (0) or TAILS (1)
    /// @param preimage the hash of the player's secret, or WALK_AWAY_PREIMAGE for a walk-away
    /// @return id the new entry id; matchedId the opposite-side entry to pair with, or 0 if queued.
    function _intake(uint8 side, bytes32 preimage) internal returns (uint256 id, uint256 matchedId) {
        if (side > TAILS) revert WrongSide();
        if (msg.value == 0) revert ZeroStake();
        // A zero preimage's secret is unrevealable: core Random.cast treats a revealed bytes32(0)
        // as MISSING_SECRET and never finalizes the seed, so such a flip could never be cast.
        if (preimage == bytes32(0)) revert InvalidPreimage();
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

    /// @return id the oldest active entry id waiting on `side` at `stake`, or 0 if none
    function _popQueued(uint256 stake, uint8 side) internal returns (uint256 id) {
        uint256[] storage q = _queue[stake][side];
        uint256 head = _queueHead[stake][side];
        uint256 scanned = 0;
        while (head < q.length && scanned < MAX_QUEUE_SCAN) {
            uint256 candidate = q[head];
            ++head;
            ++scanned;
            if (entries[candidate].active) {
                _queueHead[stake][side] = head;
                return candidate;
            }
        }
        // Persist the tombstones we skipped so a future call resumes past them, then report no
        // match (the entrant queues). Capping the scan keeps a tombstone griefer from blowing up
        // the matcher's gas; the skipped head advance is not lost.
        _queueHead[stake][side] = head;
        return 0;
    }

    /// @notice Enter and, if this completes a pair, ink the two players and heat them with the
    /// supplied validator preimage locations, registering this contract as the request owner so
    /// core Random calls back onCast when the seed finalizes. The player preimages always land in
    /// the canonical section (native token, price 0, duration FLIP_DURATION) so the single
    /// _playerInkOffset stays in lockstep with Random's per-encodeToken counter — there is no
    /// caller control of the player section. `validatorLocations` are free entropy preimages from
    /// the always-on pool, supplied off-chain in this version. A lone entrant with no opposite-side
    /// match simply queues (no heat), so passing an empty validator array is valid in that case.
    /// @param side HEADS (0) or TAILS (1)
    /// @param preimage the hash of the player's secret, or WALK_AWAY_PREIMAGE for a walk-away
    function enterAndMatch(
        uint8 side,
        bytes32 preimage,
        PreimageLocation.Info[] calldata validatorLocations
    ) external payable returns (uint256 id) {
        uint256 matchedId;
        (id, matchedId) = _intake(side, preimage);
        if (matchedId != 0) {
            _pairAndHeat(matchedId, id, msg.value, validatorLocations);
        }
    }

    /// @notice The canonical section both player preimages of every flip share, at the given
    /// offset. Off-chain casters rebuild the heat selection as [playerSection(offset)#index0,
    /// playerSection(offset)#index1, ...validatorLocations].
    function playerSection(uint256 offset, uint256 index) external view returns (PreimageLocation.Info memory) {
        return _playerLocation(offset, index);
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

    /// @notice The randomness-driving pairing path. Inks both players' preimages in one batch
    /// at this contract's canonical price-0 section, then heats all (2 players + N validators) with
    /// this contract as the request owner so Random will call onCast when the seed finalizes.
    function _pairAndHeat(
        uint256 aId,
        uint256 bId,
        uint256 stake,
        PreimageLocation.Info[] calldata validatorLocations
    ) internal {
        (Entry storage heads, Entry storage tails) = _consumePair(aId, bId);

        // The pointer our two players share. Every field except offset/index is a contract
        // constant (provider=this, native token, price 0, duration FLIP_DURATION), so the pointer
        // always lands in ONE Random per-encodeToken counter and _playerInkOffset tracks it
        // exactly. offset is whatever Random has already counted for us.
        uint256 offset = _playerInkOffset;
        PreimageLocation.Info memory playerInfo = _playerLocation({offset: offset, index: 0});
        IRandomInk(random).ink(playerInfo, abi.encodePacked(heads.preimage, tails.preimage));

        // Build the heat selection: the two player locations (same pointer, index 0 and 1) followed
        // by the validator locations. Order is load-bearing — cast (Task 5) must replay it exactly.
        // NOTE: each player location is a FRESH struct literal. Copying `playerInfo` into a new
        // memory variable and mutating `.index` would alias the original (memory structs assign by
        // reference in Solidity), corrupting every location that shares the reference.
        uint256 validatorCount = validatorLocations.length;
        uint256 required = 2 + validatorCount;
        PreimageLocation.Info[] memory locations = new PreimageLocation.Info[](required);
        locations[0] = _playerLocation({offset: offset, index: 0});
        locations[1] = _playerLocation({offset: offset, index: 1});
        for (uint256 i = 0; i < validatorCount; ++i) {
            locations[2 + i] = validatorLocations[i];
        }

        // settings names the request OWNER (this contract) and turns on the onCast callback. Its
        // token-defining fields are the same canonical constants as the player pointer.
        PreimageLocation.Info memory settings = PreimageLocation.Info({
            provider: address(this),
            callAtChange: true,
            durationIsTimestamp: FLIP_DURATION_IS_TIMESTAMP,
            duration: FLIP_DURATION,
            token: FLIP_TOKEN,
            price: 0,
            offset: 0,
            index: 0
        });
        bytes32 key = IRandom(random).heat(required, settings, locations, false);

        // Players consumed two preimages from our pointer; advance so the next flip inks past them.
        _playerInkOffset = offset + 2;

        bytes32 flipId = _recordFlip(heads, tails, stake, key);
        flipByKey[key] = flipId;
        // Lets an indexer reconstruct the exact heat selection: playerSection(offset, 0),
        // playerSection(offset, 1), then the validatorLocations.
        emit Heated(flipId, key, offset, validatorCount);
    }

    /// @notice Build a fresh player preimage location purely from the canonical constants. The two
    /// player preimages share ONE pointer at (provider=this, FLIP_TOKEN, price=0, offset); `index`
    /// 0 is heads and 1 is tails. Because none of the token-defining fields depend on caller input,
    /// the encoded-token key is constant and Random's per-section counter stays in lockstep with
    /// _playerInkOffset. Returning a new struct each call avoids the memory-aliasing trap (memory
    /// structs assign by reference). The pointer's own callAtChange is false; the request-level
    /// callback lives on the heat `settings`.
    function _playerLocation(uint256 offset, uint256 index)
        internal
        view
        returns (PreimageLocation.Info memory)
    {
        return PreimageLocation.Info({
            provider: address(this),
            callAtChange: false,
            durationIsTimestamp: FLIP_DURATION_IS_TIMESTAMP,
            duration: FLIP_DURATION,
            token: FLIP_TOKEN,
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

    /// @notice Persist a paired flip and emit Paired. `key` is the Random request key for the
    /// randomness-driving path (enterAndMatch).
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

    /// @notice The single settlement code path, shared by onCast (optimistic push) and claim
    /// (pull fallback). Guards status == Pending BEFORE the transfer (checks-effects-interactions):
    /// this AlreadyResolved guard is what makes a double payout impossible across the two entries.
    /// @dev When called from onCast and the transfer reverts, core Random's _call swallows the
    /// revert and the status = Settled write is rolled back with the frame, leaving the flip Pending
    /// so claim can retry. Do NOT add a reentrancy guard here — it would block that retry.
    function _settle(bytes32 flipId, bytes32 seed) internal {
        Flip storage flip = flips[flipId];
        if (flip.status != Status.Pending) revert AlreadyResolved();
        flip.status = Status.Settled;
        // even seed -> heads wins, odd -> tails wins. Provably fair fifty-fifty.
        uint8 winningSide = uint8(uint256(seed) & 1);
        address winner = winningSide == HEADS ? flip.heads : flip.tails;
        uint256 payout = flip.stake * 2;
        emit Settled(flipId, winner, winningSide, payout, seed);
        winner.safeTransferETH(payout);
    }

    /// @notice Settle a flip whose Random seed is finalized but whose onCast push did not complete
    /// (Random swallows a reverting callback, leaving the flip Pending while the seed exists). Anyone
    /// may call; the pot goes to the parity-selected winner. The shared _settle path's AlreadyResolved
    /// guard prevents any double payout across onCast and claim.
    function claim(bytes32 flipId) external {
        Flip storage flip = flips[flipId];
        if (flip.status != Status.Pending) revert AlreadyResolved();
        bytes32 seed = IRandom(random).randomness(flip.key).seed;
        if (seed == bytes32(0)) revert TooEarly(); // seed not finalized yet
        _settle(flipId, seed);
    }

    // --- ConsumerReceiver callbacks ---

    /// @notice Called by core Random when a request's seed is finalized (we set callAtChange on
    /// heat). Looks up the flip by key and routes through the shared _settle path, which pushes the
    /// pot to the parity-selected winner. If the push reverts, Random swallows it and the flip stays
    /// Pending for a later claim.
    function onCast(bytes32 key, bytes32 seed) external override {
        if (msg.sender != random) revert OnlyRandom();
        _settle(flipByKey[key], seed);
    }

    function onReverse(bytes32, address, uint256) external override {}
    function onChop(bytes32) external override {}
}
