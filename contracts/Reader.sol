// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SSTORE2} from "solady/src/utils/SSTORE2.sol";
import {Random} from "./implementations/Random.sol";
import {PreimageInfo} from "./PreimageInfo.sol";

error Misconfigured();
error IndexOutOfBounds();

contract Reader {
  using SSTORE2 for address;
  uint256 constant internal ONE_SIX = 16;
  uint256 constant internal THREE_TWO = 32;
  uint256 constant internal NINE_SIX = 96;
  function _pointer(address rand, PreimageInfo.Info calldata info) internal view returns(address) {
    address pntr = Random(rand).pointer(info);
    if (pntr == address(0)) {
      revert Misconfigured();
    }
    uint256 size;
    assembly {
      size := extcodesize(pntr)
    }
    if (info.offset > size / THREE_TWO) {
      revert IndexOutOfBounds();
    }
    return pntr;
  }
  function pointer(address rand, PreimageInfo.Info calldata info) external view returns(bytes memory) {
    return _pointer(rand, info).read();
  }
  function unused(address rand, PreimageInfo.Info calldata info) external view returns(PreimageInfo.Info[] memory providerKeyWithIndices) {
    unchecked {
      uint256 i;
      bytes memory data = _pointer(rand, info).read();
      uint256 len = data.length / THREE_TWO;
      providerKeyWithIndices = new PreimageInfo.Info[](len);
      do {
        PreimageInfo.Info memory nfo = info;
        nfo.index = i;
        if (!Random(rand).consumed(nfo)) {
          providerKeyWithIndices[i] = nfo;
        }
        ++i;
      } while (i < len);
    }
  }
  function at(address rand, PreimageInfo.Info calldata info) external view returns(bytes32) {
    uint256 start = info.index * THREE_TWO;
    return bytes32(_pointer(rand, info).read(start, start + THREE_TWO));
  }
}
