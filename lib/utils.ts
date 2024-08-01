import * as path from 'path'
import * as fs from 'fs'
import _ from 'lodash'
import promiseLimit from 'promise-limit'
import * as viem from 'viem'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import hre from 'hardhat'
import * as ethers from 'ethers'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers'

export const ntrfc = (contract: {
  abi: viem.Abi,
}) => {
  return {
    interface: new ethers.Interface(contract.abi as unknown as ethers.InterfaceAbi),
  }
}

export const expectRevertedWithCustomError = async (p: Promise<any>, errorName: string, args?: any[]) => {
  let threw = false
  let e!: Error
  try {
    await p
  } catch (err: any) {
    threw = true
    e = err
  }
  if (!threw) {
    throw new Error('expected revert, did not')
  }
  const rpcError = e as viem.RpcError
  if (e) {
    // console.dir(rpcError.walk())
    if (rpcError.details && rpcError.details.includes(errorName)) {
      // check args
      if (!args || !args.length) {
        return
      }
      // be sure to implement args check!
    }
  }
  console.dir(rpcError.walk())
  throw new Error('unable to check error')
}

export const contractName = {
  Random: 'contracts/Random.sol:Random',
  Reader: 'contracts/Reader.sol:Reader',
} as const

export const limiters = {
  range: promiseLimit<number>(16),
  signers: promiseLimit<viem.WalletClient>(16),
}

export const maxContractSize = 24576n
export const maxBytes = maxContractSize - 32n
export const max = maxBytes / 32n
export const folders = {
  data: path.join(__dirname, '..', 'data'),
}

export type Secret = {
  secret: viem.Hex;
  preimage: viem.Hex;
}

export const deploy = async () => {
  const random = await hre.viem.deployContract(contractName.Random, [
    viem.zeroAddress,
    viem.parseEther('100'),
  ])
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
  const ctx = await loadFixture(deploy)
  const secretGroups = await writePreimages(ctx)
  return {
    ...ctx,
    secretGroups,
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

export const createPreimages = async (address: viem.Hex, offset = 0n, count = max) => {
  const final = offset + count
  const iterations = Math.ceil(Number(count) / Number(max))
  const addressFolder = path.join(folders.data, address.toLowerCase())
  await fs.promises.mkdir(addressFolder, {
    recursive: true,
  })
  const range = _.range(0, iterations)
  return limiters.range.map<Secret[]>(range, async (i) => {
    const start = offset + (BigInt(i) * max)
    const end = start + max >= final ? final : start + max
    const filePath = path.join(addressFolder, `${start}-${end}.json`)
    const existing = await fs.promises.readFile(filePath).catch(() => ([]))
    if (existing.length) {
      return JSON.parse(existing.toString())
    }
    console.log('generating randomness %o %o-%o', address, start, end)
    const secretsAsBytes = _.range(0, Number(end - start)).map((idx) => {
      return viem.keccak256(viem.concatBytes([
        viem.hexToBytes(address),
        viem.numberToBytes(start + BigInt(idx)),
      ]), 'bytes')
    })
    const generated = _.map(secretsAsBytes, (secretBytes) => ({
      secret: viem.toHex(secretBytes),
      preimage: viem.keccak256(secretBytes, 'hex'),
    }))
    await fs.promises.writeFile(filePath, JSON.stringify(generated))
    return generated
  })
}

export const getRandomnessProviders = async (hre: HardhatRuntimeEnvironment) => {
  const signers = await hre.viem.getWalletClients()
  return signers.slice(12)
}

export const writePreimages = async (ctx: Context, index = 0n) => {
  const rand = await ctx.hre.viem.getContractAt(contractName.Random, ctx.random.address)
  const signers = await getRandomnessProviders(ctx.hre)
  return await limiters.signers.map(signers, async (signer: viem.WalletClient) => {
    const secretBatches = await createPreimages(signer.account!.address, index)
    await Promise.all(secretBatches.map(async (secrets) => {
      const preimages = _.map(secrets, 'preimage')
      // const r =
      await confirmTx(ctx.hre.viem.getPublicClient(), rand.write.ink([viem.concatHex(preimages)], {
        account: signer.account,
      }))
      // const logs = viem.parseEventLogs({
      //   logs: r.logs,
      //   abi: ctx.random.abi,
      // })
      // console.log(logs)
    }))
    return secretBatches[0]
  })
}

export const readPreimages = async (ctx: Context, offset = 0n) => {
  // const random = await hre.viem.getContractAt(contractName.Random, address)
  const signers = await getRandomnessProviders(ctx.hre)
  // const provider = await ctx.hre.viem.getPublicClient()
  return await limiters.signers.map(signers, async (signer) => {
    const data = await ctx.reader.read.all([
      ctx.random.address,
      signer.account!.address,
      offset,
      // 0n,
    ])
    return _(viem.hexToBytes(data))
      .chunk(32)
      .map((chunk) => viem.bytesToHex(Uint8Array.from(chunk)))
      .value()
    // const code = await provider.getCode({
    //   address: pointer,
    // })
    // console.log('pointer prefix', ((code!.length - 2) / 2) - 1, code!.slice(0, 66))
  })
}
