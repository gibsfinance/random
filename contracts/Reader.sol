// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SSTORE2} from "solady/src/utils/SSTORE2.sol";
import {Random} from "./implementations/Random.sol";
import {PreimageLocation} from "./PreimageLocation.sol";

error Misconfigured();
error IndexOutOfBounds();

contract Reader {
    using SSTORE2 for address;

    uint256 internal constant ONE_SIX = 16;
    uint256 internal constant THREE_TWO = 32;
    uint256 internal constant NINE_SIX = 96;

    function _pointer(address rand, PreimageLocation.Info calldata info) internal view returns (address) {
        address pntr = Random(rand).pointer(info);
        if (pntr == address(0)) {
            revert Misconfigured();
        }
        uint256 size;
        assembly {
            size := extcodesize(pntr)
        }
        if (info.index > ((size / THREE_TWO) - 1)) {
            revert IndexOutOfBounds();
        }
        return pntr;
    }

    function pointer(address rand, PreimageLocation.Info calldata info) external view returns (bytes memory) {
        return _pointer(rand, info).read();
    }

    function unused(address rand, PreimageLocation.Info calldata info)
        external
        view
        returns (PreimageLocation.Info[] memory providerKeyWithIndices)
    {
        unchecked {
            uint256 i;
            bytes memory data = _pointer(rand, info).read();
            uint256 len = data.length / THREE_TWO;
            providerKeyWithIndices = new PreimageLocation.Info[](len);
            do {
                PreimageLocation.Info memory nfo = info;
                nfo.index = i;
                if (!Random(rand).consumed(nfo)) {
                    providerKeyWithIndices[i] = nfo;
                }
                ++i;
            } while (i < len);
        }
    }

    function at(address rand, PreimageLocation.Info calldata info) external view returns (bytes32) {
        return bytes32(_pointer(rand, info).read(info.index * THREE_TWO, info.index * THREE_TWO + THREE_TWO));
    }
}
