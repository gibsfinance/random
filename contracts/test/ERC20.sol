// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ERC20 as SolERC20} from "solady/src/tokens/ERC20.sol";

contract ERC20 is SolERC20 {
  bool internal immutable _shouldBurn;
  constructor(bool shouldBurn) {
    _shouldBurn = shouldBurn;
  }
  function name() public pure override returns (string memory) {
    return "";
  }
  function symbol() public pure override returns (string memory) {
    return "";
  }
  function mint(address recipient, uint256 amount) external {
    _mint(recipient, amount);
  }
  function _afterTokenTransfer(address /*from*/, address to, uint256 amount) internal override {
    if (_shouldBurn) {
      _burn(to, amount / 100);
    }
  }
}
