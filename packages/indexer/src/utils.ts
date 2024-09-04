import * as viem from 'viem'
import { Context } from '@/generated'
import { Block, TransactionReceipt } from '@ponder/core'

export const scopeId = (
  context: Context,
  key: string,
  hex: viem.Hex,
  bytes: viem.Hex | viem.ByteArray = viem.hexToBytes('0x'),
) => {
  return viem.bytesToHex(viem.concatBytes([
    viem.numberToBytes(context.network.chainId, { size: 32 }),
    viem.toBytes(key),
    viem.hexToBytes(hex),
    viem.isHex(bytes) ? viem.hexToBytes(bytes) : bytes,
  ]))
}

export const scopedId = {
  pointer: (c: Context, section: viem.Hex) => (
    scopeId(c, 'pointer', c.contracts.Random.address, section)
  ),
  preimage: (c: Context, location: viem.Hex) => (
    scopeId(c, 'preimage', c.contracts.Random.address, location)
  ),
  ink: (c: Context, section: viem.Hex) => (
    scopeId(c, 'ink', c.contracts.Random.address, section)
  ),
  heat: (c: Context, location: viem.Hex) => (
    scopeId(c, 'heat', c.contracts.Random.address, location)
  ),
  start: (c: Context, key: viem.Hex) => (
    scopeId(c, 'start', c.contracts.Random.address, key)
  ),
  reveal: (c: Context, location: viem.Hex) => (
    scopeId(c, 'reveal', c.contracts.Random.address, location)
  ),
  link: (c: Context, location: viem.Hex) => (
    scopeId(c, 'link', c.contracts.Random.address, location)
  ),
  cast: (c: Context, key: viem.Hex) => (
    scopeId(c, 'cast', c.contracts.Random.address, key)
  ),
  expired: (c: Context, key: viem.Hex) => (
    scopeId(c, 'expired', c.contracts.Random.address, key)
  ),
  bleach: (c: Context, section: viem.Hex) => (
    scopeId(c, 'bleach', c.contracts.Random.address, section)
  ),
  block: (c: Context, hash: viem.Hex, number: bigint) => (
    scopeId(c, 'block', hash, viem.numberToBytes(number))
  ),
  transaction: (c: Context, hash: viem.Hex) => (
    scopeId(c, 'block', hash)
  ),
}

export const upsertBlock = async (context: Context, event: {
  block: Block
}) => {
  const blockId = scopedId.block(context, event.block.hash, event.block.number)
  const create = {
    number: event.block.number,
    hash: event.block.hash,
    timestamp: event.block.timestamp,
  }
  return await context.db.Block.upsert({
    id: blockId,
    create,
    update: create,
  })
}

export const upsertTransaction = async (context: Context, event: {
  transactionReceipt: TransactionReceipt;
  block: Block;
}) => {
  const transactionId = scopedId.transaction(context, event.transactionReceipt.transactionHash)
  const blockId = scopedId.block(context, event.block.hash, event.block.number)
  const create = {
    index: Number(event.transactionReceipt.transactionIndex),
    hash: event.transactionReceipt.transactionHash,
    blockId: blockId,
  }
  return await context.db.Transaction.upsert({
    id: transactionId,
    create,
    update: create,
  })
}
