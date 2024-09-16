import config from '../config'
import * as viem from 'viem'
import * as chains from 'viem/chains'

const target = Object.entries(chains).find(([k, c]) => (
  c.id === Number(config.chainId)
))!

export const name = target[0]

export const chain = target[1]

export const transport = viem.http(process.env.RPC_943_0 || chain.rpcUrls.default.http[0])

export const publicClient = viem.createPublicClient({
  chain,
  transport,
})
