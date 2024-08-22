import * as viem from 'viem'
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as utils from '../lib/utils'
import { db } from '../lib/db'
import { tableNames } from '../lib/db/tables';

type Inputs = {
  token: viem.Hex;
  price: bigint;
  random: viem.Hex;
}

export const main = async (args: Inputs, hre: HardhatRuntimeEnvironment) => {
  const random = await hre.viem.getContractAt('contracts/Random.sol:Random', args.random)
  const [signer] = await hre.viem.getWalletClients()
  const provider = await hre.viem.getPublicClient()
  const byteOptions = { size: 32, dir: 'left' } as const
  const storage = await provider.getStorageAt({
    address: random.address,
    slot: viem.keccak256(
      viem.concatBytes([
        viem.padBytes(viem.toBytes(signer.account!.address), byteOptions),
        viem.padBytes(viem.toBytes(args.token), byteOptions),
        viem.numberToBytes(args.price, byteOptions),
        viem.numberToBytes(1n, byteOptions)
      ]),
    ),
  })
  const start = BigInt(storage as viem.Hex)
  const masterKey = utils.masterKey()
  const generated = await utils.createPreimages((i) => {
    return utils.generateSecret(masterKey, i)
  }, start)
  const originId = utils.originId(masterKey)
  const insertableSecrets = generated.map((gen) => ({
    ...gen,
    originId,
  }))
  const inserted = await db(tableNames.secret)
    .insert(insertableSecrets)
    .onConflict(['secretId'])
    .merge(['secretId'])
}
