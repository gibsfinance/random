// This file was autogenerated by hardhat-viem, do not edit it.
// prettier-ignore
// tslint:disable
// eslint-disable

import "hardhat/types/artifacts";
import type { GetContractReturnType } from "@nomicfoundation/hardhat-viem/types";

import { LibBit$Type } from "./LibBit";

declare module "hardhat/types/artifacts" {
  interface ArtifactsMap {
    ["LibBit"]: LibBit$Type;
    ["solady/src/utils/LibBit.sol:LibBit"]: LibBit$Type;
  }

  interface ContractTypesMap {
    ["LibBit"]: GetContractReturnType<LibBit$Type["abi"]>;
    ["solady/src/utils/LibBit.sol:LibBit"]: GetContractReturnType<LibBit$Type["abi"]>;
  }
}
