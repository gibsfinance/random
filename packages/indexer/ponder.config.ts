import { createConfig } from "@ponder/core";
import deployedAddresses from '@gibs/random/ignition/deployments/chain-943/deployed_addresses.json'
import { abi as randomAbi } from '@gibs/random/artifacts/contracts/Random.sol/Random.json'
import { abi as readerAbi } from '@gibs/random/artifacts/contracts/Reader.sol/Reader.json'
import * as viem from 'viem'
import { Random$Type } from "@gibs/random/artifacts/contracts/Random.sol/Random";
import { Reader$Type } from "@gibs/random/artifacts/contracts/Reader.sol/Reader";

const addresses = deployedAddresses as {
  [k in keyof typeof deployedAddresses]: viem.Hex;
}

export default createConfig({
  database: {
    kind: 'postgres',
  },
  networks: {
    pulsechainV4: {
      chainId: 943,
      transport: viem.http(process.env.PONDER_RPC_URL_943),
    },
  },
  contracts: {
    Random: {
      network: "pulsechainV4",
      abi: randomAbi as Random$Type["abi"],
      address: addresses["RandomModule#Random"],
      startBlock: 19_993_273,
      includeCallTraces: true,
      includeTransactionReceipts: true,
    },
    Reader: {
      network: "pulsechainV4",
      abi: readerAbi as Reader$Type["abi"],
      address: addresses["ReaderModule#Reader"],
      startBlock: 19_993_281,
      includeTransactionReceipts: true,
    },
    Consumer: {
      network: "pulsechainV4",
      abi: readerAbi as Reader$Type["abi"],
      address: addresses["ConsumerModule#Consumer"],
      startBlock: 19_993_290,
      includeCallTraces: true,
      includeTransactionReceipts: true,
    },
  },
});
