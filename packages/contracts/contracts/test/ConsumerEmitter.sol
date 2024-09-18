// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ConsumerIncomplete} from "./ConsumerIncomplete.sol";
import {PreimageLocation} from "../PreimageLocation.sol";
import {IRandom} from "../implementations/IRandom.sol";
import {ConsumerReceiver} from "../implementations/ConsumerReceiver.sol";

event Reverse(bytes32 key, address token, uint256 amount);

event Chop(bytes32 key);

event Cast(bytes32 key, bytes32 seed);

contract ConsumerEmitter is ConsumerIncomplete, ConsumerReceiver {
    constructor(address _rand) payable ConsumerIncomplete(_rand) {}

    function onCast(bytes32 key, bytes32 seed) external override {
        emit Cast({
            key: key,
            seed: seed
        });
    }

    function onChop(bytes32 key) external override {
        emit Chop({
            key: key
        });
    }

    function onReverse(
        bytes32 key,
        address token,
        uint256 amount
    ) external override {
        emit Reverse({
            key: key,
            token: token,
            amount: amount
        });
    }
}
