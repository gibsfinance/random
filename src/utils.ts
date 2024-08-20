import * as path from 'path'
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

export const section = (inputs: Omit<PreimageInfo, 'index'> = defaultPreImageInfo) => {
  return viem.keccak256(viem.concatHex([
    viem.padHex(inputs.provider, { size: 32 }),
    viem.padHex(inputs.token, { size: 32 }),
    viem.numberToHex(inputs.price, { size: 32 }),
    viem.numberToHex(inputs.offset, { size: 32 }),
  ]), 'hex')
}

export const location = (section: viem.Hex, index: number | bigint) => {
  return viem.keccak256(viem.concatHex([
    section,
    viem.numberToHex(index, { size: 32 }),
  ]), 'hex')
}

export const sum = (s: PreimageInfo[]) => (
  s.reduce<bigint>((total, { price }) => total + price, 0n)
)

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

export type Names = typeof contractName
