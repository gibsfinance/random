import { HardhatRuntimeEnvironment } from 'hardhat/types'
import _ from 'lodash'
import * as viem from 'viem'
import hre from 'hardhat'
import * as helpers from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import * as utils from '../lib/utils'

export const contractName = {
  Consumer: 'contracts/Consumer.sol:Consumer',
  Random: 'contracts/Random.sol:Random',
  Reader: 'contracts/Reader.sol:Reader',
  ERC20: 'contracts/test/ERC20.sol:ERC20',
  ERC20Solady: 'solady/src/tokens/ERC20.sol:ERC20',
  Constants: 'contracts/Constants.sol:Errors',
  MulticallerWithSender: 'multicaller/src/MulticallerWithSender.sol:MulticallerWithSender',
  MulticallerWithSigner: 'multicaller/src/MulticallerWithSigner.sol:MulticallerWithSigner',
} as const

type Names = typeof contractName

const deployMulticaller = async (name: Names[keyof Names], address: viem.Hex) => {
  const provider = await hre.viem.getPublicClient()
  const code = await provider.getCode({
    address,
  })
  if (!code || code == '0x') {
    const tmpMulticaller = await hre.viem.deployContract(name as any)
    const code = await provider.getCode({ address: tmpMulticaller.address }) as any
    await provider.request({
      method: 'hardhat_setCode' as any,
      params: [
        address,
        code,
      ],
    })
  }
  return await hre.viem.getContractAt(name as any, address)
}

export const deploy = async () => {
  const errors = await hre.viem.getContractAt(contractName.Constants, viem.zeroAddress)
  const random = await hre.viem.deployContract(contractName.Random)
  const reader = await hre.viem.deployContract(contractName.Reader)
  const consumer = await hre.viem.deployContract(contractName.Consumer, [random.address])
  const _ERC20 = await hre.viem.deployContract(contractName.ERC20, [false])
  const ERC20 = await hre.viem.getContractAt(contractName.ERC20Solady, _ERC20.address)
  const _taxERC20 = await hre.viem.deployContract(contractName.ERC20, [true])
  const taxERC20 = await hre.viem.getContractAt(contractName.ERC20Solady, _taxERC20.address)
  const multicallerWithSender = await deployMulticaller(
    contractName.MulticallerWithSender,
    '0x00000000002Fd5Aeb385D324B580FCa7c83823A0',
  )
  await hre.network.provider.send('hardhat_setStorageAt', [
    multicallerWithSender.address,
    viem.zeroHash,
    viem.numberToHex(1n << 160n, { size: 32 }),
  ])
  // const multicallerWithSigner =
  // await deployMulticaller(
  //   contractName.MulticallerWithSigner,
  //   '0x000000000000D9ECebf3C23529de49815Dac1c4c',
  // )
  const deployedContracts = {
    random,
    reader,
    consumer,
    ERC20,
    taxERC20,
    multicallerWithSender,
  }
  for (const [name, contract] of Object.entries(deployedContracts)) {
    console.log('%s:%o', contract.address, name)
  }
  const randomnessProviders = await getRandomnessProviders(hre)
  console.log('providers=%o', randomnessProviders.length)
  const signers = await hre.viem.getWalletClients()
  const oneThousandEther = (10n ** 18n) * 1_000n
  await Promise.all([_ERC20, _taxERC20].map(async (erc20) => {
    await Promise.all(signers.map((signer) => (
      erc20.write.mint([signer.account!.address, oneThousandEther])
    )))
    await Promise.all(signers.map((signer) => (
      erc20.write.approve([random.address, oneThousandEther], {
        account: signer.account!,
      })
    )))
  }))
  const required = 5n
  const defaultExpiryOffsetInput = 12n << 1n
  return {
    ...deployedContracts,
    TAXERC20: _taxERC20,
    errors,
    signers,
    randomnessProviders,
    hre,
    required,
    defaultExpiryOffsetInput,
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

export const deployWithRandomnessAndStart = async () => {
  const ctx = await helpers.loadFixture(deployWithRandomness)
  const [consumer] = await ctx.hre.viem.getWalletClients()
  const [[heat]] = await utils.createPreimages(consumer.account!.address)
  const provider = await ctx.hre.viem.getPublicClient()
  const blockBeforeHeat = await provider.getBlock({
    blockTag: 'latest',
  })
  const { all, selections } = await selectPreimages(ctx)
  const heatTx = await ctx.random.write.heat([
    ctx.required,
    ctx.defaultExpiryOffsetInput,
    viem.zeroAddress,
    selections,
  ], {
    value: utils.sum(selections),
  })
  const receipt = await confirmTx(ctx, heatTx)
  const starts = await ctx.random.getEvents.Start({}, {
    blockHash: receipt.blockHash,
  })
  return {
    ...ctx,
    all,
    selections,
    heat,
    blockBeforeHeat,
    starts,
  }
}

export const deployWithRandomnessAndConsume = async () => {
  const ctx = await helpers.loadFixture(deployWithRandomness)
  const {
    signers,
    required,
  } = ctx
  const { selections } = await selectPreimages(ctx)
  const [signer] = signers
  const [[s]] = await utils.createPreimages(signer.account!.address)
  const expectedUsed = selections.slice(0, Number(required))
  const expectedEmitArgs = expectedUsed.map((parts) => ({
    provider: viem.getAddress(parts.provider),
    section: utils.section(parts),
    index: parts.index,
  }))
  const targets = [
    ctx.random.address,
    ctx.random.address,
    ctx.consumer.address,
  ]
  const existingBalance = 0n
  const values = new Array(targets.length).fill(0n) as bigint[]
  const selectionsSum = utils.sum(selections)
  const handoffValue = selectionsSum < existingBalance ? 0n : selectionsSum - existingBalance
  values[0] = handoffValue
  const data = [
    viem.encodeFunctionData({
      abi: ctx.random.abi,
      functionName: 'handoff',
      args: [viem.zeroAddress, viem.zeroAddress, -values[0]],
    }),
    viem.encodeFunctionData({
      abi: ctx.random.abi,
      functionName: 'heat',
      args: [5n, ctx.defaultExpiryOffsetInput, viem.zeroAddress, selections],
    }),
    viem.encodeFunctionData({
      abi: ctx.consumer.abi,
      functionName: 'chain',
      args: [signer.account!.address, true, false, s.preimage],
    }),
  ]
  const multicallTx = ctx.multicallerWithSender.write.aggregateWithSender([
    targets,
    data,
    values,
  ], {
    value: values.reduce((total, v) => total + v),
  })
  await confirmTx(ctx, multicallTx)
  const heatEvents = await ctx.random.getEvents.Heat()
  return {
    ...ctx,
    heatEvents,
    selections,
    multicallSecret: s,
    handoffValue,
    multicallTx,
    signer,
    expectedEmitArgs,
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
        index: BigInt(index),
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
