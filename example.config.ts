import { HARDHAT_NETWORK_MNEMONIC } from 'hardhat/internal/core/config/default-config'
import * as types from './src/types'
import * as viem from 'viem'
import { pulsechain, pulsechainV4 } from 'viem/chains'
import {
  HardhatNetworkAccountsUserConfig,
  HardhatNetworkForkingUserConfig,
} from 'hardhat/types'
import _ from 'lodash'

import { Config } from './src/types'

const {
  PRIVATE_KEY,
  MNEMONIC,
  FORKING_BLOCK_NUMBER,
  DATABASE_NAME,
  DATABASE_SSL,
  DATABASE_URL,
} = process.env

const initialBalance = (1_000_000_000n * (10n ** 18n)).toString()
const blockExplorerApiKeys = {
  all: 'abc',
}

const setValues = (chain: viem.Chain, [key, value]: types.Update) => _.set(chain, key, value)

const chains = new Map<types.NetworkKey, viem.Chain>([
  [`chain-${369}`, ([
    ['rpcUrls.default.http.1', 'https://rpc-pulsechain.g4mm4.io'],
  ] as types.Update[]).reduce(setValues, pulsechain)],
  [`chain-${943}`, ([
    ['rpcUrls.default.http.1', 'https://rpc-testnet-pulsechain.g4mm4.io'],
  ] as types.Update[]).reduce(setValues, pulsechainV4)],
])

const defaultNetwork = `chain-${pulsechain.id}`
process.env.NETWORK = process.env.NETWORK || defaultNetwork
const NETWORK = process.env.NETWORK as unknown as types.NetworkKey
const chain = chains.get(NETWORK) as viem.Chain

export default {
  externalSigner: false,
  chains,
  chain,
  network: NETWORK,
  highGasLimit: 3_000_000n,
  // the number of transactions to query data for at a time that do not have gas data (previously not collected)
  txBackfillLimit: 100,
  // delay a subsequent attempt check a minimum of 2 mins after the previous
  underpricedRecheckDelay: 120_000,
  // for underpriced attempts, stop checking if they are still underpriced after 1k attempts
  underpricedRecheckLimit: 1_000,
  // limit the number of blocks that can be queried to 1k at a time
  maxBlockRange: 1000,
  // limit the number of transactions that have been sent to the network to 4
  txOutstanding: 4,
  // limit the number of transactions / possible events that can be checked to 1k at a time
  txChecking: 1_000,
  ignoreDryRun: false,
  // consider a transaction stalled if it is not mined within ms
  stalledAfter: 40_000,
  // increase gas on next try 20%
  resendGasFactorIncrease: 2_000n,
  // use a base fee 50% larger than the latest block base fee
  gasFactor: 15_000n,
  // increase the gas limit from any remote estimation by 20%
  gasLimitFactor: 12_000n,
  // make the priority fee 5% of the base fee (after factor increase)
  priorityFeeFactor: 500n,
  // do not allow the base fee to go above this number (very high)
  maxBaseFee: 10n ** 16n,
  // do not allow the priority fee to be greater than 10% of the max fee
  maxPriorityToBaseFeeRatio: 1_000n,
  // increase the priority fee by 10% each retry
  lastPriorityFeeFactor: 11_000n,
  // enforce a lower bound for the priority fee
  minPriorityFeePerGas: 100_000_000n,
  // the number of blocks to wait until a new validator steps in to verify transactions
  blockDelayRotation: 6,
  hardhat: {
    chainId: _.get(chain, 'id') || 31337,
    accounts: (viem.isHex(PRIVATE_KEY, { strict: true }) ? [{
      privateKey: PRIVATE_KEY,
      balance: initialBalance,
    }] : {
      mnemonic: MNEMONIC as string || HARDHAT_NETWORK_MNEMONIC,
      accountsBalance: initialBalance,
    }) as HardhatNetworkAccountsUserConfig,
    forking: {
      enabled: true,
      blockNumber: (+(FORKING_BLOCK_NUMBER as string)),
      url: _.get(chain, 'rpcUrls.default.http.0'),
    } as HardhatNetworkForkingUserConfig,
  },
  explorer: {
    apiKey: blockExplorerApiKeys.all,
  },
  database: {
    name: DATABASE_NAME || 'bridgevalidator',
    schema: 'public',
    ssl: (DATABASE_SSL === 'false' || DATABASE_SSL === 'f' || DATABASE_SSL === '0') ? false
      : (DATABASE_SSL === 't' || DATABASE_SSL === '1' || DATABASE_SSL === 'true' || !!DATABASE_SSL),
    url: DATABASE_URL || 'postgres://bridgevalidator:password@localhost:5432/bridgevalidator',
  },
  files: {
    blocklist: 'blocklist.csv',
    ofac: 'ofac.xml',
  },
  printRecent: true,
} as Config
