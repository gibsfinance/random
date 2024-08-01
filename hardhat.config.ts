import type { HardhatUserConfig } from "hardhat/config";
import '@solidstate/hardhat-4byte-uploader'
import { HARDHAT_NETWORK_MNEMONIC } from 'hardhat/internal/core/config/default-config'
import "@nomicfoundation/hardhat-toolbox-viem";
import '@nomicfoundation/hardhat-viem'
import '@nomicfoundation/hardhat-chai-matchers'
// import '@nomicfoundation/hardhat-verify'

const { env } = process

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    hardhat: {
      accounts: {
        accountsBalance: ((10n ** 18n) * (10n ** 9n)).toString(),
        mnemonic: env.MNEMONIC || HARDHAT_NETWORK_MNEMONIC,
        count: 13, // 512
      },
    },
  },
  fourByteUploader: {
    // runOnCompile: true,
  },
};

export default config;
