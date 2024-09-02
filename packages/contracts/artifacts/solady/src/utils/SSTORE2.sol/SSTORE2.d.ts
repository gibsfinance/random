// This file was autogenerated by hardhat-viem, do not edit it.
// prettier-ignore
// tslint:disable
// eslint-disable

import type { Address } from "viem";
import type { GetContractReturnType } from "@nomicfoundation/hardhat-viem/types";
import "@nomicfoundation/hardhat-viem/types";

export interface SSTORE2$Type {
  "_format": "hh-sol-artifact-1",
  "contractName": "SSTORE2",
  "sourceName": "solady/src/utils/SSTORE2.sol",
  "abi": [
    {
      "inputs": [],
      "name": "DeploymentFailed",
      "type": "error"
    }
  ],
  "bytecode": "0x6080806040523460175760399081601c823930815050f35b5f80fdfe5f80fdfea2646970667358221220c714050a8f0fbf37599c479ee146450a7c26c2084f0c1f38026287a5d58e4ebb64736f6c63430008190033",
  "deployedBytecode": "0x5f80fdfea2646970667358221220c714050a8f0fbf37599c479ee146450a7c26c2084f0c1f38026287a5d58e4ebb64736f6c63430008190033",
  "linkReferences": {},
  "deployedLinkReferences": {}
}

declare module "@nomicfoundation/hardhat-viem/types" {
  export function deployContract(
    contractName: "SSTORE2",
    constructorArgs?: [],
    config?: DeployContractConfig
  ): Promise<GetContractReturnType<SSTORE2$Type["abi"]>>;
  export function deployContract(
    contractName: "solady/src/utils/SSTORE2.sol:SSTORE2",
    constructorArgs?: [],
    config?: DeployContractConfig
  ): Promise<GetContractReturnType<SSTORE2$Type["abi"]>>;

  export function sendDeploymentTransaction(
    contractName: "SSTORE2",
    constructorArgs?: [],
    config?: SendDeploymentTransactionConfig
  ): Promise<{
    contract: GetContractReturnType<SSTORE2$Type["abi"]>;
    deploymentTransaction: GetTransactionReturnType;
  }>;
  export function sendDeploymentTransaction(
    contractName: "solady/src/utils/SSTORE2.sol:SSTORE2",
    constructorArgs?: [],
    config?: SendDeploymentTransactionConfig
  ): Promise<{
    contract: GetContractReturnType<SSTORE2$Type["abi"]>;
    deploymentTransaction: GetTransactionReturnType;
  }>;

  export function getContractAt(
    contractName: "SSTORE2",
    address: Address,
    config?: GetContractAtConfig
  ): Promise<GetContractReturnType<SSTORE2$Type["abi"]>>;
  export function getContractAt(
    contractName: "solady/src/utils/SSTORE2.sol:SSTORE2",
    address: Address,
    config?: GetContractAtConfig
  ): Promise<GetContractReturnType<SSTORE2$Type["abi"]>>;
}
