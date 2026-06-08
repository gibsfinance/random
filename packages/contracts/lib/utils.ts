import * as path from 'path'
import * as fs from 'fs'
import _ from 'lodash'
import promiseLimit from 'promise-limit'
import { getAddress, type WalletClient, type Hex, type ByteArray, type HDKey as ViemHDKey, keccak256, numberToHex, concatHex, padHex, toHex, hexToBytes, numberToBytes, concatBytes, parseEther, zeroAddress, bytesToHex, toBytes, pad } from 'viem'
import { hdKeyToAccount } from 'viem/accounts'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'
import { fileURLToPath } from 'url';

export const limiters = {
  range: promiseLimit<number>(1),
  signers: promiseLimit<WalletClient>(1),
}

export const byteword = 32n
export const maxContractSize = 24576n
export const maxBytes = maxContractSize - byteword
export const max = maxBytes / byteword

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const folders = {
  data: path.join(__dirname, '..', 'data'),
}

export type Secret = {
  secret: Hex;
  preimage: Hex;
  index: bigint;
}

// Placeholder for mnemonic generation logic
export const masterKey = () => {
  const seed = mnemonicToSeedSync(process.env.RANDOMNESS_MNEMONIC!)
  return HDKey.fromMasterSeed(seed)
}
// corresponds to the private key that you wish to derive
export const generateSecret = (k: ViemHDKey, accountIndex: bigint) => (
  hdKeyToAccount(k, {
    accountIndex: Number(accountIndex),
  }).getHdKey().privateKey! as ByteArray
)

export const originId = (k: ViemHDKey) => {
  return keccak256(k.privateKey!, 'hex')
}

// const preimageIndices =

export const createPreimages = async (
  generate: (i: bigint) => ByteArray,
  offset = 0n, count = max,
) => {
  const range: bigint[] = []
  for (let i = 0n; i < count; i++) {
    range.push(offset + i)
  }
  return range.map((index) => {
    const secretBytes = generate(index)
    return {
      secret: toHex(secretBytes),
      preimage: keccak256(secretBytes, 'hex'),
      index,
    }
  })
}

type SecretInfo = {
  secret: Hex;
  preimage: Hex;
  index: bigint;
}

export const createTestPreimages = async (section = defaultSection, count = max) => {
  const addressFolder = path.join(folders.data, section.provider.toLowerCase())
  const final = section.offset + count
  const iterations = Math.ceil(Number(count) / Number(max))
  await fs.promises.mkdir(addressFolder, {
    recursive: true,
  })
  const range = _.range(0, iterations)
  return await limiters.range.map<Secret[]>(range, async (i) => {
    const start = section.offset + (BigInt(i) * max)
    const exclusiveEnd = start + max >= final ? final : start + max
    const filePath = path.join(addressFolder, `${start}-${exclusiveEnd}.json`)
    const existing = await fs.promises.readFile(filePath).catch(() => ([]))
    if (existing.length) {
      return JSON.parse(existing.toString()).map((val: SecretInfo & {
        index: string;
      }) => ({
        ...val,
        index: BigInt(val.index),
      })) as SecretInfo[]
    }
    const generated = await createPreimages((index) => {
      // a not so secret secret
      return keccak256(concatBytes([
        hexToBytes(section.provider),
        numberToBytes(index),
      ]), 'bytes')
    }, start, exclusiveEnd)
    // stash for next test
    await fs.promises.writeFile(filePath, JSON.stringify(generated.map((val) => ({
      ...val,
      index: val.index.toString(),
    }))))
    return generated
  })

  // const range = _.range(0, iterations)
  // return limiters.range.map<Secret[]>(range, async (i) => {
  //   const start = offset + (BigInt(i) * max)
  //   const end = start + max >= final ? final : start + max
  //   const filePath = path.join(addressFolder, `${start}-${end}.json`)
  //   const existing = await fs.promises.readFile(filePath).catch(() => ([]))
  //   if (existing.length) {
  //     return JSON.parse(existing.toString())
  //   }
  //   console.log('generating randomness %o %o-%o', address, start, end)
  //   const secretsAsBytes = _.range(0, Number(end - start)).map((idx) => {
  //     return keccak256(concatBytes([
  //       hexToBytes(address),
  //       numberToBytes(start + BigInt(idx)),
  //     ]), 'bytes')
  //   })
  //   const generated = _.map(secretsAsBytes, (secretBytes) => ({
  //     secret: toHex(secretBytes),
  //     preimage: keccak256(secretBytes, 'hex'),
  //   }))
  //   await fs.promises.writeFile(filePath, JSON.stringify(generated))
  //   return generated
  // })
}

