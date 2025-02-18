// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

event Ok(address indexed provider, bytes32 section);

event Bleach(address indexed provider, bytes32 section);

event Reprice(address indexed provider, uint256 pricePer);

event Ink(address sender, address indexed provider, bytes32 section, uint256 offset, address pointer);

event Heat(address indexed provider, bytes32 section, uint256 index);

event Start(address indexed owner, bytes32 key); // no need to index because all keys should be unique

event Link(address indexed provider, bytes32 location, bytes32 formerSecret);

event Reveal(address indexed provider, bytes32 location, bytes32 formerSecret);

event Expired(bytes32 key);

event Cast(bytes32 key, bytes32 seed);

event Chop(bytes32 key);

event FailedToCall(address to, bytes32 key);

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
