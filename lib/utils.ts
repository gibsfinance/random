import * as path from 'path'
import * as fs from 'fs'
import _ from 'lodash'
import promiseLimit from 'promise-limit'
import * as viem from 'viem'

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

export const dataToPreimages = (data: viem.Hex) => {
  return _(viem.hexToBytes(data))
    .chunk(32)
    .map((chunk) => viem.bytesToHex(Uint8Array.from(chunk)))
    .value()
}

export type PreimageInfo = {
  provider: viem.Hex;
  token: viem.Hex;
  price: bigint;
  offset: bigint;
  index: bigint;
}

export type PreimageInfoOptions = Partial<PreimageInfo>

export const defaultPrice = viem.parseEther('100')

export const defaultPreImageInfo: PreimageInfo = {
  provider: viem.zeroAddress,
  token: viem.zeroAddress,
  price: defaultPrice,
  offset: 0n,
  index: 0n,
}

// export const providerKeyParts = (key: viem.Hex) => {
//   const num = BigInt(key)
//   const provider = viem.toHex(num >> 96n, { size: 20 })
//   const offset = BigInt.asUintN(80, num >> 16n)
//   const localIndex = BigInt.asUintN(16, num)
//   return {
//     provider: viem.getAddress(provider),
//     offset,
//     localIndex,
//     index: offset + localIndex,
//   }
// }

export const section = (inputs: Omit<PreimageInfo, 'index'> = defaultPreImageInfo) => {
  return viem.keccak256(viem.concatHex([
    viem.padHex(inputs.provider, { size: 32 }),
    viem.padHex(inputs.token, { size: 32 }),
    viem.numberToHex(inputs.price, { size: 32 }),
    viem.numberToHex(inputs.offset, { size: 32 }),
  ]), 'hex')
}

export const sum = (s: PreimageInfo[]) => s.reduce<bigint>((total, { price }) => total + price, 0n)
