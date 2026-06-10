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
  /** Per-provider pool offsets for building heat locations (advances as preimages are consumed). */
  poolOffsets: Record<string, string>
  /** Scan events from here (the deploy block) to keep live-chain scans cheap. */
  deployBlock: string
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
  // 943 lights up after the live parity-gate run: fill these from the README run log.
  // {
  //   chainId: 943, label: 'PulseChain testnet v4',
  //   coinFlip: '0x…', raffle: '0x…', random: '0x775AF72d62c85d2F7f0Bcc05BAa4Be0830087217',
  //   canonicalSubset: ['0x…', '0x…', '0x…'], poolOffsets: {}, deployBlock: '0',
  //   explorer: 'https://scan.v4.testnet.pulsechain.com',
  // },
]
