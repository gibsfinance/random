import * as hre from 'hardhat'
// import * as path from 'path'
// import * as fs from 'fs'
// import * as viem from 'viem'
import * as utils from './utils'

export const main = async () => {
  const signers = await utils.getRandomnessProviders(hre)
  console.log('todo: %o', signers.length)
  for (const client of signers) {
    const address = client.account!.address
    await utils.createPreimages(address, 0n, utils.max * 4n)
  }
}
