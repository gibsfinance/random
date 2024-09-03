import * as viem from 'viem'
import { hdKeyToAccount } from 'viem/accounts'
import { mnemonicToSeedSync } from '@scure/bip39'
import { HDKey } from '@scure/bip32'
import _ from 'lodash'
import { transport } from './chain'

let wallets: viem.WalletClient[] = []

export const signers = async (index = 0) => {
  if (!wallets.length) {
    const seed = mnemonicToSeedSync(process.env.MNEMONIC!)
    const hdKey = HDKey.fromMasterSeed(seed)
    const accounts = _.range(0, 10).map((accountIndex) => (
      hdKeyToAccount(hdKey, { accountIndex })
    ))
    wallets = accounts.map((account) => (
      viem.createWalletClient({
        account,
        transport,
      })
    ))
  }
  const provider = wallets[index]
  const runners = wallets.filter((w) => w !== provider)
  const consumer = runners[runners.length - 1]
  return {
    provider,
    runners,
    wallets,
    consumer,
  }
}
