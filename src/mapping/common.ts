import { Address, Bytes, BigInt as BI, dataSource, ethereum, crypto } from "@graphprotocol/graph-ts"

import {
  Transaction,
  Block,
} from "../../generated/schema"

const size = 32

export function getBlock(b: ethereum.Block): Block {
  const id = b.hash
  let block = Block.load(id)
  if (!block) block = new Block(id)
  block.hash = b.hash
  block.timestamp = b.timestamp
  block.number = b.number
  block.save()
  return block
}

export function getTransaction(tx: ethereum.Transaction, block: Block): Transaction {
  const id = tx.hash
  let transaction = Transaction.load(id)
  if (!transaction) transaction = new Transaction(id)
  transaction.hash = tx.hash
  transaction.block = block.id
  transaction.index = tx.index
  transaction.save()
  return transaction
}

export function location(sec: Bytes, index: BI): Bytes {
  return sec.concat(fromBigInt(index))
}

const emptyBytes32 = new Uint8Array(size)

export function fromBigInt(int: BI): Bytes {
  const bigIntBytes = Bytes.fromBigInt(int)
  const bytes32 = emptyBytes32.slice(0)
  const offset = bytes32.byteLength - bigIntBytes.byteLength
  if (offset < 0) {
    throw new Error('too many bigint bytes')
  }
  for (let i = 0; i < size; i++) {
    bytes32[offset + i] = bigIntBytes[i]
  }
  return Bytes.fromUint8Array(bytes32)
}

export function section(_provider: Address, _token: Address, _price: BI, _offset: BI): Bytes {
  const provider = Bytes.fromByteArray(_provider)
  const token = Bytes.fromByteArray(_token)
  const price = fromBigInt(_price)
  const offset = fromBigInt(_offset)
  const input = provider.concat(token).concat(price).concat(offset)
  return Bytes.fromByteArray(crypto.keccak256(input))
}

export function scopeId(bytes: Bytes): Bytes {
  return Bytes.fromUTF8(dataSource.network())
    .concat(Bytes.fromByteArray(dataSource.address()))
    .concat(bytes)
}

export function scopeEventId(eventKey: string, key: Bytes): Bytes {
  return scopeId(Bytes.fromUTF8(eventKey).concat(key))
}

export function dataToPreimages(data: Bytes): Bytes[] {
  const chunks: Bytes[] = []
  const count = data.length / size
  for (let i = 0; i < count; i++) {
    const startIndex = i * size
    const bytes32 = data.slice(startIndex, startIndex + size)
    chunks.push(Bytes.fromUint8Array(bytes32))
  }
  return chunks
}
