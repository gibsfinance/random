// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// Mirrors @gibs/zk-cards-core stateSig.ts CHANNEL_STATE_TYPES exactly.
struct ChannelState {
    bytes32 tableId;
    uint64 nonce;
    uint256 balanceA;
    uint256 balanceB;
    uint256 pot;
    bytes32 deckCommitment;
    uint8 phase;
    bytes32 gameStateHash;
}

library ChannelStateLib {
    bytes32 internal constant TYPEHASH = keccak256(
        "ChannelState(bytes32 tableId,uint64 nonce,uint256 balanceA,uint256 balanceB,uint256 pot,bytes32 deckCommitment,uint8 phase,bytes32 gameStateHash)"
    );

    function structHash(ChannelState calldata s) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            TYPEHASH, s.tableId, s.nonce, s.balanceA, s.balanceB, s.pot,
            s.deckCommitment, s.phase, s.gameStateHash
        ));
    }
}
