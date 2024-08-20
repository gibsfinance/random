// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {EfficientHashLib} from "solady/src/utils/EfficientHashLib.sol";

library PreimageLocation {
    using PreimageLocation for Info;
    using PreimageLocation for bytes32;
    using EfficientHashLib for bytes32;

    struct Info {
        address provider;
        address token;
        uint256 price;
        uint256 offset;
        uint256 index;
    }

    function location(Info memory info) internal pure returns (bytes32) {
        return info.section().hash(bytes32(info.index));
    }

    function location(bytes32 s, uint256 index) internal pure returns (bytes32) {
        return s.hash(bytes32(index));
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
