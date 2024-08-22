// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {LibMulticaller} from "multicaller/src/LibMulticaller.sol";
import {SSTORE2} from "solady/src/utils/SSTORE2.sol";
import {IRandom} from "./implementations/IRandom.sol";
import {Errors, Ok} from "./Constants.sol";
import {PreimageLocation} from "./PreimageLocation.sol";

error Misconfigured();
error IndexOutOfBounds();

contract Reader {
    using SSTORE2 for address;
    using PreimageLocation for PreimageLocation.Info;

    uint256 internal constant ZERO = 0;
    uint256 internal constant ONE = 1;
    uint256 internal constant EIGHT = 8;
    uint256 internal constant ONE_SIX = 16;
    uint256 internal constant THREE_TWO = 32;
    uint256 internal constant FOUR_EIGHT = 48;
    uint256 internal constant NINE_SIX = 96;
    uint256 internal constant TWO_FIVE_FIVE = 255;

    address internal rand;

    constructor(address _rand) payable {
        rand = _rand;
    }

    function _pointer(
        PreimageLocation.Info calldata info
    ) internal view returns (address) {
        address pntr = IRandom(rand).pointer(info);
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

    function pointer(
        PreimageLocation.Info calldata info
    ) external view returns (bytes memory) {
        return _pointer(info).read();
    }

    function consumed(
        PreimageLocation.Info calldata section
    ) external view returns (uint256 len, bytes memory indices) {
        unchecked {
            bytes memory data = _pointer(section).read();
            len = data.length / THREE_TWO;
            indices = new bytes(
                (len / EIGHT) + (((len % EIGHT) > ONE) ? ONE : ZERO)
            );
            uint256 i;
            uint256 seven = EIGHT - ONE;
            do {
                PreimageLocation.Info memory nfo = section;
                nfo.index = i;
                if (IRandom(rand).consumed(nfo)) {
                    indices[i / EIGHT] = bytes1(
                        uint8(
                            // take the current block of bits
                            uint256(uint8(indices[i / EIGHT])) |
                                // and add a one at the appropriate offset index
                                (ONE << (seven - (i % EIGHT)))
                        )
                    );
                }
                ++i;
            } while (i < len);
        }
    }

    function at(
        PreimageLocation.Info calldata info
    ) external view returns (bytes32) {
        return
            bytes32(
                _pointer(info).read(
                    info.index * THREE_TWO,
                    info.index * THREE_TWO + THREE_TWO
                )
            );
    }

    /**
     * signal publicly that these sections are still active
     * @param infos the sections that you wish to signal are still active
     * @dev best to do this on a regular interval such as after a hiatus,
     * a missed cast, or if no activity occurs after a week
     */
    function ok(PreimageLocation.Info[] calldata infos) external payable {
        unchecked {
            address provider = LibMulticaller.senderOrSigner();
            uint256 len = infos.length;
            uint256 i;
            do {
                if (infos[i].provider != provider) {
                    revert Errors.SignerMismatch();
                }
                emit Ok(provider, infos[i].section());
                ++i;
            } while (i < len);
        }
    }
}
