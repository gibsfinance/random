// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {PreimageInfo} from "../PreimageInfo.sol";

abstract contract Random {
  function pointer(PreimageInfo.Info calldata info) external virtual view returns(address);
  function consumed(PreimageInfo.Info calldata info) external virtual view returns(bool);
}
