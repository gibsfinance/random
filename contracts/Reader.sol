// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {SSTORE2} from "solady/src/utils/SSTORE2.sol";
import {Random} from "./implementations/Random.sol";
import {PreimageLocation} from "./PreimageLocation.sol";

error Misconfigured();
error IndexOutOfBounds();

contract Reader {
    using SSTORE2 for address;

    uint256 internal constant ZERO = 0;
    uint256 internal constant ONE = 1;
    uint256 internal constant ONE_SIX = 16;
    uint256 internal constant THREE_TWO = 32;
    uint256 internal constant FOUR_EIGHT = 48;
    uint256 internal constant NINE_SIX = 96;
    uint256 internal constant TWO_FIVE_FIVE = 255;

    function _pointer(address rand, PreimageLocation.Info calldata info) internal view returns (address) {
        address pntr = Random(rand).pointer(info);
        if (pntr == address(0)) {
            revert Misconfigured();
        }
        uint256 size;
        assembly {
            size := extcodesize(pntr)
        }
        if (info.index > ((size / THREE_TWO) - ONE)) {
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
            bytes memory data = _pointer(rand, info).read();
            uint256 len = data.length / THREE_TWO;
            providerKeyWithIndices = new PreimageLocation.Info[](len);
            uint256 i;
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

    function expired(address rand, bytes32 key) external view returns (bool) {
        return _expired(Random(rand).randomness(key).timeline);
    }

    function _expired(uint256 timeline) internal view virtual returns (bool) {
        unchecked {
            // end
            return (timeline << TWO_FIVE_FIVE == ZERO ? block.number : block.timestamp)
            // start
            - (uint256(uint48(timeline >> FOUR_EIGHT)))
            // expiration delta
            > (uint256(uint48(timeline) >> ONE));
        }
    }
}
