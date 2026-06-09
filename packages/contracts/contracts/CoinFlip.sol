// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {ConsumerReceiver} from "./implementations/ConsumerReceiver.sol";

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

    constructor(address _random) payable {
        random = _random;
    }

    /// @param side HEADS (0) or TAILS (1)
    /// @param preimage the hash of the player's secret, or WALK_AWAY_PREIMAGE for a walk-away
    function enter(uint8 side, bytes32 preimage) external payable returns (uint256 id) {
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
        uint256 matchedId = _popQueued(msg.value, opposite);
        if (matchedId == 0) {
            _queue[msg.value][side].push(id);
            return id;
        }
        _pair(matchedId, id, msg.value);
        return id;
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

    function _pair(uint256 aId, uint256 bId, uint256 stake) internal {
        Entry storage a = entries[aId];
        Entry storage b = entries[bId];
        a.active = false;
        b.active = false;
        (Entry storage heads, Entry storage tails) = a.side == HEADS ? (a, b) : (b, a);
        bytes32 flipId = keccak256(abi.encode(address(this), ++_flipNonce, heads.player, tails.player));
        flips[flipId] = Flip({
            heads: heads.player,
            tails: tails.player,
            stake: stake,
            preimageHeads: heads.preimage,
            preimageTails: tails.preimage,
            key: bytes32(0),
            pairedAtBlock: block.number,
            status: Status.Pending
        });
        emit Paired(flipId, heads.player, tails.player, stake);
    }

    // --- ConsumerReceiver callbacks (onCast implemented in Task 5) ---
    function onCast(bytes32, bytes32) external override {}
    function onReverse(bytes32, address, uint256) external override {}
    function onChop(bytes32) external override {}
}
