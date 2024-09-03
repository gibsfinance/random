import { parseAbi } from "viem";

export const permit2Abi = parseAbi([
  'function nonces(address owner) external',
  `struct PermitDetails {
      // ERC20 token address
      address token;
      // the maximum amount allowed to spend
      uint160 amount;
      // timestamp at which a spender's token allowances become invalid
      uint48 expiration;
      // an incrementing value indexed per owner,token,and spender for each signature
      uint48 nonce;
    }`,
  `struct PermitSingle {
      // the permit data for a single token alownce
      PermitDetails details;
      // address permissioned on the allowed tokens
      address spender;
      // deadline on the permit signature
      uint256 sigDeadline;
    }`,
  'function permit(address owner, PermitSingle memory permitSingle, bytes calldata signature) external',
])
