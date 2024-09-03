import * as viem from 'viem'
import * as threads from './threads'
import { indexer } from './indexer'
import { signers } from './signers'
import config from '../config'
import { generatePreimages, generateSecret, generateSeed } from './randomenss'
import { addresses, contracts, token } from './contracts'
import { chain, publicClient } from './chain'
import { slot } from './slots'
import { db } from './db'
import { tableNames } from './db/tables'
import * as randomUtils from '@gibs/random/lib/utils'
import _ from 'lodash'
import { log } from './logger'
import { Secret } from 'knex/types/tables'
import { msgBoard } from './msgboard'

const outstandingSecrets = () => (
  db.select('*').from(tableNames.secret)
    .whereNull('section')
    .whereILike('random', addresses().random)
    .where('chainId', chain.id)
)

const logSigner = _.once((provider: viem.Hex) => {
  log('signer: %o', provider)
})

const checkSurplus = async () => {
  const { wallets } = await signers()
  await Promise.all(config.randomness.get(chain.id)!.streams.map(async (randomConfig) => {
    const provider = wallets[randomConfig.provider]
    logSigner(provider.account!.address)
    const decimals = 18
    const template: randomUtils.PreimageInfo = {
      ...randomConfig.info,
      provider: provider.account!.address,
      duration: BigInt(randomConfig.info.duration),
      price: viem.parseUnits(randomConfig.info.price, decimals),
      // unused during storage check
      offset: 0n,
      index: 0n,
    }
    let existingOutstanding = await outstandingSecrets()
    const templates = _(existingOutstanding).map('template').uniq().value() as viem.Hex[]
    if (templates.length) {
      const { preimages: existingPreimages } = await indexer.preimages({
        template_in: templates,
        heatId: null,
      })
      if (existingPreimages.items.length) {
        const updates = existingPreimages.items.reduce((acc, item) => {
          const { section, data } = item as { section: viem.Hex; data: viem.Hex; }
          const list = acc.get(section) || []
          list.push(data)
          acc.set(section, list)
          return acc
        }, new Map<viem.Hex, viem.Hex[]>())
        await db.transaction(async (tx) => {
          for (const [section, data] of updates.entries()) {
            const updated = await tx(tableNames.secret)
              .update({ section })
              .whereIn('preimage', data)
              .whereNull('section')
              .returning('*')
            if (updated.length !== data.length) {
              log(updated)
              throw new Error('unable to update')
            }
          }
        })
        existingOutstanding = await outstandingSecrets()
      }
    }
    if (existingOutstanding.length) {
      log('waiting for outstanding randomness to be marked as confirmed')
      return
    }
    const { pointers } = await indexer.pointers({
      provider: provider.account!.address,
    })
    const totalCool = pointers.items.reduce((total, pointer) => total + BigInt(pointer.remaining), 0n)
    if (totalCool > randomConfig.minCoolPreimages) {
      log('total cool images > min: %o v %o',
        totalCool, randomConfig.minCoolPreimages,
      )
      return
    }
    const storage = await publicClient.getStorageAt({
      address: contracts().random.address,
      slot: slot('count', template),
    })
    const section = template
    const start = section.offset = BigInt(storage as viem.Hex)
    const delta = randomConfig.preimagesPerInk === 'max' ? randomUtils.max : BigInt(randomConfig.preimagesPerInk)
    let toIndex = start + delta
    if (toIndex > randomConfig.maxCoolPreimages) {
      log('bogus case')
      // handle this case later
      return
    }
    const preimages = await generatePreimages(start, toIndex)
    log('images %o', preimages.length)
    const insertable = preimages.map((p) => ({
      ...p,
      template: randomUtils.section(template),
      random: addresses().random,
      chainId: chain.id,
      inkIndexed: false,
    }))
    await db.transaction(async (tx) => {
      try {
        await tx.insert(insertable).into(tableNames.secret)
      } catch (err) {
        log(err)
        log('something went wrong when trying to insert new preimages %o - %o', start, toIndex)
        return
      }
      const concatPreimages = viem.concatHex(preimages.map(({ preimage }) => preimage))
      const cost = section.price * BigInt(preimages.length)
      const dealingInNative = section.token === viem.zeroAddress
      let funderIdx = -1
      let deposited!: bigint
      let available!: bigint
      for (const funderIndex of randomConfig.funder) {
        ; ([deposited, available] = await hasAdequateDeposits(section, wallets[funderIndex], preimages.length))
        if (deposited >= cost) {
          available = 0n
          funderIdx = funderIndex
          break
        } else if (available >= cost) {
          if ((section.token !== viem.zeroAddress) || (available / 2n >= cost)) {
            funderIdx = funderIndex
            available /= 2n
            deposited = 0n
            break
          }
        }
      }
      const logNotEnoughFunds = () => (
        notEnoughFundsLog(section.token, randomConfig.funder.map((idx) => (
          wallets[idx].account!.address
        )))
      )
      if (funderIdx === -1) {
        logNotEnoughFunds()
        return
      }
      const funder = wallets[funderIdx]
      if (cost <= deposited) {
        // no need for deposits - no matter the token
        return await contracts().random.write.ink([section, concatPreimages], {
          account: funder.account!,
        })
      }
      let deficit = cost - deposited
      if (dealingInNative) {
        const available = await publicClient.getBalance({
          address: funder.account!.address,
        }) / 2n
        if (available < deficit) {
          log('deposit native tokens to %o', funder.account!.address)
          return
        }
        return await contracts().random.write.ink([section, concatPreimages], {
          account: funder.account!,
          value: deficit,
        })
      }
      const tkn = token(section.token)
      const tokenBalance = await tkn.read.balanceOf([funder.account!.address])
      if (tokenBalance < deficit) {
        logNotEnoughFunds()
        return
      }

      // this area of this function is untested
      const allowance = await tkn.read.allowance([
        funder.account!.address,
        contracts().random.address,
      ])
      if (allowance < deficit) {
        const approveTxHash = await tkn.write.approve([contracts().random.address, viem.maxUint256], {
          account: funder.account!,
        })
        log('waiting for approval %o', approveTxHash)
        await publicClient.waitForTransactionReceipt({
          hash: approveTxHash,
        })
      }
      const targets: viem.Hex[] = [
        contracts().random.address,
        contracts().random.address,
      ]
      const data: viem.Hex[] = [
        // viem.encodeFunctionData({
        //   abi: viem.erc20Abi,
        //   functionName: 'permit2',
        // }),
        viem.encodeFunctionData({
          abi: contracts().random.abi,
          functionName: 'handoff',
          args: [viem.zeroAddress, section.token, -deficit],
        }),
        viem.encodeFunctionData({
          abi: contracts().random.abi,
          functionName: 'ink',
          args: [section, concatPreimages],
        }),
      ]
      const values: bigint[] = [0n, 0n]
      return await contracts().multicallerWithSender.write.aggregateWithSender([
        targets,
        data,
        values,
      ], {
        account: funder.account!,
        value: values.reduce((total, v) => total + v),
      })
    })
  }))
}

