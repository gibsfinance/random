// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {EIP712} from "solady/src/utils/EIP712.sol";
import {ECDSA} from "solady/src/utils/ECDSA.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {ChannelState, ChannelStateLib} from "./ChannelState.sol";
import {IGameRules} from "./IGameRules.sol";

/// @notice Two-party state-channel card table. Stakes escrow at create/join, play is
/// off-chain co-signed states, the chain is touched again only to settle, top up, or
/// dispute. Tables are independent structs keyed by id — nothing reads another table,
/// so sessions pipeline (spec: 2026-06-11-zk-card-games-design.md, msgboard repo).
contract ZkTable is EIP712 {
    using SafeTransferLib for address;
    using ChannelStateLib for ChannelState;

    error WrongValue();
    error BadClock();
    error BadStatus();
    error NotPlayer();
    error WrongTable();
    error BadSig();
    error NotFinal();
    error PotNotZero();
    error ConservationViolated();
    error StaleNonce();
    error BadRules();

    enum Status { None, Created, Live, Disputed, Settled, Cancelled }

    struct Table {
        address playerA;
        address playerB;
        address keyA;            // channel signing key (may differ from wallet)
        address keyB;
        uint256 escrowA;
        uint256 escrowB;
        uint256 joinStake;       // exact amount B must escrow
        IGameRules rules;
        uint64 clockBlocks;
        Status status;
        uint64 checkpointNonce;  // highest nonce co-signed on-chain; later submissions must not be older
        bool hasCheckpoint;
        // dispute fields (next task)
        uint64 disputeDeadline;
        uint8 disputant;
        uint8 demandKind;
        uint32 demandSlot;
        ChannelState disputeState;
    }

    uint64 public constant MIN_CLOCK_BLOCKS = 30;     // ~5 min at 10s blocks
    uint64 public constant MAX_CLOCK_BLOCKS = 60480;  // ~1 week

    uint256 internal _counter;
    mapping(bytes32 => Table) public tables;
    // EdOnBN254 deck pubkeys for snark-reveal disputes: tableId => seat (1/2) => [x, y]
    mapping(bytes32 => mapping(uint8 => uint256[2])) public deckKeys;

    event TableCreated(bytes32 indexed tableId, address indexed playerA, address rules, uint256 escrow, uint256 joinStake, uint64 clockBlocks);
    event TableJoined(bytes32 indexed tableId, address indexed playerB);
    event TableCancelled(bytes32 indexed tableId);
    event ToppedUp(bytes32 indexed tableId, uint8 seat, uint256 amount);
    event TableSettled(bytes32 indexed tableId, uint256 payoutA, uint256 payoutB);

    /// Matches makeDomain() in zk-cards-core: { name: 'ZkTable', version: '1' }.
    /// (Solady EIP712 rather than OZ: OZ 5.6's Strings->Bytes dependency uses MCOPY
    /// assembly, which solc rejects outright when targeting shanghai for 943.)
    function _domainNameAndVersion() internal pure override returns (string memory, string memory) {
        return ("ZkTable", "1");
    }

    function create(IGameRules rules, uint256 joinStake, uint64 clockBlocks, address channelKey, uint256[2] calldata deckKey)
        external
        payable
        returns (bytes32 tableId)
    {
        if (msg.value == 0) revert WrongValue();
        if (clockBlocks < MIN_CLOCK_BLOCKS || clockBlocks > MAX_CLOCK_BLOCKS) revert BadClock();
        if (address(rules).code.length == 0) revert BadRules(); // a dead rules address would brick settle for both escrows
        tableId = keccak256(abi.encode(block.chainid, address(this), ++_counter));
        Table storage t = tables[tableId];
        t.playerA = msg.sender;
        t.keyA = channelKey == address(0) ? msg.sender : channelKey;
        t.escrowA = msg.value;
        t.joinStake = joinStake;
        t.rules = rules;
        t.clockBlocks = clockBlocks;
        t.status = Status.Created;
        deckKeys[tableId][1] = deckKey;
        emit TableCreated(tableId, msg.sender, address(rules), msg.value, joinStake, clockBlocks);
    }

    function join(bytes32 tableId, address channelKey, uint256[2] calldata deckKey) external payable {
        Table storage t = tables[tableId];
        if (t.status != Status.Created) revert BadStatus();
        if (msg.sender == t.playerA) revert NotPlayer();
        if (msg.value != t.joinStake) revert WrongValue();
        t.playerB = msg.sender;
        address keyB = channelKey == address(0) ? msg.sender : channelKey;
        // keyB colliding with A's identities would make _seatOf ambiguous
        if (keyB == t.playerA || keyB == t.keyA) revert NotPlayer();
        t.keyB = keyB;
        t.escrowB = msg.value;
        t.status = Status.Live;
        deckKeys[tableId][2] = deckKey;
        emit TableJoined(tableId, msg.sender);
    }

    /// Creator backs out before anyone joins.
    function cancel(bytes32 tableId) external {
        Table storage t = tables[tableId];
        if (t.status != Status.Created) revert BadStatus();
        if (msg.sender != t.playerA) revert NotPlayer();
        t.status = Status.Cancelled;
        uint256 amount = t.escrowA;
        t.escrowA = 0;
        emit TableCancelled(tableId);
        // forced send so a reverting receiver cannot hold the counterparty's payout hostage
        t.playerA.forceSafeTransferETH(amount);
    }

    /// Spec: top-up only at a flip boundary, reflected in the next co-signed state.
    /// On-chain it just bumps escrow; both clients mirror via Channel.applyTopUp.
    function topUp(bytes32 tableId) external payable {
        Table storage t = tables[tableId];
        if (t.status != Status.Live) revert BadStatus();
        if (msg.value == 0) revert WrongValue();
        uint8 seat = _seatOf(t, msg.sender);
        if (seat == 1) t.escrowA += msg.value;
        else t.escrowB += msg.value;
        emit ToppedUp(tableId, seat, msg.value);
    }

    /// Cooperative settle: either party submits the final co-signed state.
    /// (A Disputed table must first return to Live via a dispute response.)
    function settle(bytes32 tableId, ChannelState calldata state, bytes calldata sigA, bytes calldata sigB) external {
        Table storage t = tables[tableId];
        if (t.status != Status.Live) revert BadStatus();
        _seatOf(t, msg.sender); // reverts NotPlayer for strangers
        _checkCoSigned(t, tableId, state, sigA, sigB);
        if (!t.rules.isFinal(state.phase)) revert NotFinal();
        if (state.pot != 0) revert PotNotZero();
        if (t.hasCheckpoint && state.nonce <= t.checkpointNonce) revert StaleNonce();
        _payout(t, tableId, state.balanceA, state.balanceB);
    }

    /// Public so off-chain code can parity-test the EIP-712 digest.
    function stateDigest(ChannelState calldata state) public view returns (bytes32) {
        return _hashTypedData(state.structHash());
    }

    /// Every state the contract accepts must conserve the CURRENT escrow total —
    /// so dispute timeouts (next task) can always pay out exactly escrowA+escrowB,
    /// and a pre-top-up state becomes unsubmittable once the top-up lands.
    function _checkCoSigned(Table storage t, bytes32 tableId, ChannelState calldata state, bytes calldata sigA, bytes calldata sigB) internal view {
        if (state.tableId != tableId) revert WrongTable();
        if (state.balanceA + state.balanceB + state.pot != t.escrowA + t.escrowB) revert ConservationViolated();
        bytes32 digest = stateDigest(state);
        // Solady ECDSA does not enforce low-s; sigs are never used as identifiers here (replay
        // safety = status + tableId pin + nonce checkpoint), so malleability is benign — do not
        // use sig bytes as dedup keys off-chain.
        if (ECDSA.recoverCalldata(digest, sigA) != t.keyA) revert BadSig();
        if (ECDSA.recoverCalldata(digest, sigB) != t.keyB) revert BadSig();
    }

    function _seatOf(Table storage t, address who) internal view returns (uint8) {
        if (who == t.playerA || who == t.keyA) return 1;
        if (who == t.playerB || who == t.keyB) return 2;
        revert NotPlayer();
    }

    function _payout(Table storage t, bytes32 tableId, uint256 toA, uint256 toB) internal {
        t.status = Status.Settled;
        t.escrowA = 0;
        t.escrowB = 0;
        emit TableSettled(tableId, toA, toB);
        // forced send so a reverting receiver cannot hold the counterparty's payout hostage
        if (toA > 0) t.playerA.forceSafeTransferETH(toA);
        if (toB > 0) t.playerB.forceSafeTransferETH(toB);
    }
}
