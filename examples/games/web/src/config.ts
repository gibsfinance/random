import * as viem from 'viem'
import type { GamesChainId } from '@gibs/games-core'

/** A chain the app can play on: the game deployments plus the canonical validator subset. */
export type GameDeployment = {
  chainId: GamesChainId
  label: string
  coinFlip: viem.Hex
  raffle: viem.Hex
  random: viem.Hex
  /** The recommended subset fed to makePresets — the spec's liquidity nudge, not a whitelist. */
  canonicalSubset: viem.Hex[]
  /** Per-provider BASE pool offsets; pools chain at base + n*poolSize (model/pools.ts). */
  poolOffsets: Record<string, string>
  /** Preimages per pool — the rotation modulus shared with the off-chain actors. */
  poolSize: number
  /** Scan events from here (the deploy block) to keep live-chain scans cheap. */
  deployBlock: string
  /** Override the read RPC (e.g. the valve.city fleet endpoint); defaults to the core registry's. */
  rpc?: string
  explorer?: string
}

/**
 * The local deployment is written by `pnpm dev:seed` (scripts/dev-local.ts) into
 * src/generated/local.json — absent until the harness runs, hence the guarded glob import.
 */
const generated = import.meta.glob('./generated/local.json', { eager: true }) as Record<
  string,
  { default: Omit<GameDeployment, 'label'> }
>
const local = Object.values(generated)[0]?.default

export const deployments: GameDeployment[] = [
  ...(local ? [{ ...local, label: 'Local (anvil)' }] : []),
  // Deployed by the 2026-06-10 live parity-gate run + ink-pools (e2e/scripts/943-deployment.json).
  {
    chainId: 943,
    label: 'PulseChain testnet v4',
    coinFlip: '0x8d3a58d77d22636026066200f8868cd653ec2b2a',
    raffle: '0x33f506fafe4f05c8de9a07e1c8a7f73f50f1da36',
    random: '0x775AF72d62c85d2F7f0Bcc05BAa4Be0830087217',
    canonicalSubset: [
      '0xAe96b0748f933914867d59486251043790cB2896',
      '0x2a638D7135966a5cA1973c930bD0317cd7d6874c',
      '0x0D3148A85608708Fe944EE71E13B4C9181b7cc83',
    ],
    poolOffsets: {
      '0xae96b0748f933914867d59486251043790cb2896': '34',
      '0x2a638d7135966a5ca1973c930bd0317cd7d6874c': '34',
      '0x0d3148a85608708fe944ee71e13b4c9181b7cc83': '18',
    },
    deployBlock: '24645214',
    poolSize: 64,
    explorer: 'https://scan.v4.testnet.pulsechain.com/#',
  },
]
