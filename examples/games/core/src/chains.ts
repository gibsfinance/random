import * as viem from 'viem'
import { pulsechain, pulsechainV4 } from 'viem/chains'

/** A local anvil/hardhat node; chainId 31337. */
export const local = {
  id: 31337,
  name: 'Local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
} as const satisfies viem.Chain

export type GamesChainId = 31337 | 943 | 369

export const chains: Record<GamesChainId, viem.Chain> = {
  31337: local,
  943: pulsechainV4,
  369: pulsechain,
}

/** Core Random's deployed address per chain. 943 is the live deployment; local is filled at deploy. */
export const randomAddress: Record<GamesChainId, viem.Hex | undefined> = {
  31337: undefined, // set by the e2e deploy step at runtime
  943: '0x775AF72d62c85d2F7f0Bcc05BAa4Be0830087217',
  369: undefined, // mainnet: not deployed yet — the gate deploys it (DEPLOY_RANDOM=true) once account 0 holds PLS
}

export const defaultRpc: Record<GamesChainId, string> = {
  31337: 'http://127.0.0.1:8545',
  943: 'https://rpc-testnet-pulsechain.g4mm4.io',
  369: 'https://rpc.pulsechain.com',
}
