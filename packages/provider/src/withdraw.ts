import * as viem from 'viem'
import { contracts } from "./contracts"
import { indexer } from "./indexer"
import { signers } from "./signers"
import { publicClient } from './chain'

export const main = async () => {
  const { provider } = await signers()
  // const { pointers } = await indexer.pointers({
  //   provider: provider.account!.address,
  // })
  const pointers = {
    items: [{
      token: viem.zeroAddress,
    }]
  }
  for (const pointer of pointers.items) {
    const token = pointer.token as viem.Hex
    console.log('checking token', token)
    const balanceOf = await contracts().random.read.balanceOf([
      provider.account!.address,
      token,
    ])
    if (!balanceOf) {
      continue
    }
    const contractBalance = await publicClient.getBalance({
      address: contracts().random.address,
    })
    const bal = balanceOf > contractBalance ? contractBalance : balanceOf
    console.log(balanceOf, contractBalance)
    if (bal === 0n) {
      return
    }
    const handoffTx = await contracts().random.write.handoff([provider.account!.address, token, bal], {
      account: provider.account!,
      gasLimit: 10_000_000,
    })
    console.log('handoff %o', handoffTx)
    await publicClient.waitForTransactionReceipt({
      hash: handoffTx,
    })
  }
}
