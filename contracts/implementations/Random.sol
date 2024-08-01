// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

abstract contract Random {
  function pointer(address provider, uint256 start) external virtual view returns(address);
}
