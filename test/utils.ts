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
  const signers = await hre.viem.getWalletClients()
  console.log('randomness_providers=%o', randomnessProviders.length)
  return {
    signers,
    randomnessProviders,
    hre,
    random,
    reader,
  }
}

export const deployWithRandomness = async () => {
  const ctx = await helpers.loadFixture(deploy)
  const secretGroups = await writePreimages(ctx)
  const secretByPreimage = new Map(
    _(secretGroups).flatten().map(({ preimage, secret }) => ([
      preimage, secret,
    ] as const)).value()
  )
  return {
    ...ctx,
    secretGroups,
    secretByPreimage,
  }
}

export const deployWithAndConsumeRandomness = async () => {
  const ctx = await helpers.loadFixture(deployWithRandomness)
  const [consumer] = await ctx.hre.viem.getWalletClients()
  const [[heat]] = await utils.createPreimages(consumer.account!.address)
  const provider = await ctx.hre.viem.getPublicClient()
  const blockBeforeHeat = await provider.getBlock({
    blockTag: 'latest',
  })
  const selections = await selectPreimages(ctx)
  const required = 5n
  const heatTx = await ctx.random.write.heat([
    required,
    12n << 1n | 0n,
    viem.zeroAddress,
    heat.preimage,
    selections,
  ])
  const receipt = await confirmTx(ctx, heatTx)
  const r = await provider.getTransactionReceipt({
    hash: receipt,
  })
  const randomnessStarts = await ctx.random.getEvents.RandomnessStart({}, {
    blockHash: r.blockHash,
  })
  return {
    ...ctx,
    required,
    selections,
    consumer,
    heat,
    blockBeforeHeat,
    randomnessStarts,
  }
}

export type Context = Awaited<ReturnType<typeof deploy>>

export const confirmTx = async (ctx: Context, hash: Promise<viem.WriteContractReturnType> | viem.WriteContractReturnType) => {
  const provider = await ctx.hre.viem.getPublicClient()
  const receipt = await provider.waitForTransactionReceipt({
    hash: await hash,
  })
  return receipt.transactionHash
}

export const getRandomnessProviders = async (hre: HardhatRuntimeEnvironment) => {
  const signers = await hre.viem.getWalletClients()
  return signers.slice(12) as viem.WalletClient[]
}

export const writePreimages = async (ctx: Context, index = 0n, token = viem.zeroAddress, price = utils.defaultPrice) => {
  const rand = await ctx.hre.viem.getContractAt(contractName.Random, ctx.random.address)
  const signers = await getRandomnessProviders(ctx.hre)
  return await utils.limiters.signers.map(signers, async (signer: viem.WalletClient) => {
    const secretBatches = await utils.createPreimages(signer.account!.address, index)
    await Promise.all(secretBatches.map(async (secrets) => {
      const preimages = _.map(secrets, 'preimage')
      // const r =
      await confirmTx(ctx, rand.write.ink(
        [token, price, viem.concatHex(preimages)], {
        account: signer.account,
      }))
    }))
    return secretBatches[0]
  })
}

export const readPreimages = async (ctx: Context, options: utils.PreimageInfoOptions = utils.defaultPreImageInfo) => {
  const signers = await getRandomnessProviders(ctx.hre)
  return await utils.limiters.signers.map(signers, async (signer) => {
    const data = await ctx.reader.read.pointer([
      ctx.random.address,
      {
        ...utils.defaultPreImageInfo,
        ...options,
        provider: signer.account!.address,
      },
    ])
    return utils.dataToPreimages(data)
  })
}

export const selectPreimages = async (ctx: Context, count = 5, offsets: utils.PreimageInfoOptions[] = [utils.defaultPreImageInfo]) => {
  const producers = await getRandomnessProviders(ctx.hre)
  const preimageGroups = await utils.limiters.signers.map(producers, async (producer) => {
    const iterations = offsets.map((options) => ({
      ...utils.defaultPreImageInfo,
      ...options,
      provider: producer.account!.address,
    }))
    const dataSets = await Promise.all(iterations.map((options) => (
      ctx.reader.read.pointer([
        ctx.random.address,
        options,
      ])
    )))
    return _(dataSets).map(utils.dataToPreimages).map((set, i) => {
      const offset = iterations[i]
      return _.map(set, (preimage, index) => ({
        ...utils.defaultPreImageInfo,
        ...offset,
        signer: producer,
        preimage,
        index: BigInt(index),
      } as utils.PreimageInfo & {
        signer: viem.WalletClient;
        preimage: viem.Hex;
      }))
    }).flatten().value()
  })
  return _(preimageGroups).flatten().sampleSize(count).value()
}
