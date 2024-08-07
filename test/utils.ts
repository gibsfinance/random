import { HardhatRuntimeEnvironment } from 'hardhat/types'
import _ from 'lodash'
import * as viem from 'viem'
import hre from 'hardhat'
import * as helpers from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import * as utils from '../lib/utils'

export const contractName = {
  Random: 'contracts/Random.sol:Random',
  Reader: 'contracts/Reader.sol:Reader',
  ERC20: 'contracts/test/ERC20.sol:ERC20',
  ERC20Solady: 'solady/src/tokens/ERC20.sol:ERC20',
} as const

export const deploy = async () => {
  const errors = await hre.viem.getContractAt('Errors', viem.zeroAddress)
  const random = await hre.viem.deployContract(contractName.Random)
  const reader = await hre.viem.deployContract(contractName.Reader)
  const _ERC20 = await hre.viem.deployContract(contractName.ERC20, [false])
  const ERC20 = await hre.viem.getContractAt(contractName.ERC20Solady, _ERC20.address)
  const _taxERC20 = await hre.viem.deployContract(contractName.ERC20, [true])
  const taxERC20 = await hre.viem.getContractAt(contractName.ERC20Solady, _taxERC20.address)
  console.log('random=%o', random.address)
  console.log('reader=%o', reader.address)
  const randomnessProviders = await getRandomnessProviders(hre)
  const signers = await hre.viem.getWalletClients()
  const oneThousandEther = (10n ** 18n) * 1_000n
  await Promise.all(signers.map((signer) => (
    _ERC20.write.mint([signer.account!.address, oneThousandEther])
  )))
  await Promise.all(signers.map((signer) => (
    _ERC20.write.approve([random.address, oneThousandEther], {
      account: signer.account!,
    })
  )))
  console.log('providers=%o', randomnessProviders.length)
  return {
    ERC20,
    taxERC20,
    errors,
    signers,
    randomnessProviders,
    hre,
    random,
    reader,
  }
}

export const deployWithRandomness = async () => {
  const ctx = await helpers.loadFixture(deploy)
  const generatedPreimages = await writePreimages(ctx)
  const [{ preimageLocations, secretBatches }] = generatedPreimages
  const [secretGroups] = secretBatches
  const secretByPreimage = new Map(
    _(generatedPreimages)
      .map((generated) => generated.secretBatches)
      .flattenDeep()
      .map(({ preimage, secret }) => ([preimage, secret] as const))
      .value()
  )
  return {
    ...ctx,
    secretGroups,
    secretByPreimage,
    secretBatches,
    generatedPreimages,
    preimageLocations,
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
  const { all, selections } = await selectPreimages(ctx)
  const required = 5n
  const heatTx = await ctx.random.write.heat([
    required,
    12n << 1n | 0n,
    viem.zeroAddress,
    selections,
  ])
  const receipt = await confirmTx(ctx, heatTx)
  const randomnessStarts = await ctx.random.getEvents.RandomnessStart({}, {
    blockHash: receipt.blockHash,
  })
  return {
    ...ctx,
    all,
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
  return receipt
}

export const getRandomnessProviders = async (hre: HardhatRuntimeEnvironment) => {
  const signers = await hre.viem.getWalletClients()
  return signers.slice(12) as viem.WalletClient[]
}

export const writePreimages = async (ctx: Context, offset = 0n, token = viem.zeroAddress, price = utils.defaultPrice) => {
  const rand = await ctx.hre.viem.getContractAt(contractName.Random, ctx.random.address)
  const signers = await getRandomnessProviders(ctx.hre)
  return await utils.limiters.signers.map(signers, async (signer: viem.WalletClient) => {
    const secretBatches = await utils.createPreimages(signer.account!.address, offset)
    const preimageLocations = await Promise.all(secretBatches.map(async (secrets) => {
      const preimages = _.map(secrets, 'preimage')
      const preimageLocations = preimages.map((preimage, index) => ({
        provider: signer.account!.address,
        token,
        price,
        offset,
        index,
        preimage,
      }))
      await confirmTx(ctx, rand.write.ink(
        [token, price, viem.concatHex(preimages)], {
        account: signer.account,
      }))
      return preimageLocations
    }))
    return {
      preimageLocations,
      secretBatches,
    }
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
  const _flattened = _(preimageGroups).flatten()
  return {
    all: _flattened.value(),
    selections: _flattened.sampleSize(count).value(),
  }
}