export const dataToPreimages = (data: Hex) => {
  return _(hexToBytes(data))
    .chunk(32)
    .map((chunk) => bytesToHex(Uint8Array.from(chunk)))
    .value()
}

export type PreimageInfo = {
  provider: Hex;
  callAtChange: boolean;
  usesTimestamp: boolean;
  duration: bigint;
  token: Hex;
  price: bigint;
  offset: bigint;
  index: bigint;
}

export type PreimageInfoOptions = Partial<PreimageInfo>

export const defaultSection: PreimageInfo = {
  provider: zeroAddress,
  callAtChange: false,
  usesTimestamp: false,
  duration: 12n,
  token: zeroAddress,
  price: parseEther('100'),
  offset: 0n,
  index: 0n,
}

export const encodeToken = (inputs: Partial<PreimageInfo>) => {
  return numberToHex(
    (inputs.usesTimestamp ? 1n : 0n) << 255n
    | (inputs.callAtChange ? 1n : 0n) << 254n
    | BigInt.asUintN(38, inputs.duration!) << 160n
    | BigInt(inputs.token!),
    { size: 32 } // encode as a uint256
  )
}

/**
 * contributed: [0-7]
 * callAtChange: [8]
 * usesTimestamp: [9]
 * duration: [10-47]
 * start: [48-95]
 * owner: [96-255]
 */

type Timeline = {
  owner: Hex;
  callAtChange: boolean;
  usesTimestamp: boolean;
  duration: bigint;
  start: bigint;
  contributed: bigint;
}

export const timeline = {
  parse: (timeline: bigint) => ({
    owner: getAddress(numberToHex(BigInt.asUintN(160, timeline >> 96n), { size: 20 })),
    callAtChange: BigInt.asUintN(1, timeline >> 8n) === 1n,
    usesTimestamp: BigInt.asUintN(1, timeline >> 9n) === 1n,
    duration: BigInt.asUintN(38, timeline >> 9n),
    start: BigInt.asUintN(48, timeline >> 48n),
    contributed: BigInt.asUintN(8, timeline),
  }),
  encode: (inputs: Timeline & { contributed?: bigint }) => {
    const { owner, callAtChange, usesTimestamp, duration, start, contributed = 0n } = inputs
    return numberToHex((
      BigInt(owner) << 96n
      | BigInt.asUintN(48, start) << 48n
      | BigInt.asUintN(38, duration) << 10n
      | (usesTimestamp ? 1n : 0n) << 9n
      | (callAtChange ? 1n : 0n) << 8n
      | BigInt.asUintN(8, contributed)
    ), { size: 32 })
  },
}

export const section = (inputs: Omit<PreimageInfo, 'index'> = defaultSection) => {
  return keccak256(concatHex([
    padHex(inputs.provider, { size: 32 }),
    encodeToken(inputs),
    numberToHex(inputs.price, { size: 32 }),
    numberToHex(inputs.offset, { size: 32 }),
  ]), 'hex')
}

export const template = (inputs: Omit<PreimageInfo, 'index' | 'offset'> = defaultSection) => (
  section({ ...inputs, offset: 0n })
)

export const location = (section: Hex, index: bigint | number) => {
  return keccak256(concatHex([
    section,
    numberToHex(index, { size: 32 }),
  ]), 'hex')
}

export const sum = (s: PreimageInfo[]) => s.reduce<bigint>((total, { price }) => total + price, 0n)

