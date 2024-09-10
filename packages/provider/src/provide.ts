import * as viem from 'viem'
import * as threads from './threads'
import { indexer } from './indexer'
import { signers } from './signers'
import config from '../config'
import { generatePreimages, generateSecret, generateSeed, type ShieldedSecret } from './randomenss'
import { addresses, contracts, getLatestBaseFee, token } from './contracts'
import { chain, publicClient } from './chain'
import { slot } from './slots'
import { db } from './db'
import { tableNames, type Tx } from './db/tables'
import * as randomUtils from '@gibs/random/lib/utils'
import _ from 'lodash'
import { log } from './logger'
import type { Secret } from 'knex/types/tables'
import type { Random$Type } from "@gibs/random/artifacts/contracts/Random.sol/Random";
import type { StreamConfig } from './types'

const outstandingSecrets = () => (
  db.select('*').from(tableNames.secret)
    .whereNull('section')
    .whereILike('randomContractAddress', addresses().random)
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
    const templates = _(existingOutstanding)
      .map('template')
      .uniq()
      .value() as viem.Hex[]
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
            if (updated.length && updated.length !== data.length) {
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
    await writePreimages({
      start,
      delta,
      template,
      preimages,
      randomConfig,
    })
  }))
}

const writePreimages = async ({
  start,
  delta,
  template,
  preimages,
  randomConfig,
}: {
  start: bigint;
  delta: bigint;
  template: randomUtils.PreimageInfo;
  preimages: ShieldedSecret[];
  randomConfig: StreamConfig;
}) => {
  const { wallets } = await signers()
  log('images %o', preimages.length)
  const templateHash = randomUtils.template(template)
  const insertable = preimages.map((p) => ({
    ...p,
    template: templateHash,
    random: addresses().random,
    chainId: chain.id,
  }))
  const preimageHashes = preimages.map(({ preimage }) => preimage)
  const cost = template.price * BigInt(preimages.length)
  const tkn = template.token
  const dealingInNative = tkn === viem.zeroAddress
  await db.transaction(async (tx) => {
    try {
      await tx.insert(insertable).into(tableNames.secret)
    } catch (err) {
      log(err)
      log('something went wrong when trying to insert new preimages %o - %o', start, start + delta)
      return
    }
    let funderIdx = -1
    let deposited!: bigint
    let available!: bigint
    for (const funderIndex of randomConfig.funder) {
      ; ([deposited, available] = await hasAdequateDeposits(tkn, wallets[funderIndex]))
      if (deposited >= cost) {
        available = 0n
        funderIdx = funderIndex
        break
      } else if (available >= cost) {
        if ((tkn !== viem.zeroAddress) || (available / 2n >= cost)) {
          funderIdx = funderIndex
          available /= 2n
          deposited = 0n
          break
        }
      }
    }
    const logNotEnoughFunds = () => (
      notEnoughFundsLog(tkn, randomConfig.funder.map((idx) => (
        wallets[idx].account!.address
      )))
    )
    if (funderIdx === -1) {
      logNotEnoughFunds()
      return
    }
    const funder = wallets[funderIdx]
    if (cost <= deposited) {
      await writeInk({
        template,
        funder,
        preimages: preimageHashes,
      }, tx)
      return
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
      await writeInk({
        template,
        funder,
        preimages: preimageHashes,
        value: deficit,
      }, tx)
      return
    }
    const t = token(tkn)
    const tokenBalance = await t.read.balanceOf([funder.account!.address])
    if (tokenBalance < deficit) {
      logNotEnoughFunds()
      return
    }

    // this area of this function is untested
    const randAddress = contracts().random.address
    const allowance = await t.read.allowance([
      funder.account!.address,
      randAddress,
    ])
    if (allowance < deficit) {
      const approveTxHash = await t.write.approve([randAddress, viem.maxUint256], {
        account: funder.account!,
      })
      log('waiting for approval %o', approveTxHash)
      await publicClient.waitForTransactionReceipt({
        hash: approveTxHash,
      })
    }
    const targets: viem.Hex[] = [
      randAddress,
      randAddress,
    ]
    const data: viem.Hex[] = [
      viem.encodeFunctionData({
        abi: contracts().random.abi,
        functionName: 'handoff',
        args: [viem.zeroAddress, tkn, -deficit],
      }),
      viem.encodeFunctionData({
        abi: contracts().random.abi,
        functionName: 'ink',
        args: [template, viem.concatHex(preimageHashes)],
      }),
    ]
    const values: bigint[] = [0n, 0n]
    const depositAndInkHash = await contracts().multicallerWithSender
      .write.aggregateWithSender([
        targets,
        data,
        values,
      ], {
        account: funder.account!,
        value: 0n,
      })
    const transaction = await updateDbAfterInkTx({
      preimages: preimageHashes,
      hash: depositAndInkHash,
      from: funder.account!.address,
    }, tx)
    await tx.insert({
      transactionId: transaction.transactionId,
      type: 'handoff',
    }).into(tableNames.transactionAction)
  })
}

const writeInk = async ({
  template,
  funder,
  preimages,
  value = 0n,
}: {
  template: randomUtils.PreimageInfo;
  funder: viem.WalletClient;
  preimages: viem.Hex[];
  value?: bigint;
}, tx: Tx) => {
  const concatPreimages = viem.concatHex(preimages)
  const inkTx = await contracts().random.write.ink([template, concatPreimages], {
    account: funder.account!,
    value,
  })
  return await updateDbAfterInkTx({
    from: funder.account!.address,
    hash: inkTx,
    preimages,
  }, tx)
}

