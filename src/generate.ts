import * as path from 'path'
import * as fs from 'fs'
import _ from 'lodash'
import * as viem from 'viem'

import { folders, limiters, max } from './utils'

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
