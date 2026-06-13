// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ECDSA} from "solady/src/utils/ECDSA.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {Ownable} from "solady/src/auth/Ownable.sol";
import {SessionState, SessionStateLib, SessionStateEIP712} from "./SessionState.sol";

/// House-signed authorization for a single escrowed table open (spec 4.3 / 6.2). The player
/// presents this with the house's signature; the contract reserves escrowHouse from the pool.
struct OpenTerms {
    bytes32 tableId;
    address player;
    address playerKey;
    uint256 escrowPlayer;
    uint256 escrowHouse;
    uint8 gameId;
    bytes32 rngCommit;
    uint64 clockBlocks;
    uint64 expiry;
}

library OpenTermsLib {
    bytes32 internal constant TYPEHASH = keccak256(
        "OpenTerms(bytes32 tableId,address player,address playerKey,uint256 escrowPlayer,uint256 escrowHouse,uint8 gameId,bytes32 rngCommit,uint64 clockBlocks,uint64 expiry)"
    );

    function structHash(OpenTerms calldata t) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            TYPEHASH, t.tableId, t.player, t.playerKey, t.escrowPlayer, t.escrowHouse,
            t.gameId, t.rngCommit, t.clockBlocks, t.expiry
        ));
    }

    function structHashMem(OpenTerms memory t) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            TYPEHASH, t.tableId, t.player, t.playerKey, t.escrowPlayer, t.escrowHouse,
            t.gameId, t.rngCommit, t.clockBlocks, t.expiry
        ));
    }
}

