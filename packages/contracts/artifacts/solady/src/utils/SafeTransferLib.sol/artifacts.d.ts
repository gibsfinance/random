// This file was autogenerated by hardhat-viem, do not edit it.
// prettier-ignore
// tslint:disable
// eslint-disable

import "hardhat/types/artifacts";
import type { GetContractReturnType } from "@nomicfoundation/hardhat-viem/types";

import { SafeTransferLib$Type } from "./SafeTransferLib";

declare module "hardhat/types/artifacts" {
  interface ArtifactsMap {
    ["SafeTransferLib"]: SafeTransferLib$Type;
    ["solady/src/utils/SafeTransferLib.sol:SafeTransferLib"]: SafeTransferLib$Type;
  }

  interface ContractTypesMap {
    ["SafeTransferLib"]: GetContractReturnType<SafeTransferLib$Type["abi"]>;
    ["solady/src/utils/SafeTransferLib.sol:SafeTransferLib"]: GetContractReturnType<SafeTransferLib$Type["abi"]>;
  }
}
