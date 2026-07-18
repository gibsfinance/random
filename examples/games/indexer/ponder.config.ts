import { createConfig } from 'ponder'
import { http, type Abi } from 'viem'
// The CoinFlip/Raffle ABIs come from games-core (it resolves the @gibs/random artifacts reliably).
import { coinFlipAbi, raffleAbi } from '@gibs/games-core'
// SudokuLog isn't re-exported by games-core, so its ABI comes straight from the compiled artifact —
// same source games-core uses for CoinFlip/Raffle (`Artifact.abi as viem.Abi`).
import SudokuLogArtifact from '../../../packages/contracts/artifacts/contracts/games/SudokuLog.sol/SudokuLog.json'

const sudokuLogAbi = SudokuLogArtifact.abi as Abi

// The CoinFlip + Raffle game contracts on PulseChain testnet v4 (943). These were deployed by the
// games gate run (examples/games/e2e/scripts/943-deployment.json), not ignition — so the addresses
// are pinned here. startBlock is the games' deploy block (matches the web config's deployBlock).
const COIN_FLIP = '0x8d3a58d77d22636026066200f8868cd653ec2b2a'
const RAFFLE = '0x33f506fafe4f05c8de9a07e1c8a7f73f50f1da36'
const START_BLOCK = 24_645_214

// The ZK-Sudoku on-chain leaderboard (SudokuLog) is deployed on both PulseChain testnet v4 (943) and
// PulseChain mainnet (369). Addresses are pinned per network; startBlock is the exact SudokuLog
// deploy block on each chain, found via an eth_getCode binary search (first block with contract code).
const SUDOKU_LOG_943 = '0xf700e0c1fd235719738cca1cdef6f41bfaef163c'
const SUDOKU_LOG_369 = '0x939cbb0f10b5f9e76861a179fbe666e1cae50ba7'
const SUDOKU_START_BLOCK_943 = 24_898_763
const SUDOKU_START_BLOCK_369 = 27_063_003

export default createConfig({
  networks: {
    pulsechainV4: {
      chainId: 943,
      transport: http(process.env.PONDER_RPC_URL_943),
    },
    pulsechain: {
      chainId: 369,
      transport: http(process.env.PONDER_RPC_URL_369),
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
    // Multi-network contract: the same SudokuLog leaderboard indexed on both chains. The per-network
    // object overrides address + startBlock; handlers read `context.network.chainId` to tag rows.
    SudokuLog: {
      abi: sudokuLogAbi,
      network: {
        pulsechainV4: {
          address: SUDOKU_LOG_943,
          startBlock: SUDOKU_START_BLOCK_943,
        },
        pulsechain: {
          address: SUDOKU_LOG_369,
          startBlock: SUDOKU_START_BLOCK_369,
        },
      },
    },
  },
})
