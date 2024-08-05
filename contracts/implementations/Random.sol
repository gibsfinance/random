// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {PreimageLocation} from "../PreimageLocation.sol";

abstract contract Random {
  function pointer(PreimageLocation.Info calldata info) external virtual view returns(address);
  function consumed(PreimageLocation.Info calldata info) external virtual view returns(bool);
}
