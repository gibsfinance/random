import * as viem from 'viem'
import * as threads from './threads'
import { indexer } from './indexer'
import { signers } from './signers'
import config from '../config'
import { generatePreimages, generateSecret, generateSeed, type ShieldedSecret } from './randomness'
import { addresses, contracts, getLatestBaseFee, token } from './contracts'
import { chain, publicClient } from './chain'
import { db } from './db'
import { tableNames, type Tx } from './db/tables'
import * as randomUtils from '@gibs/random/lib/utils'
import _ from 'lodash'
import { log } from './logger'
import type { Secret, Transaction } from 'knex/types/tables'
import type { Random$Type } from "@gibs/random/artifacts/contracts/Random.sol/Random";
import type { StreamConfig } from './types'
import type { Preimage } from './gql/graphql'
import { status } from './utils'

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
  if (!(await status())) {
    return
  }
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
      slot: randomUtils.slot('count', {
        location: template,
      }),
    })
    const section = template
    const start = section.offset = BigInt(storage as viem.Hex)
    const delta = randomConfig.preimagesPerInk === 'max' ? randomUtils.max : BigInt(randomConfig.preimagesPerInk)
    let toIndex = start + delta
    if (delta > randomConfig.maxCoolPreimages) {
      log('bogus case')
      // handle this case later
      return
    }
    // writing more preimages is bottlenecked by outstanding transactions
    // if any are pending, then do not provide any new nonces
    const pendingTxs = await unminedTransactions()
    if (pendingTxs.length) {
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

/**
 * write preimages to chain using the random contract's ink method
 * @param param0 necessary inputs to write preimages to the chain and log them
 */
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
  if (!(await status())) {
    return
  }
  const { wallets } = await signers()
  log('images %o', preimages.length)
  const templateHash = randomUtils.template(template)
  const insertable = preimages.map((p) => ({
    ...p,
    template: templateHash,
    randomContractAddress: addresses().random,
    chainId: chain.id,
  }))
  const preimageHashes = preimages.map(({ preimage }) => preimage)
  const cost = template.price * BigInt(preimages.length)
  const tkn = template.token
  const dealingInNative = tkn === viem.zeroAddress
  const t = token(tkn)
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
  let deficit = cost - deposited
  const randAddress = contracts().random.address
  if (tkn !== viem.zeroAddress) {
    const tokenBalance = await t.read.balanceOf([funder.account!.address])
    if (tokenBalance < deficit) {
      logNotEnoughFunds()
      return
    }

    // this area of this function is untested
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
  }
  const transaction = await db.transaction(async (tx): Promise<Transaction | undefined> => {
    try {
      await tx.insert(insertable).into(tableNames.secret)
    } catch (err) {
      log(err)
      log('something went wrong when trying to insert new preimages %o - %o', start, start + delta)
      return
    }
    if (cost <= deposited) {
      return await writeInk({
        template,
        funder,
        preimages: preimageHashes,
      }, tx)
    }
    if (dealingInNative) {
      const available = await publicClient.getBalance({
        address: funder.account!.address,
      }) / 2n
      if (available < deficit) {
        log('deposit native tokens to %o', funder.account!.address)
        throw new Error('unable to complete')
      }
      console.log('dealing in native, writing, deficit %o', deficit)
      return await writeInk({
        template,
        funder,
        preimages: preimageHashes,
        value: deficit,
      }, tx)
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
    return transaction
  })
  if (transaction) {
    console.log('wrote ink: %o', transaction.hash)
    await publicClient.waitForTransactionReceipt({
      hash: transaction.hash,
    })
  }
}

/**
 * call the ink method and log the appropriate rows in db
 * @param param0 necessary inputs to write preimages to the chain
 * @param tx the database transaction that will log the appropriate rows
 * @returns transaction row that was inserted
 */
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

/**
 * generate a set of secrets given a set of preimage primary keys that exist in the db
 * @param preimages the preimages to key secrets against
 * @returns a mapping of preimages to secrets
 */
const generateSecretsFromPreimages = async (preimages: viem.Hex[]) => {
  const seed = generateSeed()
  const preimageInfo = await db.select('*')
    .from(tableNames.secret)
    .whereIn('preimage', preimages)
    .where('seedId', seed.id)
  const secrets = preimageInfo.map((preimageItem) => {
    return generateSecret(seed.key, Number(preimageItem.accountIndex))
  })
  return new Map<viem.Hex, viem.Hex>(preimageInfo.map((item, i) => ([
    item.preimage,
    secrets[i],
  ])))
}

const checkInk = async () => {
  if (!(await status())) {
    return
  }
  const { provider } = await signers()
  const { pointers } = await indexer.pointers({
    provider: provider.account!.address,
  })
  const chainId = `${chain.id}`
  for (const pointer of pointers.items) {
    const [{ count }] = await db.count('preimage')
      .from(tableNames.secret)
      .where('section', pointer.section)
    if (Number(count) === pointer.count) {
      continue
    }
    console.log('fetching section', pointer.section)
    const { preimages } = await indexer.preimages({
      section: pointer.section,
    })
    const start = BigInt(pointer.offset)
    const toIndex = start + BigInt(pointer.count)
    const generatedPreimages = await generatePreimages(start, toIndex)
    const sectionIndexToPreimage = new Map<number, Preimage>(
      preimages.items.map((preimage) => (
        // this index is relative to the section
        [preimage.index, preimage] as const
      ))
    )
    for (let i = 0; i < generatedPreimages.length; i++) {
      const gPre = generatedPreimages[i]
      const indexedPreimage = sectionIndexToPreimage.get(i)
      if (gPre.preimage !== indexedPreimage?.data) {
        console.log(gPre.preimage, indexedPreimage)
        throw new Error('preimage generated does not match!')
      }
    }
    const secrets = generatedPreimages.map((s) => ({
      ...s,
      template: pointer.template,
      randomContractAddress: addresses().random,
      chainId: chain.id,
    }))
    await db.insert(secrets).from(tableNames.secret)
      .onConflict(['preimage'])
      .ignore()
    console.log('updating %o to %o', start, toIndex)
    const preimageHashes = _.map(preimages.items, 'data')
    // update to upsert if tx does not exist (which is a likely scenario)
    let transaction = await db.select('*')
      .from(tableNames.transaction)
      .where('chainId', chainId)
      .where('hash', pointer.ink.transaction.hash)
      .first()
    if (!transaction) {
      const originalTx = await publicClient.getTransaction({
        hash: pointer.ink.transaction.hash as viem.Hex,
      })
      const inserted = await db.insert({
        chainId,
        hash: originalTx.hash,
        from: originalTx.from,
        to: originalTx.to,
      }).from(tableNames.transaction)
        .returning('*')
      transaction = inserted[0]
    }
    await db.update({
      inkTransactionId: transaction!.transactionId,
      section: pointer.section,
    }).from(tableNames.secret)
      .whereIn('preimage', preimageHashes)
  }
  const pendingTxs = await unminedTransactions()
  if (pendingTxs.length) {
    await Promise.all(pendingTxs.map(async (transaction) => {
      const receipt = await publicClient.getTransactionReceipt({
        hash: transaction.hash,
      })
      if (!receipt) {
        return
      }
      await updateMinedTx(receipt as viem.TransactionReceipt)
    }))
  }
}

/**
 * update the transaction row with relevant block data
 * @param receipt the receipt of the mined transaction
 * @param tx the database transaction
 */
const updateMinedTx = (receipt: viem.TransactionReceipt, tx: Tx = db) => (
  tx.update({
    blockNumber: receipt.blockNumber,
    transactionIndex: receipt.transactionIndex,
  }).from(tableNames.transaction).where({
    chainId: `${chain.id}`,
    hash: receipt.transactionHash,
  })
)

/**
 * get transaction rows with block number set to null (default)
 * @param tx the database transaction
 */
const unminedTransactions = (tx: Tx = db) => (
  tx.select('*')
    .from(tableNames.transaction)
    .whereNull('blockNumber')
)

const checkHeat = async () => {
  if (!(await status())) {
    return
  }
  const templates = await templatesWithOutstanding()
  if (!templates.length) {
    return
  }
  const { provider } = await signers()
  const { pointers } = await indexer.requestsForSecrets({
    provider: provider.account!.address,
    template_in: templates,
    remaining_gt: 0,
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
  if (!preimagesObjects.length) return
  const sorted = _.sortBy(preimagesObjects, [
    (p) => +p.heat!.transaction.block.timestamp,
    (p) => +p.heat!.transaction.index,
    (p) => +p.heat!.index,
  ])
  const preimageHashes = sorted.map(({ data }) => data) as viem.Hex[]

  console.log('revealing %o', preimageHashes)
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
      from: provider.account!.address,
      to: random.address,
    })
      .into(tableNames.transaction)
      .returning('*')
    await tx(tableNames.secret).update({
      revealTransactionId: transaction.transactionId,
      exposed: true,
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
  await Promise.all([
    checkInk(),
    checkHeat(),
  ])
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
