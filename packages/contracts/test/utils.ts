import { concatHex, encodeFunctionData, getAddress, GetContractEventsReturnType, type GetContractReturnType, type Hex, isAddress, numberToHex, WalletClient, WriteContractReturnType, zeroAddress, zeroHash } from 'viem'
import _ from 'lodash'
import { network } from 'hardhat'
import * as utils from '../lib/utils.js'
import { contractName } from '../lib/utils.js'
import { HardhatViemHelpers } from '@nomicfoundation/hardhat-viem/types'

// type Connection = ReturnType<typeof network.connect<'generic'>>

export const connect = _.memoize(async () => {
  const connection = await network.connect()
  return connection
})

export const deploy = async () => {
  const connection = await connect()
  return connection.networkHelpers.loadFixture(async function _deploy() {
    const { viem, provider } = connection
    const errors = await viem.getContractAt(contractName.Constants, zeroAddress)
    const random = await viem.deployContract(contractName.Random)
    const reader = await viem.deployContract(contractName.Reader, [random.address])
    const consumer = await viem.deployContract(contractName.Consumer, [random.address])
    const consumerIncomplete = await viem.deployContract(contractName.ConsumerIncomplete, [random.address])
    const consumerEmitter = await viem.deployContract(contractName.ConsumerEmitter, [random.address])
    const _ERC20 = await viem.deployContract(contractName.ERC20, [false])
    const ERC20 = await viem.getContractAt(contractName.ERC20Solady, _ERC20.address)
    const _taxERC20 = await viem.deployContract(contractName.ERC20, [true])
    const taxERC20 = await viem.getContractAt(contractName.ERC20Solady, _taxERC20.address)
    const multicallerAddress = '0x00000000002Fd5Aeb385D324B580FCa7c83823A0'
    const multicallerWithSender = await viem.getContractAt(contractName.MulticallerWithSender, multicallerAddress).then(async (c) => {
      const provider = await viem.getPublicClient()
      const bytes = await provider.getCode({ address: c.address })
      if (bytes && bytes !== '0x') {
        console.log('multicallerWithSender already deployed')
        return c
      }
      const tmpMulticaller = await viem.deployContract(contractName.MulticallerWithSender)
      const code = (await provider.getCode({ address: tmpMulticaller.address })) as Hex
      await provider.request({
        method: 'hardhat_setCode' as any,
        params: [multicallerAddress, code],
      })
      return await viem.getContractAt(contractName.MulticallerWithSender, multicallerAddress)
    })
    await provider.request({
      method: 'hardhat_setStorageAt',
      params: [
        multicallerWithSender.address,
        zeroHash,
        numberToHex(1n << 160n, { size: 32 }),
      ]
    })
    // const multicallerWithSigner =
    // await deployMulticaller(
    //   contractName.MulticallerWithSigner,
    //   '0x000000000000D9ECebf3C23529de49815Dac1c4c',
    // )
    const deployedContracts = {
      random,
      reader,
      // multicaller as it is on mainnet
      multicallerWithSender,
      // erc20s
      ERC20,
      taxERC20,
      // consumer types
      consumer,
      consumerIncomplete,
      consumerEmitter,
    }
    for (const [name, contract] of Object.entries(deployedContracts)) {
      console.log('%s:%o', contract.address, name)
    }
    const randomnessProviders = await getRandomnessProviders(viem)
    console.log('providers=%o', randomnessProviders.length)
    const signers = await viem.getWalletClients()
    const oneThousandEther = 10n ** 18n * 1_000n
    await Promise.all(
      [_ERC20, _taxERC20].map(async (erc20) => {
        await Promise.all(signers.map((signer) => erc20.write.mint([signer.account!.address, oneThousandEther])))
        await Promise.all(
          signers.map((signer) =>
            erc20.write.approve([random.address, oneThousandEther], {
              account: signer.account!,
            }),
          ),
        )
      }),
    )
    const required = 5n
    const defaultExpiryOffsetInput = 12n << 1n
    return {
      ...deployedContracts,
      TAXERC20: _taxERC20,
      errors,
      signers,
      randomnessProviders,
      viem,
      required,
      defaultExpiryOffsetInput,
      connection,
    }
  })
}