const updateDbAfterInkTx = async ({
  preimages,
  from,
  hash,
}: {
  preimages: viem.Hex[]
  from: viem.Hex;
  hash: viem.Hex;
}, tx: Tx) => {
  const [transaction] = await tx.insert({
    from,
    to: contracts().random.address,
    hash,
    chainId: chain.id,
  }).into(tableNames.transaction)
    .returning('*')
  await tx.update({
    inkTransactionId: transaction.transactionId,
  }).from(tableNames.secret).whereIn('preimage', preimages)
  await tx.insert({
    transactionId: transaction.transactionId,
    type: 'ink',
  }).into(tableNames.transactionAction)
  return transaction
}

const templatesWithOutstanding = async () => {
  const uniq = await db.distinct<Secret[]>('template')
    .from(tableNames.secret)
    .whereNull('revealTransactionId')
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
  const { pointers } = await indexer.requestsForSecrets({
    provider: provider.account!.address,
    template_in: templates,
  })
  const preimagesObjects = pointers.items.flatMap(({
    preimages,
    provider,
    token,
    duration,
    durationIsTimestamp,
    price,
    offset,
  }) => (
    preimages!.items.map((preimage) => ({
      location: {
        provider: provider as viem.Hex,
        token: token as viem.Hex,
        duration,
        durationIsTimestamp,
        price,
        offset,
        index: BigInt(preimage.index),
      },
      data: preimage.data as viem.Hex,
      heat: preimage.heat,
    }))
  ))
  const sorted = _.sortBy(preimagesObjects, [
    (p) => +p.heat!.transaction.block.timestamp,
    (p) => +p.heat!.transaction.index,
    (p) => +p.heat!.index,
  ])
  const preimageHashes = sorted.map(({ data }) => data) as viem.Hex[]

  const preimageToSecret = await generateSecretsFromPreimages(preimageHashes)
  const { random, multicallerWithSender } = contracts()
  const lastBaseFee = await getLatestBaseFee()
  const overrides = {
    account: provider.account!,
    gasLimit: 100_000n * BigInt(preimageToSecret.size),
    maxFeePerGas: lastBaseFee * 2n,
    maxPriorityFeePerGas: lastBaseFee > 10n ? lastBaseFee / 10n : 1n,
    type: 'eip1559',
  } as const
  if (preimageToSecret.size === 0) return
  let revealTx!: viem.Hex
  const targets = (new Array(preimageToSecret.size)).fill(random.address)
  if (targets.length === 1) {
    const [first] = sorted
    const secret = preimageToSecret.get(first.data)!
    revealTx = await random.write.reveal(
      [first.location, secret],
      overrides,
    )
  } else {
    const data = sorted.map((input) => (
      viem.encodeFunctionData({
        abi: random.abi as Random$Type["abi"],
        functionName: 'reveal',
        args: [input.location, preimageToSecret.get(input.data)!],
      })
    ))
    const values = (new Array(targets.length)).fill(0n)
    revealTx = await multicallerWithSender.write.aggregateWithSender(
      [targets, data, values],
      overrides,
    )
  }
  await db.transaction(async (tx) => {
    const [transaction] = await tx.insert({
      hash: revealTx,
      chainId: chain.id,
    })
      .into(tableNames.transaction)
      .returning('*')
    await tx(tableNames.secret).update({
      revealTransactionId: transaction.transactionId,
    }).whereIn('preimage', preimageHashes)
    await tx(tableNames.transactionAction)
      .insert({
        type: 'reveal',
        transactionId: transaction.transactionId,
      })
  })
  log('reveal %o: %o', targets.length, revealTx)
  await publicClient.waitForTransactionReceipt({
    hash: revealTx,
  })
}

const checkResults = async () => {
  const templates = await templatesWithOutstanding()
  if (!templates.length) {
    return
  }
  await checkHeat()
  // const msgboard = msgBoard()
  // const contents = await msgboard.content()
  // for (const p of sorted) {
  //   const preimage = p.data as viem.Hex
  //   const messages = contents[preimage] || {}
  //   const secret = preimageToSecret.get(preimage)!
  //   if (Object.entries(messages).find(([_key, { data }]) => data === secret)) {
  //     log('existing work     %o', preimage)
  //     continue
  //   }
  //   log('performing work   %o', preimage)
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
  //   const msgboard = msgBoard()
  //   const work = await msgboard.doPoW(preimage, secret)
  //   const id = await msgboard.add(work.toRLP())
  //   log('added work        %o', preimage)
  // }
}

const hasAdequateDeposits = async (tkn: viem.Hex, runner: viem.WalletClient) => {
  const depositedBalance = await contracts().random.read.balanceOf([runner.account!.address, tkn])
  let tokenBalance = 0n
  if (tkn === viem.zeroAddress) {
    tokenBalance = await publicClient.getBalance({
      address: runner.account!.address,
    })
  } else {
    const t = token(tkn)
    tokenBalance = await t.read.balanceOf([runner.account!.address])
  }
  return [depositedBalance, tokenBalance]
}

const intervals = new Map<threads.Runner, number>([
  [checkSurplus, 120_000],
  [checkResults, 10_000],
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
