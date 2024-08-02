import { HardhatRuntimeEnvironment } from 'hardhat/types'
import _ from 'lodash'
import * as viem from 'viem'
import hre from 'hardhat'
import * as helpers from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import * as utils from '../lib/utils'

export const contractName = {
  Random: 'contracts/Random.sol:Random',
  Reader: 'contracts/Reader.sol:Reader',
} as const

export const deploy = async () => {
  const random = await hre.viem.deployContract(contractName.Random)
  const reader = await hre.viem.deployContract(contractName.Reader)
  console.log('random=%o', random.address)
  console.log('reader=%o', reader.address)
  const randomnessProviders = await getRandomnessProviders(hre)
  console.log('randomness_providers=%o', randomnessProviders.length)
  return {
    hre,
    random,
    reader,
  }
}

export const deployWithRandomness = async () => {
  const ctx = await helpers.loadFixture(deploy)
  const secretGroups = await writePreimages(ctx)
  return {
    ...ctx,
    secretGroups,
  }
}

export const deployWithAndConsumeRandomness = async () => {
  const ctx = await helpers.loadFixture(deployWithRandomness)
  const [consumer] = await ctx.hre.viem.getWalletClients()
  const [[heat]] = await utils.createPreimages(consumer.account!.address)
  const selections = await selectPreimages(ctx)
  const keys = _.map(selections, 'providerKeyWithIndex')
  const required = 5n
  await ctx.random.write.heat([required, 12n << 1n | 0n, viem.zeroAddress, heat.preimage, keys])
  return {
    ...ctx,
    keys,
    required,
    selections,
    consumer,
    heat,
  }
}

export type Context = Awaited<ReturnType<typeof deploy>>

export const confirmTx = async (prov: Promise<viem.PublicClient>, hash: Promise<viem.WriteContractReturnType>) => {
  const provider = await prov
  const receipt = await provider.waitForTransactionReceipt({
    hash: await hash,
  })
  return receipt
}

export const getRandomnessProviders = async (hre: HardhatRuntimeEnvironment) => {
  const signers = await hre.viem.getWalletClients()
  return signers.slice(12) as viem.WalletClient[]
}

export const writePreimages = async (ctx: Context, index = 0n) => {
  const rand = await ctx.hre.viem.getContractAt(contractName.Random, ctx.random.address)
  const signers = await getRandomnessProviders(ctx.hre)
  return await utils.limiters.signers.map(signers, async (signer: viem.WalletClient) => {
    const secretBatches = await utils.createPreimages(signer.account!.address, index)
    await Promise.all(secretBatches.map(async (secrets) => {
      const preimages = _.map(secrets, 'preimage')
      // const r =
      await confirmTx(ctx.hre.viem.getPublicClient(), rand.write.ink([viem.concatHex(preimages)], {
        account: signer.account,
      }))
    }))
    return secretBatches[0]
  })
}

export const readPreimages = async (ctx: Context, offset = 0n) => {
  // const random = await hre.viem.getContractAt(contractName.Random, address)
  const signers = await getRandomnessProviders(ctx.hre)
  // const provider = await ctx.hre.viem.getPublicClient()
  return await utils.limiters.signers.map(signers, async (signer) => {
    const data = await ctx.reader.read.pointer([
      ctx.random.address,
      signer.account!.address,
      offset,
      // 0n,
    ])
    return utils.dataToPreimages(data)
  })
}

export const selectPreimages = async (ctx: Context, count = 5, offsets = [0n]) => {
  const producers = await getRandomnessProviders(ctx.hre)
  const preimageGroups = await utils.limiters.signers.map(producers, async (producer) => {
    const dataSets = await Promise.all(offsets.map((offset) => (
      ctx.reader.read.pointer([
        ctx.random.address,
        producer.account!.address,
        offset,
      ])
    )))
    return _(dataSets).map(utils.dataToPreimages).map((set, i) => {
      const offset = offsets[i]
      return _.map(set, (item, index) => ({
        signer: producer,
        offset,
        index,
        item,
        providerKeyWithIndex: viem.toHex(BigInt(producer.account!.address) << 96n | offset << 16n | BigInt(index), { size: 32 }),
      }))
    }).flatten().value()
  })
  return _(preimageGroups).flatten().sampleSize(count).value()
}
