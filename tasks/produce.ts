import { setTimeout } from 'timers/promises'
import * as viem from 'viem'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

export const main = async (_args: any, hre: HardhatRuntimeEnvironment) => {
  do {
    await catchUpAndRespond(hre)
    await setTimeout(3_000)
  } while (true)
}

let latest: null | viem.Block = null

const getLatestIfUpdated = async (hre: HardhatRuntimeEnvironment) => {
  const client = await hre.viem.getPublicClient()
  const current = await client.getBlock({
    blockTag: 'latest',
  })
  if (!latest || current.hash != latest.hash) {
    latest = current
    return current
  }
  return null
}

const catchUpAndRespond = async (hre: HardhatRuntimeEnvironment) => {
  const latestUpdatedTo = await getLatestIfUpdated(hre)
  if (!latestUpdatedTo) return
  await catchUp(hre)
  await respond(hre)
}

const catchUp = async (hre: HardhatRuntimeEnvironment) => {
  //
}

const respond = async (hre: HardhatRuntimeEnvironment) => {
  //
}
