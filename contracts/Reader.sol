// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SSTORE2} from "solady/src/utils/SSTORE2.sol";
import {Random} from "./implementations/Random.sol";

error Misconfigured();
error IndexOutOfBounds();

contract Reader {
  using SSTORE2 for address;
  uint256 constant internal ONE_SIX = 16;
  uint256 constant internal THREE_TWO = 32;
  uint256 constant internal NINE_SIX = 96;
  function _pointer(address rand, address provider, uint256 offset) internal view returns(address) {
    address pntr = Random(rand).pointer(provider, offset);
    if (pntr == address(0)) {
      revert Misconfigured();
    }
    uint256 size;
    assembly {
      size := extcodesize(pntr)
    }
    if (offset > size / THREE_TWO) {
      revert IndexOutOfBounds();
    }
    return pntr;
  }
  function pointer(address rand, address provider, uint256 offset) external view returns(bytes memory) {
    return _pointer(rand, provider, offset).read();
  }
  function unused(address rand, address provider, uint256 offset) external view returns(uint256[] memory providerKeyWithIndices) {
    unchecked {
      uint256 i;
      bytes memory data = _pointer(rand, provider, offset).read();
      uint256 len = data.length / THREE_TWO;
      providerKeyWithIndices = new uint256[](len);
      uint256 section = (uint256(uint160(provider)) << NINE_SIX) | (
        uint256(uint80(offset)) << ONE_SIX
      );
      do {
        if (!Random(rand).consumed(section | i)) {
          providerKeyWithIndices[i] = (section | i);
        }
        ++i;
      } while (i < len);
    }
  }
  function at(address rand, address provider, uint256 offset, uint256 index) external view returns(bytes32) {
    return bytes32(_pointer(rand, provider, offset).read(index, index + THREE_TWO));
  }
}
