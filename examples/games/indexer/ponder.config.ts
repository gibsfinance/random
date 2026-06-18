import { createConfig } from 'ponder'
import { http } from 'viem'
// The CoinFlip/Raffle ABIs come from games-core (it resolves the @gibs/random artifacts reliably).
import { coinFlipAbi, raffleAbi } from '@gibs/games-core'

// The CoinFlip + Raffle game contracts on PulseChain testnet v4 (943). These were deployed by the
// games gate run (examples/games/e2e/scripts/943-deployment.json), not ignition — so the addresses
// are pinned here. startBlock is the games' deploy block (matches the web config's deployBlock).
const COIN_FLIP = '0x8d3a58d77d22636026066200f8868cd653ec2b2a'
const RAFFLE = '0x33f506fafe4f05c8de9a07e1c8a7f73f50f1da36'
const START_BLOCK = 24_645_214

export default createConfig({
  networks: {
    pulsechainV4: {
      chainId: 943,
      transport: http(process.env.PONDER_RPC_URL_943),
    },
  },
  contracts: {
    CoinFlip: {
      network: 'pulsechainV4',
      abi: coinFlipAbi,
      address: COIN_FLIP,
      startBlock: START_BLOCK,
    },
    Raffle: {
      network: 'pulsechainV4',
      abi: raffleAbi,
      address: RAFFLE,
      startBlock: START_BLOCK,
    },
  },
})
