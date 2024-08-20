import { HardhatNetworkAccountsUserConfig, HardhatNetworkForkingUserConfig } from 'hardhat/types'
import * as viem from 'viem'
// import type * as hre from './hre'
// import * as viem from 'viem'
// type Viem = typeof viem
// export type HRE = {
//   viem: Viem & {
//     getPublicClient(): viem.PublicClient
//     getWalletClient(): viem.PublicClient
//   }
// }

export interface Args {
  network: string;
  task: string;
}

// export interface Task {
//   main(args: Args, hre: HRE): Promise<void>;
// }

export type SupportedChainId = 369 | 943

export type Update = [string, any]

export type NetworkKey = `chain-${SupportedChainId}`

export type Config = Readonly<{
  externalSigner?: boolean;
  chain: viem.Chain;
  // defaultNetwork: NetworkKey;
  // network: NetworkKey;
  chains: Map<NetworkKey, viem.Chain>;
  // chainByNetworkKey: Record<NetworkKey, Chain>;
  txBackfillLimit: number;
  highGasLimit: bigint;
  /** the number of blocks to scan during event collection */
  maxBlockRange: number;
  /** the number of bridges to be pushing onto rpc at the same time */
  txOutstanding: number;
  /**
   * for actions that could be underpriced, rechecking the price of previously underpriced tokens is not feasible every iteration of a loop
   */
  underpricedRecheckDelay: number;
  /**
   * eventually the bot should stop rechecking underpriced asks
   */
  underpricedRecheckLimit: number;
  /**
   * the limit to the size of a batch of unchecked transactions
   * that should be checked on any given iteration
   */
  txChecking: number;
  /**
   * if the transaction will fail - as of dry run,
   * do not write that failure on chain
   */
  ignoreDryRun: boolean;
  /**
   * consider a transaction stalled and reprice it after 120k ms (2min)
   * generally this should be a factor of the rate of change of the base fee (12.5%)
   * and the gas factor, which provides a window through which the
   */
  stalledAfter: number;
  /**
   * gas numbers are out of 10k
   * amount greater, with 10k as 1, than last attempt - exponential
   */
  resendGasFactorIncrease: bigint;
  /**
   * over block base fee: x/10k
   * in this case, the latest block's base fee will be taken, and it will be 2x'd
   */
  gasFactor: bigint;
  /**
   * a factor to increase gas limit values by.
   * should only be used in code when exclusive access or
   * consistent gas costs will occur.
   * conditions in contracts and non exclusive access confound gas limits
   */
  gasLimitFactor: bigint;
  /** take the base fee, and apply a 1% priority fee to it */
  priorityFeeFactor: bigint;
  /** the absolute maximum base fee that will be submitted to rpc */
  maxBaseFee: bigint;
  /**
   * the max priority fee as a factor of the base fee out of 10k
   * while the ratio is usually a factor of the `priorityFeeFactor`,
   * if max base fees start increasing to the point where they are
   * hitting the `maxBaseFee`, the priority fee can start increasing as well
   * up to this ratio: x/10k - by default 1% max priority fee
   */
  maxPriorityToBaseFeeRatio: bigint;
  /**
   * when gas pricing for an attempt is being determined, if a previous priority fee was provided,
   * then increase by the following basis points (11_000 == 110% of last)
   */
  lastPriorityFeeFactor: bigint;
  minPriorityFeePerGas: bigint;
  blockDelayRotation?: number;
  hardhat: {
    chainId?: number;
    accounts: HardhatNetworkAccountsUserConfig;
    forking: HardhatNetworkForkingUserConfig;
  };
  database: {
    /** name must match the docker compose db name  */
    name: string;
    schema: string;
    ssl?: boolean;
    url: string;
  };
  files: {
    ofac: string;
    blocklist: string;
  };
  printRecent: boolean;
}>

// export type HRE = typeof hre

export type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T;
