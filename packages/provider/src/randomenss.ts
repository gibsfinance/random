import * as viem from 'viem'
import { hdKeyToAccount } from 'viem/accounts'
import { mnemonicToSeedSync } from '@scure/bip39'
import { HDKey } from '@scure/bip32'
import _ from 'lodash'
import { db } from './db'
import { tableNames } from './db/tables'

export const generateSeed = () => {
  const input = process.env.RANDOMNESS_MNEMONIC!
  const seed = mnemonicToSeedSync(input)
  const k = HDKey.fromMasterSeed(seed)
  return {
    id: viem.keccak256(viem.toBytes(input)),
    get key() {
      return k
    },
  }
}

export const generateSecret = (hdKey: HDKey, accountIndex: number): viem.Hex => {
  const acc = hdKeyToAccount(hdKey, { accountIndex })
  return viem.bytesToHex(acc.getHdKey().privateKey as viem.ByteArray)
}

export const generatePreimages = async (fromIndex: number | bigint, toIndex: number | bigint) => {
  const { id, key } = generateSeed()
  await db.insert([{ seedId: id }])
    .into(tableNames.seed)
    .onConflict(['seedId'])
    .merge(['seedId'])
  return _.range(Number(fromIndex), Number(toIndex))
    .map((accountIndex) => ({
      seedId: id,
      index: accountIndex,
      preimage: viem.keccak256(generateSecret(key, accountIndex)),
    }))
}
