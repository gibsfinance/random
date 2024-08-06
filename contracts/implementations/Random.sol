// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {PreimageLocation} from "../PreimageLocation.sol";

abstract contract Random {
    struct Randomness {
        uint256 timeline;
        uint256 seed;
    }

    function pointer(PreimageLocation.Info calldata info) external view virtual returns (address);
    function consumed(PreimageLocation.Info calldata info) external view virtual returns (bool);
    function expired(bytes32 key) external view virtual returns (bool);
    function randomness(bytes32 key) external view virtual returns (Randomness memory);
}