/// Escrowed settlement backend (spec 6.2): per-table escrow, cooperative settle, chess-clock
/// dispute/forfeit. The ZkTable channel pattern minus deck/pot/rules. Chips (ERC20) escrow.
contract HouseChannel is SessionStateEIP712, Ownable {
    using SafeTransferLib for address;
    using SessionStateLib for SessionState;
    using OpenTermsLib for OpenTerms;

    error BadStatus();
    error BadClock();
    error Expired();
    error WrongTable();
    error BadMode();
    error BadSig();
    error NotPlayer();
    error ConservationViolated();
    error StaleNonce();
    error InsufficientPool();
    error ClockNotExpired();

    enum Status { None, Live, Disputed, Settled }

    struct Table {
        address player;       // wallet that opened + receives payout
        address playerKey;    // session signing key
        uint256 escrowPlayer;
        uint256 escrowHouse;  // reserved from housePool at open
        uint8 gameId;
        Status status;
        uint64 clockBlocks;
        uint64 checkpointNonce;
        bool hasCheckpoint;
        uint64 disputeDeadline;
        uint8 disputant;      // 1 player, 2 house
        SessionState disputeState;
    }

    uint64 public constant MIN_CLOCK_BLOCKS = 30;     // ~5 min at 10s blocks
    uint64 public constant MAX_CLOCK_BLOCKS = 60480;  // ~1 week

    address public immutable chips;
    address public houseKey;
    uint256 public housePool;
    mapping(bytes32 tableId => Table) public tables;

    event HouseFunded(uint256 amount);
    event HouseWithdrawn(uint256 amount);
    event HouseKeySet(address indexed key);
    event Opened(bytes32 indexed tableId, address indexed player, address playerKey, uint256 escrowPlayer, uint256 escrowHouse);
    event Settled(bytes32 indexed tableId, uint256 payoutPlayer, uint256 payoutHouse);
    event DisputeOpened(bytes32 indexed tableId, uint8 disputant, uint64 nonce, uint64 deadline);
    event DisputeAnsweredWithState(bytes32 indexed tableId, uint64 nonce);
    event DisputeForfeited(bytes32 indexed tableId, uint256 payoutPlayer, uint256 payoutHouse);

    constructor(address chips_) {
        chips = chips_;
        _initializeOwner(msg.sender);
    }

    function setHouseKey(address key) external onlyOwner {
        houseKey = key;
        emit HouseKeySet(key);
    }

    function fundHouse(uint256 amount) external onlyOwner {
        housePool += amount;
        chips.safeTransferFrom(msg.sender, address(this), amount);
        emit HouseFunded(amount);
    }

    function withdrawHouse(uint256 amount) external onlyOwner {
        if (housePool < amount) revert InsufficientPool();
        housePool -= amount;
        chips.safeTransfer(msg.sender, amount);
        emit HouseWithdrawn(amount);
    }

    /// Public for off-chain parity + house signing.
    function openTermsDigest(OpenTerms memory terms) public view returns (bytes32) {
        return _hashTypedData(terms.structHashMem());
    }

    /// Player opens an escrowed table: escrows their own chips, reserves the house's escrow from
    /// the pool, authorized by the house's signature over `terms`. One player tx, no house tx.
    function open(OpenTerms calldata terms, bytes calldata houseSig) external {
        if (terms.player != msg.sender) revert NotPlayer();
        if (block.timestamp > terms.expiry) revert Expired();
        if (terms.clockBlocks < MIN_CLOCK_BLOCKS || terms.clockBlocks > MAX_CLOCK_BLOCKS) revert BadClock();
        if (terms.playerKey == address(0) || terms.playerKey == houseKey) revert NotPlayer();
        Table storage t = tables[terms.tableId];
        if (t.status != Status.None) revert BadStatus();
        if (ECDSA.recoverCalldata(_hashTypedData(terms.structHash()), houseSig) != houseKey) revert BadSig();
        if (housePool < terms.escrowHouse) revert InsufficientPool();
        housePool -= terms.escrowHouse;

        t.player = msg.sender;
        t.playerKey = terms.playerKey;
        t.escrowPlayer = terms.escrowPlayer;
        t.escrowHouse = terms.escrowHouse;
        t.gameId = terms.gameId;
        t.clockBlocks = terms.clockBlocks;
        t.status = Status.Live;

        chips.safeTransferFrom(msg.sender, address(this), terms.escrowPlayer);
        emit Opened(terms.tableId, msg.sender, terms.playerKey, terms.escrowPlayer, terms.escrowHouse);
    }

    /// Cooperative settle: anyone submits the final both-signed state. Pays from locked escrow.
    function settle(SessionState calldata s, bytes calldata sigPlayer, bytes calldata sigHouse) external {
        Table storage t = tables[s.tableId];
        if (t.status != Status.Live) revert BadStatus();
        _checkCoSigned(t, s, sigPlayer, sigHouse);
        if (t.hasCheckpoint && s.nonce <= t.checkpointNonce) revert StaleNonce();
        _payout(t, s.tableId, s.balancePlayer, s.balanceHouse);
    }

    function _checkCoSigned(Table storage t, SessionState calldata s, bytes calldata sigPlayer, bytes calldata sigHouse) internal view {
        if (s.tableId == bytes32(0) || t.status == Status.None) revert WrongTable();
        if (s.settlementMode != 1) revert BadMode();
        if (s.balancePlayer + s.balanceHouse != t.escrowPlayer + t.escrowHouse) revert ConservationViolated();
        bytes32 digest = _hashTypedData(s.structHash());
        if (ECDSA.recoverCalldata(digest, sigPlayer) != t.playerKey) revert BadSig();
        if (ECDSA.recoverCalldata(digest, sigHouse) != houseKey) revert BadSig();
    }

    function _seatOf(Table storage t, address who) internal view returns (uint8) {
        if (who == t.player || who == t.playerKey) return 1;
        if (who == houseKey || who == owner()) return 2;
        revert NotPlayer();
    }

    function _payout(Table storage t, bytes32 tableId, uint256 toPlayer, uint256 toHouse) internal {
        t.status = Status.Settled;
        t.escrowPlayer = 0;
        t.escrowHouse = 0;
        emit Settled(tableId, toPlayer, toHouse);
        if (toPlayer > 0) chips.safeTransfer(t.player, toPlayer);
        housePool += toHouse; // house's share returns to the pool
    }
}
