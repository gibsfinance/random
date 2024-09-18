// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PreimageLocation} from "../PreimageLocation.sol";
import {IRandom} from "../implementations/IRandom.sol";

contract ConsumerIncomplete {
    address immutable rand;

    constructor(address _rand) payable {
        rand = _rand;
    }

    function heat(
        uint256 required,
        PreimageLocation.Info calldata settings,
        PreimageLocation.Info[] calldata potentialLocations
    ) external {
        IRandom(rand).heat(
            required,
            PreimageLocation.Info({
                provider: settings.provider,
                callAtChange: settings.callAtChange,
                duration: settings.duration,
                durationIsTimestamp: settings.durationIsTimestamp,
                token: settings.token,
                price: settings.price,
                offset: settings.offset,
                index: settings.index
            }),
            potentialLocations
        );
    }

    receive() external payable {}
}
