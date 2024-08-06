import type { HardhatUserConfig } from "hardhat/config";
import '@solidstate/hardhat-4byte-uploader'
import { HARDHAT_NETWORK_MNEMONIC, defaultHdAccountsConfigParams } from 'hardhat/internal/core/config/default-config'
import "@nomicfoundation/hardhat-toolbox-viem";
import '@nomicfoundation/hardhat-viem'
import '@nomicfoundation/hardhat-chai-matchers'
import 'hardhat-tracer'
import 'solidity-coverage'
// import '@nomicfoundation/hardhat-verify'
Error.stackTraceLimit = Infinity

const { env } = process

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    hardhat: {
      accounts: {
        ...defaultHdAccountsConfigParams,
        accountsBalance: ((10n ** 18n) * (10n ** 9n)).toString(),
        mnemonic: env.MNEMONIC || HARDHAT_NETWORK_MNEMONIC,
        count: 20, // 512
        // path:
      },
      allowUnlimitedContractSize: false,
      // forking: {
      //   url: 'https://rpc-pulsechain.g4mm4.io',
      //   blockNumber: 21_074_800,
      // },
    },
  },
  fourByteUploader: {
    // runOnCompile: true,
  },
};

export default config;
