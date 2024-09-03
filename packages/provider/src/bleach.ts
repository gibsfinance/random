import * as viem from 'viem'
import { contracts } from "./contracts"
import { indexer } from "./indexer"
import { signers } from "./signers"
import { publicClient } from './chain'

export const main = async () => {
  const { provider } = await signers()
  const { pointers } = await indexer.pointers({
    provider: provider.account!.address,
  })
  for (const pointer of pointers.items) {
    console.log(pointer)
    const bleachTx = await contracts().random.write.bleach([{
      provider: provider.account!.address,
      duration: BigInt(pointer.duration),
      durationIsTimestamp: pointer.durationIsTimestamp,
      token: pointer.token as viem.Hex,
      price: BigInt(pointer.price),
      offset: BigInt(pointer.offset),
      index: 0n,
    }], {
      account: provider.account!,
    })
    await publicClient.waitForTransactionReceipt({
      hash: bleachTx,
    })
  }
}
