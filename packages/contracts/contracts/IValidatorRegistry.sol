// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @notice The swappable allowlist seam. GameBase reads validator membership through this shape;
/// version one answers it from an owner-managed mapping inside GameBase itself, but a later
/// version can point GameBase at an external multisig- or bond-governed registry implementing
/// this interface without touching either game.
interface IValidatorRegistry {
    function isValidator(address account) external view returns (bool);
}