const templatesWithOutstanding = async () => {
  const uniq = await db.distinct<Secret[]>('template')
    .from(tableNames.secret)
  return uniq.map(({ template }) => template)
}

const generateSecretsFromPreimages = async (preimages: viem.Hex[]) => {
  const seed = generateSeed()
  const preimageInfo = await db.select('*')
    .from(tableNames.secret)
    .whereIn('preimage', preimages)
    .where('seedId', seed.id)
  const secrets = preimageInfo.map((preimageItem) => {
    return generateSecret(seed.key, Number(preimageItem.index))
  })
  return new Map<viem.Hex, viem.Hex>(preimageInfo.map((item, i) => ([
    item.preimage,
    secrets[i],
  ])))
}

const checkHeat = async () => {
  const { provider } = await signers()
  const templates = await templatesWithOutstanding()
  if (!templates.length) {
    return
  }
  const { pointers } = await indexer.requestsForSecrets({
    provider: provider.account!.address,
    template_in: templates,
  })
  const preimagesObjects = pointers.items.flatMap(({ preimages }) => (
    preimages!.items
  ))
  const sorted = _.sortBy(preimagesObjects, [
    (p) => +p.heat!.transaction.block.timestamp,
    (p) => +p.heat!.transaction.index,
    (p) => +p.heat!.index,
  ])
  const preimageHashes = sorted.map(({ data }) => data) as viem.Hex[]

  const preimageToSecret = await generateSecretsFromPreimages(preimageHashes)
  const msgboard = msgBoard()
  const contents = await msgboard.content()
  for (const p of sorted) {
    const preimage = p.data as viem.Hex
    const messages = contents[preimage] || {}
    const secret = preimageToSecret.get(preimage)!
    if (Object.entries(messages).find(([_key, { data }]) => data === secret)) {
      log('existing work     %o', preimage)
      continue
    }
    log('performing work   %o', preimage)
    // const processes: Subprocess<'ignore', 'pipe', 'inherit'>[] = []
    // const serializedWork = await Promise.race(
    //   _.range(0, 8).map((i) => {
    //     return new Promise<string>((resolve) => {
    //       let first = false
    //       const child = Bun.spawn({
    //         cmd: ['bun', './src/dowork'],
    //         serialization: 'json',
    //         // stdin: 'pipe',
    //         ipc(validWork, child) {
    //           log(validWork)
    //           if (!first) {
    //             child.send(JSON.stringify({ work: true, start: (i + 1).toString(), category: preimage, data: secret }))
    //             first = true
    //             return
    //           }
    //           resolve(validWork.toString())
    //         },
    //       })
    //       processes.push(child)
    //     })
    //   })
    // )
    // processes.forEach((sp) => {
    //   sp.kill()
    // })
    // const work = Work.fromJSON(serializedWork)
    const msgboard = msgBoard()
    const work = await msgboard.doPoW(preimage, secret)
    const id = await msgboard.add(work.toRLP())
    log('added work        %o', preimage)
  }
}

const hasAdequateDeposits = async (section: randomUtils.PreimageInfo, runner: viem.WalletClient, count: number) => {
  const depositedBalance = await contracts().random.read.balanceOf([runner.account!.address, section.token])
  let tokenBalance = 0n
  if (section.token === viem.zeroAddress) {
    tokenBalance = await publicClient.getBalance({
      address: runner.account!.address,
    })
  } else {
    const tkn = token(section.token)
    tokenBalance = await tkn.read.balanceOf([runner.account!.address])
  }
  return [depositedBalance, tokenBalance]
}

const intervals = new Map<threads.Runner, number>([
  [checkSurplus, 60_000],
  [checkHeat, 15_000],
])

const notEnoughFundsLog = (token: viem.Hex, availableAddresses: viem.Hex[]) => {
  log('not enough funds. deposit token %o to any of the following addresses %o',
    token,
    availableAddresses,
  )
}

export const main = async () => {
  await threads.main(intervals)
}
