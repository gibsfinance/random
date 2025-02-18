// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ConsumerReceiver as ConsumerReceiverImplementation} from "../implementations/ConsumerReceiver.sol";

contract ConsumerReceiver is ConsumerReceiverImplementation {
    uint256 internal _shouldRevert;
    bytes32 internal _reverted;

    error AskedToRevert();

    function setShouldRevert(uint256 shouldRevert) external {
        _shouldRevert = shouldRevert;
    }

    function onCast(bytes32, /*key*/ bytes32 /*seed*/ ) external override {
        _doRevert();
    }

    function onChop(bytes32 /*key*/ ) external override {
        _doRevert();
    }

    function onReverse(bytes32, /*key*/ address, /*_token*/ uint256 /*_amount*/ ) external override {
        _doRevert();
    }

    function _doRevert() internal {
        if (_shouldRevert == 0) {
            return;
        }
        if (_shouldRevert == 1) {
            revert();
        } else if (_shouldRevert == 2) {
            revert("ConsumerReceiver: should revert");
        } else if (_shouldRevert == 3) {
            revert AskedToRevert();
        }
        _reverted = bytes32(uint256(1));
    }
}
