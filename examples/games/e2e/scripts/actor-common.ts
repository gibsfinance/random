/** Shared plumbing for the off-chain actors (cast-watcher, player-bots). */
import * as viem from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import {
  chains,
  defaultRpc,
  makePublicClient,
  coinFlipAbi,
  raffleAbi,
  type GamesChainId,
} from '@gibs/games-core'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))

export type Deployment = {
  chainId: number
  coinFlip: viem.Hex
  raffle: viem.Hex
  random: viem.Hex
  canonicalSubset: viem.Hex[]
  /** BASE offsets; pools chain at base + n*poolSize (core poolLocationFor). */
  poolOffsets: Record<string, string>
  poolSize: number
  deployBlock: string
}

export const loadDeployment = (chainId: number, configPath?: string): Deployment => {
  const p = configPath ?? path.join(scriptDir, `${chainId}-deployment.json`)
  const config = JSON.parse(fs.readFileSync(p, 'utf8')) as Deployment
  if (!config.coinFlip || !config.raffle || !config.poolSize) {
    throw new Error(`${p} is missing game addresses or poolSize`)
  }
  return config
}

export const makeActor = (chainId: GamesChainId, mnemonic: string, addressIndex: number, rpc?: string) => {
  const account = mnemonicToAccount(mnemonic, { addressIndex })
  const endpoint = rpc || defaultRpc[chainId]
  const publicClient = makePublicClient(chainId, endpoint)
  const wallet = viem.createWalletClient({ account, chain: chains[chainId], transport: viem.http(endpoint) })
  return { account, publicClient, wallet }
}

/** Simulate-then-send with live-chain fee shaping; throws with a one-line reason. */
export const sendAs = async (
  publicClient: ReturnType<typeof makePublicClient>,
  wallet: viem.WalletClient,
  call: { address: viem.Hex; abi: viem.Abi; functionName: string; args: readonly unknown[]; value?: bigint; gas?: bigint },
): Promise<viem.TransactionReceipt> => {
  const gasPrice = await publicClient.getGasPrice()
  const fees = { maxFeePerGas: gasPrice * 2n + gasPrice / 10n, maxPriorityFeePerGas: gasPrice / 10n || 1n }
  const { request } = await publicClient.simulateContract({
    ...call,
    value: call.value ?? 0n,
    account: wallet.account!,
    ...fees,
    ...(call.gas ? { gas: call.gas } : {}),
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash: await wallet.writeContract(request) })
  if (receipt.status !== 'success') throw new Error(`${call.functionName} reverted`)
  return receipt
}

/** All heats since the deployment origin, chronological — the k-th consumed pool slot k. */
export const heatsSince = async (
  publicClient: ReturnType<typeof makePublicClient>,
  config: Deployment,
): Promise<{ key: viem.Hex; blockNumber: bigint }[]> => {
  const from = BigInt(config.deployBlock)
  const [heated, armed] = await Promise.all([
    publicClient.getContractEvents({ address: config.coinFlip, abi: coinFlipAbi, eventName: 'Heated', fromBlock: from }),
    publicClient.getContractEvents({ address: config.raffle, abi: raffleAbi, eventName: 'Armed', fromBlock: from }),
  ])
  return [...heated, ...armed]
    .map((log) => ({ key: (log.args as { key: viem.Hex }).key, blockNumber: log.blockNumber, logIndex: log.logIndex }))
    .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1))
    .map(({ key, blockNumber }) => ({ key, blockNumber }))
}
