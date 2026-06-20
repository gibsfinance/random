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
  /** MsgBoard archive (GraphiQL) base URL — the venue's coordination-notice trail. */
  archive?: string
  /** RPC whose node runs the `msgboard_` module (valve.city) — used to read the live session-game
   *  feed (and, later, to broadcast play). Reads need no proof-of-work; the demo key is fine. */
  boardRpc?: string
  /** GraphQL URL of the games Ponder indexer (@gibs/games-indexer). When set, the frontend reads
   *  rounds from it instead of scraping eth_getLogs. Unset → incremental/chunked getLogs fallback. */
  gamesIndexer?: string
  /** Chips ERC-20 token address — the currency used by the session-game escrow. */
  chips?: viem.Hex
  /** HouseChannel contract address — the EIP-712 `verifyingContract` for session-state co-signatures.
   *  Sessions use `makeDomain(chainId, houseChannel)` so co-signed states bind to the on-chain
   *  settlement contract (the player's worst case is always "reclaim my stake" via disputeFromOpen). */
  houseChannel?: viem.Hex
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
    // Read 943 through our own valve.city node (archive + CORS for this origin) instead of the flaky
    // public RPCs the core registry defaults to (g4mm4 / rpc.v4.testnet were failing "Failed to
    // fetch" in the browser → no rounds shown). vk_demo is the public demo key; a domain-scoped
    // games.msgboard.xyz/rpc proxy (key server-side) is the planned follow-up.
    rpc: 'https://one.valve.city/rpc/vk_demo/evm/943',
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
    archive: 'https://archive.msgboard.xyz',
    boardRpc: 'https://one.valve.city/rpc/vk_demo/evm/943',
    // Ponder indexer (deploy/games-indexer on the msgboard box) — CoinFlip+Raffle logs served as
    // GraphQL under the already-resolving games host, so the lobby/round views read from one indexed
    // query per poll instead of scanning the chain (was hammering the RPC into 429s). Full GraphQL URL.
    gamesIndexer: 'https://games.msgboard.xyz/games-indexer/graphql',
    // Chips ERC-20 token (deployed 2026-06-10 gate run).
    chips: '0xA5276259e544C86438566cB28cc87daCce060910',
    // patched HouseChannel (gameId-binding + disputeFromOpen + gameId-in-Opened), deployed 943 @ block 24708662
    houseChannel: '0x74bbc31e77c02593c0a7aad0cadadb5b6bff3948',
  },
  // Deployed by the 2026-06-11 mainnet bring-up (gate run + ink-pools; e2e/scripts/369-deployment.json).
  // deployBlock = the web pools' ink block so the site and the cast watcher count heats
  // from the same origin (the gate's own bring-up games predate it on purpose).
  {
    chainId: 369,
    label: 'PulseChain',
    coinFlip: '0x66bdacfdd918f9d4c29f0a7d26609912ab478f4d',
    raffle: '0x004564d44E6921FFA68936F44ae58988Cd146b10',
    random: '0x87fc31413534733a09df5dc5aa33b4dba1f64b61',
    // Read mainnet through our own valve.city node (same reasoning as 943 above).
    rpc: 'https://one.valve.city/rpc/vk_demo/evm/369',
    canonicalSubset: [
      '0xAe96b0748f933914867d59486251043790cB2896',
      '0x2a638D7135966a5cA1973c930bD0317cd7d6874c',
      '0x0D3148A85608708Fe944EE71E13B4C9181b7cc83',
    ],
    poolOffsets: {
      '0xae96b0748f933914867d59486251043790cb2896': '4',
      '0x2a638d7135966a5ca1973c930bd0317cd7d6874c': '2',
      '0x0d3148a85608708fe944ee71e13b4c9181b7cc83': '2',
    },
    deployBlock: '26757758',
    poolSize: 64,
    explorer: 'https://scan.pulsechain.com/#',
    archive: 'https://archive.msgboard.xyz',
    boardRpc: 'https://one.valve.city/rpc/vk_demo/evm/369',
  },
]
