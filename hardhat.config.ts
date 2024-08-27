import { task, type HardhatUserConfig } from "hardhat/config";
import * as viem from 'viem'
import '@solidstate/hardhat-4byte-uploader'
import { HARDHAT_NETWORK_MNEMONIC, defaultHdAccountsConfigParams } from 'hardhat/internal/core/config/default-config'
import "@nomicfoundation/hardhat-toolbox-viem";
import '@nomicfoundation/hardhat-viem'
import '@nomicfoundation/hardhat-chai-matchers'
import 'hardhat-tracer'
import 'solidity-coverage'
import 'hardhat-gas-reporter'
import 'hardhat-dependency-compiler'
// import '@nomicfoundation/hardhat-verify'`
// import { main as ink } from './tasks/ink'
import { bigint, string } from "hardhat/internal/core/params/argumentTypes";

Error.stackTraceLimit = Infinity

const { env } = process

// task('ink', 'writes data on chain')
//   .addOptionalParam('token', 'the token to require as payment', viem.zeroAddress, string)
//   .addOptionalParam('price', 'name the price of each preimage', 0n, bigint)
//   .addOptionalParam('random', 'the contract to look at')
//   .setAction(ink)

const config: HardhatUserConfig = {
  solidity: {
    compilers: [{
      version: "0.8.25",
      settings: {
        viaIR: true,
        evmVersion: 'cancun',
        optimizer: {
          enabled: true,
          runs: 1_000,
        },
      },
    }],
  },
  paths: {
    sources: './contracts',
    artifacts: './artifacts',
  },
  networks: {
    hardhat: {
      accounts: {
        ...defaultHdAccountsConfigParams,
        accountsBalance: ((10n ** 18n) * (10n ** 9n)).toString(),
        mnemonic: env.MNEMONIC || HARDHAT_NETWORK_MNEMONIC,
        count: 20, // 512
        // path:
      },
      enableTransientStorage: true,
      allowUnlimitedContractSize: false,
      // forking: {
      //   url: 'https://rpc-pulsechain.g4mm4.io',
      //   blockNumber: 21_074_800,
      // },
      hardfork: 'cancun',
      chainId: 1,
    },
    pulsechainV4: {
      url: 'https://rpc.v4.testnet.pulsechain.com',
      accounts: {
        mnemonic: env.MNEMONIC || HARDHAT_NETWORK_MNEMONIC,
      },
    },
    pulsechain: {
      url: 'https://rpc.v4.testnet.pulsechain.com',
      accounts: {
        mnemonic: env.MNEMONIC || HARDHAT_NETWORK_MNEMONIC,
      },
    },
  },
  mocha: {
    timeout: 180_000,
  },
  fourByteUploader: {
    runOnCompile: process.env.BYTE4 === 'true',
  },
  dependencyCompiler: {
    paths: [
      'multicaller/src/MulticallerEtcher.sol',
      'multicaller/src/MulticallerWithSender.sol',
      'multicaller/src/MulticallerWithSigner.sol',
    ],
  },
  etherscan: {
    enabled: true,
    customChains: [{
      network: 'pulsechain',
      chainId: 369,
      urls: {
        apiURL: 'https://api.scan.pulsechain.com/api',
        browserURL: 'https://scan.pulsechain.com/#',
      },
    }, {
      network: 'pulsechainV4',
      chainId: 943,
      urls: {
        apiURL: 'https://api.scan.v4.testnet.pulsechain.com/api',
        browserURL: 'https://scan.v4.testnet.pulsechain.com/#',
      },
    }],
    apiKey: {
      mainnet: env.ETHERSCAN_API_KEY!,
      pulsechainV4: 'abc',
      pulsechain: 'abc',
    },
  },
  sourcify: {
    enabled: true,
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
    L1: 'ethereum',
    coinmarketcap: env.GAS_COINMARKETCAP,
    L1Etherscan: env.ETHERSCAN_API_KEY,
    L2Etherscan: env.ETHERSCAN_API_KEY,
    gasPrice: 100_000,
    baseFee: 100_000,
    tokenPrice: '0.00004',
    currencyDisplayPrecision: 8,
    reportFormat: 'terminal',
    // showMethodSig: true,
    trackGasDeltas: true,
  },
};

export default config;
