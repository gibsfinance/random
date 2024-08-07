// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {EfficientHashLib} from "solady/src/utils/EfficientHashLib.sol";

library PreimageLocation {
    struct Info {
        address provider;
        address token;
        uint256 price;
        uint256 offset;
        uint256 index;
    }

    function hash(Info memory info) internal pure returns (bytes32) {
        return EfficientHashLib.hash(
            bytes32(uint256(uint160(info.provider))),
            bytes32(uint256(uint160(info.token))),
            bytes32(info.price),
            bytes32(info.offset),
            bytes32(info.index)
        );
    }

    function section(Info memory info) internal pure returns (bytes32) {
        return EfficientHashLib.hash(
            bytes32(uint256(uint160(info.provider))),
            bytes32(uint256(uint160(info.token))),
            bytes32(info.price),
            bytes32(info.offset)
        );
    }
}
