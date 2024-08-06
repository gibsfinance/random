// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

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
