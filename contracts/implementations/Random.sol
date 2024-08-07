// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {PreimageLocation} from "../PreimageLocation.sol";

abstract contract Random {
    uint256 internal constant ZERO = 0;
    uint256 internal constant ONE = 1;
    uint256 internal constant EIGHT = 8;
    uint256 internal constant ONE_SIX = 16;
    uint256 internal constant THREE_TWO = 32;
    uint256 internal constant FOUR_EIGHT = 48;
    uint256 internal constant NINE_SIX = 96;
    uint256 internal constant ONE_TWO_EIGHT = 128;
    uint256 internal constant ONE_SIX_ZERO = 160;
    uint256 internal constant TWO_ZERO_EIGHT = 208;
    uint256 internal constant TWO_ZERO_NINE = ONE + TWO_ZERO_EIGHT;
    uint256 internal constant TWO_FOUR_EIGHT = 248;
    uint256 internal constant TWO_FIVE_FIVE = 255;
    uint256 internal constant TWO_FIVE_SIX = 256;

    mapping(bytes32 key => uint256 timeline) internal _timeline;
    mapping(bytes32 key => bytes32 seed) internal _seed;

    struct Randomness {
        uint256 timeline;
        bytes32 seed;
    }

    function heat(uint256 required, uint256 expiryOffset, address token, PreimageLocation.Info[] calldata info)
        external
        payable
        virtual
        returns (bytes32);
    function pointer(PreimageLocation.Info calldata info) external view virtual returns (address);
    function consumed(PreimageLocation.Info calldata info) external view virtual returns (bool);
    function randomness(bytes32 key) external view virtual returns (Randomness memory);

    function expired(uint256 timeline) external view virtual returns (bool) {
        return _expired(timeline);
    }

    function _expired(uint256 timeline) internal view virtual returns (bool) {
        unchecked {
            // end
            return (timeline << (TWO_FIVE_FIVE - EIGHT) >> TWO_FIVE_FIVE == ZERO ? block.number : block.timestamp)
            // start
            - (uint256(uint48(timeline >> FOUR_EIGHT)))
            // expiration delta
            > (uint256(uint40(timeline) >> (EIGHT + ONE)));
        }
    }
}
