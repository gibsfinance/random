// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

event Ok(address indexed provider, bytes32 section);

event Bleach(address indexed provider, bytes32 section);

event Ink(address indexed provider, uint256 offset, address pointer);

event Heat(address indexed provider, bytes32 location);

event Start(address indexed owner, bytes32 key); // no need to index because all keys should be unique

event Reveal(address indexed provider, bytes32 location, bytes32 revealedSecret);

event Expired(address indexed recipient, address indexed ender, bytes32 key);

event Cast(bytes32 key, bytes32 seed);

event Chop(bytes32 key);

abstract contract Errors {
    error DeploymentFailed();
    error Misconfigured();
    error UnableToService();
    error MissingPayment();
    error SecretMismatch();
    error ZeroSecret();
    error NotInCohort();
    error SignerMismatch();
}
