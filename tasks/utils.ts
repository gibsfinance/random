// import * as viem from 'viem'
// import type { HDAccount } from 'viem/accounts'
// import { hdKeyToAccount } from 'viem/accounts/hdKeyToAccount'
// import { HDKey } from '@scure/bip32'
// import { mnemonicToSeedSync } from '@scure/bip39'
// import _ from 'lodash'

// // Placeholder for mnemonic generation logic
// const seed = mnemonicToSeedSync(process.env.RANDOMNESS_MNEMONIC!)
// const k = HDKey.fromMasterSeed(seed)
// // corresponds to the private key that you wish to derive
// export const generateSecret = (accountIndex: number) => hdKeyToAccount(k, {
//   accountIndex,
// }) as HDAccount

// export const hashPrivateKeys = (privateKeys: viem.Hex[]): viem.Hex[] => {
//   // Placeholder for hashing private keys
//   return privateKeys.map((pk) => viem.keccak256(pk))
// }

// export const generate = (low: number, highExclusive: number) => {
//   const range = _.range(low, highExclusive)
//   if (!range.length) return []
//   return range.map((index) => {
//     const secret = generateSecret(index)
//     const preimage = viem.keccak256(secret)
//   })
// }