export const contractName = {
  Consumer: 'contracts/Consumer.sol:Consumer',
  ConsumerIncomplete: 'contracts/test/ConsumerIncomplete.sol:ConsumerIncomplete',
  ConsumerEmitter: 'contracts/test/ConsumerEmitter.sol:ConsumerEmitter',
  Random: 'contracts/Random.sol:Random',
  Reader: 'contracts/Reader.sol:Reader',
  ERC20: 'contracts/test/ERC20.sol:ERC20',
  ERC20Solady: 'solady/src/tokens/ERC20.sol:ERC20',
  Constants: 'contracts/Constants.sol:Errors',
  MulticallerWithSender: 'multicaller/src/MulticallerWithSender.sol:MulticallerWithSender',
  MulticallerWithSigner: 'multicaller/src/MulticallerWithSigner.sol:MulticallerWithSigner',
} as const

export type Names = typeof contractName

// export const encodeTimeline = ({
//   owner,
//   callAtChange,
//   start,
//   duration,
//   usesTimestamp,
//   count = 0n,
// }: {
//   owner: Hex;
//   start: bigint;
//   duration: bigint;
//   usesTimestamp: boolean;
//   callAtChange: boolean;
//   count?: bigint;
// }) => {
//   return numberToHex((
//     BigInt(owner) << 96n
//     | BigInt.asUintN(48, start) << 48n
//     | BigInt.asUintN(38, duration) << 10n
//     | (usesTimestamp ? 1n : 0n) << 9n
//     | (callAtChange ? 1n : 0n) << 8n
//     | BigInt.asUintN(8, count)
//   ), { size: 32 })
// }

const slots = [
  'timeline',
  'seed',
  'latest',
  'custodied',
  'count',
] as const

const slotList = Object.values(slots)

export type Slot = typeof slotList[number]

export const slotKeyToFormer = new Map<string, (inputs: SlotInputs, slotIndexBytes: Uint8Array) => Hex>([
  ['timeline', (inputs, index) => {
    const key = inputs.key!
    const keySlot = keccak256(concatBytes([
      hexToBytes(key, { size: 32 }),
      index,
    ]))
    return keySlot
  }],
  ['latest', (inputs, index) => {
    const account = inputs.account!
    const accountSlot = keccak256(concatBytes([
      pad(hexToBytes(account), { size: 32, dir: 'left' }),
      index,
    ]))
    return accountSlot
  }],
  ['count', (inputs, index) => {
    const location = inputs.location!
    const providerKeySlot = keccak256(concatBytes([
      pad(hexToBytes(location.provider!), { size: 32, dir: 'left' }),
      index,
    ]), 'bytes')
    const locationSlot = keccak256(concatBytes([
      toBytes(encodeToken(location)),
      providerKeySlot,
    ]), 'bytes')
    const priceSlot = keccak256(concatBytes([
      numberToBytes(location.price!, { size: 32 }),
      locationSlot,
    ]), 'hex')
    return priceSlot
  }],
  ['custodied', (inputs, index) => {
    const { token, account } = inputs
    const accountSlot = keccak256(concatBytes([
      pad(hexToBytes(account!), { size: 32, dir: 'left' }),
      index,
    ]), 'bytes')
    const tokenSlot = keccak256(concatBytes([
      pad(hexToBytes(token!), { size: 32, dir: 'left' }),
      accountSlot,
    ]))
    return tokenSlot
  }],
])

export type SlotInputs = Partial<{
  key: Hex;
  location: Partial<PreimageInfo>
  account: Hex;
  token: Hex;
}>

export const slot = (slot: Slot, slotInputs: SlotInputs, idx?: number) => {
  const index = _.isUndefined(idx) ? slots.indexOf(slot) : idx
  const indexBytes = numberToBytes(index, { size: 32 })
  const key = slotKeyToFormer.get(slot)?.(slotInputs, indexBytes)
  if (!key) {
    throw new Error('slot not defined')
  }
  return key
}

export const toSeed = (inputs: Hex[]) => (
  keccak256(
    hexToBytes(concatHex(inputs))
  )
)
