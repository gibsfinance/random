// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Consumer} from "./Consumer.sol";
import {Random} from "./Random.sol";

contract FundedConsumer {
    Consumer immutable consumer;
    Random immutable random;

    constructor(address _consumer, address _random) payable {
        consumer = Consumer(_consumer);
        random = Random(_random);
    }
}
