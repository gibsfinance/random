// This file was autogenerated by hardhat-viem, do not edit it.
// prettier-ignore
// tslint:disable
// eslint-disable

import "hardhat/types/artifacts";
import type { GetContractReturnType } from "@nomicfoundation/hardhat-viem/types";

import { EfficientHashLib$Type } from "./EfficientHashLib";

declare module "hardhat/types/artifacts" {
  interface ArtifactsMap {
    ["EfficientHashLib"]: EfficientHashLib$Type;
    ["solady/src/utils/EfficientHashLib.sol:EfficientHashLib"]: EfficientHashLib$Type;
  }

  interface ContractTypesMap {
    ["EfficientHashLib"]: GetContractReturnType<EfficientHashLib$Type["abi"]>;
    ["solady/src/utils/EfficientHashLib.sol:EfficientHashLib"]: GetContractReturnType<EfficientHashLib$Type["abi"]>;
  }
}
