import { publicClient, chain } from './chain'
import * as viem from 'viem'
// random
import { abi as randomAbi } from '@gibs/random/artifacts/contracts/Random.sol/Random.json'
import { Random$Type } from "@gibs/random/artifacts/contracts/Random.sol/Random";
// reader
import { abi as readerAbi } from '@gibs/random/artifacts/contracts/Reader.sol/Reader.json'
import { Reader$Type } from "@gibs/random/artifacts/contracts/Reader.sol/Reader";
// multicaller
import { abi as multicallerWithSenderAbi } from '@gibs/random/artifacts/multicaller/src/MulticallerWithSender.sol/MulticallerWithSender.json'
import { MulticallerWithSender$Type } from "@gibs/random/artifacts/multicaller/src/MulticallerWithSender.sol/MulticallerWithSender";
import config from '../config';

const createContracts = () => ({
  multicallerWithSender: viem.getContract({
    client: publicClient,
    abi: multicallerWithSenderAbi as MulticallerWithSender$Type['abi'],
    address: '0x00000000002Fd5Aeb385D324B580FCa7c83823A0',
  }),
  random: viem.getContract({
    client: publicClient,
    abi: randomAbi as Random$Type["abi"],
    address: config.randomness.get(chain.id)!.addresses.random,
  }),
  reader: viem.getContract({
    client: publicClient,
    abi: readerAbi as Reader$Type["abi"],
    address: config.randomness.get(chain.id)!.addresses.reader,
  }),
})

export const addresses = () => ({
  random: config.randomness.get(chain.id)!.addresses.random,
  reader: config.randomness.get(chain.id)!.addresses.reader,
})

let c!: ReturnType<typeof createContracts>

export const token = (address: viem.Hex) => viem.getContract({
  client: publicClient,
  abi: viem.erc20Abi,
  address,
})

export const contracts = () => {
  if (!c) c = createContracts()
  return c
}

export const getLatestBaseFee = async () => {
  const latest = await publicClient.getBlock({
    blockTag: 'latest',
  })
  // increase by 12.5% as a baseline
  return latest.baseFeePerGas! * 9n / 8n
}