export const deployWithRandomness = async (section = utils.defaultSection) => {
  const { networkHelpers } = await connect()
  return await networkHelpers.loadFixture(async function _deployWithRandomness() {
    const ctx = await deploy()
    const generatedPreimages = await writePreimages(ctx, section)
    const [{ preimageLocations, secretBatches }] = generatedPreimages
    const [secretGroups] = secretBatches
    const secretByPreimage = new Map(
      _(generatedPreimages)
        .map((generated) => generated.secretBatches)
        .flattenDeep()
        .map(({ preimage, secret }) => [preimage, secret] as const)
        .value(),
    )
    return {
      ...ctx,
      secretGroups,
      secretByPreimage,
      secretBatches,
      generatedPreimages,
      preimageLocations,
    }
  })
}

export async function deployWithRandomnessAndStart(
  section = utils.defaultSection,
  prov: string | Hex = zeroAddress,
) {
  const { networkHelpers } = await connect()
  return await networkHelpers.loadFixture(async function _deployWithRandomnessAndStart() {
    const ctx = await deployWithRandomness(section)
    const [provider] = ctx.randomnessProviders
    const [consumer] = ctx.signers
    const [[heat]] = await utils.createTestPreimages({
      ...section,
      provider: provider.account!.address,
    })
    const publicClient = await ctx.viem.getPublicClient()
    const blockBeforeHeat = await publicClient.getBlock({
      blockTag: 'latest',
    })
    const { all, selections } = await selectPreimages(ctx, Number(ctx.required), [section])
    let consumerAddress = consumer.account!.address
    if (prov !== zeroAddress) {
      if (isAddress(prov)) {
        consumerAddress = prov
      } else {
        const contract = (ctx as any)[prov] as GetContractReturnType
        consumerAddress = contract.address
      }
    }
    const heatTx = await ctx.random.write.heat(
      [ctx.required, { ...section, provider: consumerAddress }, selections, true],
      {
        value: utils.sum(selections),
      },
    )
    const receipt = await confirmTx(ctx, heatTx)
    const starts = await ctx.random.getEvents.Start(
      {},
      {
        blockHash: receipt.blockHash,
      },
    )
    return {
      ...ctx,
      all,
      selections,
      heat,
      blockBeforeHeat,
      starts,
    }
  })
}

export async function deployWithRandomnessAndConsume(section = utils.defaultSection) {
  const { networkHelpers } = await connect()
  return await networkHelpers.loadFixture(async function _deployWithRandomnessAndConsume() {
    const ctx = await deployWithRandomness(section)
    const { signers, required, randomnessProviders } = ctx
    const { selections } = await selectPreimages(ctx)
    const [signer] = signers
    const [provider] = randomnessProviders
    const [[s]] = await utils.createTestPreimages({
      ...section,
      provider: provider.account!.address,
    })
    const template = {
      ...section,
      provider: signer.account!.address,
    }
    const expectedUsed = selections.slice(0, Number(required))
    const expectedEmitArgs = expectedUsed.map((parts) => ({
      provider: getAddress(parts.provider),
      section: utils.section(parts),
      index: parts.index,
    }))
    const targets = [ctx.random.address, ctx.random.address, ctx.consumer.address]
    const existingBalance = 0n
    const values = new Array(targets.length).fill(0n) as bigint[]
    const selectionsSum = utils.sum(selections)
    const handoffValue = selectionsSum < existingBalance ? 0n : selectionsSum - existingBalance
    values[0] = handoffValue
    const data = [
      encodeFunctionData({
        abi: ctx.random.abi,
        functionName: 'handoff',
        args: [zeroAddress, zeroAddress, -values[0]],
      }),
      encodeFunctionData({
        abi: ctx.random.abi,
        functionName: 'heat',
        args: [5n, template, selections, true],
      }),
      encodeFunctionData({
        abi: ctx.consumer.abi,
        functionName: 'chain',
        args: [signer.account!.address, true, true, false, s.preimage],
      }),
    ]
    const client = await ctx.viem.getPublicClient()
    const currentBlock = await client.getBlock()
    const nextBlockNumber = currentBlock.number + 1n
    const multicallTx = ctx.multicallerWithSender.write.aggregateWithSender([targets, data, values], {
      value: values.reduce((total, v) => total + v),
    })
    await confirmTx(ctx, multicallTx)
    const heatEvents = await client.getContractEvents({
      ...ctx.random,
      eventName: 'Heat',
      fromBlock: nextBlockNumber,
      toBlock: nextBlockNumber,
    }) as GetContractEventsReturnType<typeof ctx.random.abi, 'Heat'>
    const starts = await client.getContractEvents({
      ...ctx.random,
      eventName: 'Start',
      fromBlock: nextBlockNumber,
      toBlock: nextBlockNumber,
    }) as GetContractEventsReturnType<typeof ctx.random.abi, 'Start'>
    return {
      ...ctx,
      heatEvents,
      selections,
      multicallSecret: s,
      handoffValue,
      multicallTx,
      signer,
      expectedEmitArgs,
      starts,
    }
  })
}

