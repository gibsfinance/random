// This file was autogenerated by hardhat-viem, do not edit it.
// prettier-ignore
// tslint:disable
// eslint-disable

import "hardhat/types/artifacts";
import type { GetContractReturnType } from "@nomicfoundation/hardhat-viem/types";

import { PreimageLocation$Type } from "./PreimageLocation";

declare module "hardhat/types/artifacts" {
  interface ArtifactsMap {
    ["PreimageLocation"]: PreimageLocation$Type;
    ["contracts/PreimageLocation.sol:PreimageLocation"]: PreimageLocation$Type;
  }

  interface ContractTypesMap {
    ["PreimageLocation"]: GetContractReturnType<PreimageLocation$Type["abi"]>;
    ["contracts/PreimageLocation.sol:PreimageLocation"]: GetContractReturnType<PreimageLocation$Type["abi"]>;
  }
}