export type Context = Awaited<ReturnType<typeof deploy>>

export const confirmTx = async (
  ctx: Context,
  hash: Promise<WriteContractReturnType> | WriteContractReturnType,
) => {
  const provider = await ctx.viem.getPublicClient()
  const receipt = await provider.waitForTransactionReceipt({
    hash: await hash,
  })
  return receipt
}

export const getRandomnessProviders = async (viem: HardhatViemHelpers<"generic">) => {
  const signers = await viem.getWalletClients()
  const lastSigners = signers.slice(12) as WalletClient[]
  return lastSigners
}

export const writePreimages = async (ctx: Context, section = utils.defaultSection, value?: bigint) => {
  const rand = await ctx.viem.getContractAt(contractName.Random, ctx.random.address)
  const signers = await getRandomnessProviders(ctx.viem)
  return await utils.limiters.signers.map(signers, async (signer: WalletClient) => {
    const secretBatches = await utils.createTestPreimages({
      ...section,
      provider: signer.account!.address,
    })
    const preimageLocations = await Promise.all(
      secretBatches.map(async (secrets) => {
        const preimages = _.map(secrets, 'preimage')
        const preimageLocations = preimages.map((preimage, index) => ({
          ...section,
          provider: signer.account!.address,
          index: BigInt(index),
          preimage,
        }))
        await confirmTx(
          ctx,
          rand.write.ink([preimageLocations[0], concatHex(preimages)], {
            account: signer.account,
            value: _.isNil(value) ? utils.sum(preimageLocations) : value,
          }),
        )
        return preimageLocations
      }),
    )
    return {
      preimageLocations,
      secretBatches,
    }
  })
}

export const readPreimages = async (ctx: Context, options = utils.defaultSection) => {
  const signers = await getRandomnessProviders(ctx.viem)
  return await utils.limiters.signers.map(signers, async (signer) => {
    const data = await ctx.reader.read.pointer([
      {
        ...utils.defaultSection,
        ...options,
        provider: signer.account!.address,
      },
    ])
    return utils.dataToPreimages(data)
  })
}

export const selectPreimages = async (
  ctx: Context,
  count = 5,
  offsets: utils.PreimageInfoOptions[] = [utils.defaultSection],
) => {
  const producers = await getRandomnessProviders(ctx.viem)
  const preimageGroups = await utils.limiters.signers.map(producers, async (producer) => {
    const iterations = offsets.map((options) => ({
      ...utils.defaultSection,
      ...options,
      provider: producer.account!.address,
    }))
    // console.log(iterations)
    const dataSets = await Promise.all(iterations.map((options) => ctx.reader.read.pointer([options])))
    return _(dataSets)
      .map(utils.dataToPreimages)
      .map((set, i) => {
        const offset = iterations[i]
        return _.map(
          set,
          (preimage, index) =>
            ({
              ...utils.defaultSection,
              ...offset,
              signer: producer,
              preimage,
              index: BigInt(index),
            } as utils.PreimageInfo & {
              signer: WalletClient
              preimage: Hex
            }),
        )
      })
      .flatten()
      .value()
  })
  const _flattened = _(preimageGroups).flatten()
  return {
    all: _flattened.value(),
    selections: _flattened.sampleSize(count).value(),
  }
}
