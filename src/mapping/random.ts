import {
  Ink,
  Heat,
  Start,
  Reveal,
  Cast,
  Pointer,
  Preimage,
  Expired,
} from "../../generated/schema"
import * as RandomEvents from '../../generated/Random/Random'
import { Address, BigInt as BI, Bytes, crypto, dataSource, DataSourceContext, ethereum } from "@graphprotocol/graph-ts"

import * as common from './common'
import { Reader } from "../../generated/Reader/Reader"

export function handleBleachEvent(event: RandomEvents.Bleach): void {
  const ink = Ink.load(event.params.section)!
  const pointer = Pointer.load(ink.pointer)
  if (!pointer) {
    throw new Error('should not be possible')
  }
  const count = pointer.count.toI64()
  const preimages: Preimage[] = []
  for (let i = 0; i < count; i++) {
    const preimageId = common.location(event.params.section, BI.fromU64(i))
    const preimage = Preimage.load(preimageId)!
    preimage.accessed = true
    preimages.push(preimage)
  }
  pointer.remaining = BI.fromI32(0)
  preimages.forEach(function (preimage) {
    preimage.save()
  })
  pointer.save()
}

// export function handleCastCall(call: RandomEvents.CastCall): void {
//   const csv = call.inputs.info.map<string>(function (info) {
//     return [
//       info.provider.toHexString(),
//       info.token.toHexString(),
//       info.price.toHexString(),
//       info.offset.toHexString(),
//       info.index.toHexString(),
//     ].join(',')
//   }).join('\n')
//   const revealed = call.inputs.revealed.map<string>(function (revealed) {
//     return revealed.toHexString()
//   }).join('\n')
//   const context = new DataSourceContext()
//   context.setBytes('key', call.inputs.key)
//   context.setString('info', csv)
//   context.setString('revealed', revealed)
//   CastTemplate.createWithContext(dataSource.address(), context)
// }

function encodeLocation(provider: Address, token: Address, price: BI, offset: BI): Bytes {
  return ethereum.encode(ethereum.Value.fromTuple([
    ethereum.Value.fromBytes(addressToBytes32(provider)),
    ethereum.Value.fromBytes(addressToBytes32(token)),
    ethereum.Value.fromBytes(bigIntToBytes32(price)),
    ethereum.Value.fromBytes(bigIntToBytes32(offset)),
  ]))!
}

function getSectionData(provider: Address, token: Address, price: BI, offset: BI): Bytes {
  return addressToBytes32(provider)
    .concat(addressToBytes32(token))
    .concat(bigIntToBytes32(price))
    .concat(bigIntToBytes32(offset))
}

function addressToBytes32(addr: Address): Bytes {
  return addr.concat(new Bytes(12))
}

function bigIntToBytes32(int: BI): Bytes {
  return common.fromBigInt(int)
}

function getLocation(section: Bytes, index: number): Bytes {
  return crypto.keccak256(section.concat(bigIntToBytes32(BI.fromI32(index))))
}

export function handleInkEvent(event: RandomEvents.Ink): void {
  const pointerId = common.scopeId(event.params.pointer)
  const block = common.getBlock(event.block)
  const transaction = common.getTransaction(event.transaction, block)
  // increment id until an empty slot is found
  const section = getSectionData(event.params.provider, event.params.token, event.params.price, event.params.offset)
  const inkId = common.scopeId(section)
  const ink = new Ink(inkId)
  ink.transaction = transaction.id
  ink.index = event.logIndex
  // section info
  ink.section = section
  ink.provider = event.params.provider
  ink.token = event.params.token
  ink.price = event.params.price
  ink.offset = event.params.offset
  ink.pointer = pointerId
  // create pointer info
  const ctx = dataSource.context()
  const reader = Reader.bind(ctx.getBytes('reader'))
  const location = encodeLocation(event.params.provider, event.params.token, event.params.price, event.params.offset)
  const pointerParam = ethereum.Value.fromBytes(location)
  const [data] = reader.call('pointer', '(bytes)', [pointerParam])
  const preimages = preimagesFromData(data.toBytes())
  const count = BI.fromI32(preimages.length)

  let pointer = Pointer.load(pointerId)
  if (!pointer) pointer = new Pointer(pointerId)
  pointer.storage = event.params.pointer
  pointer.ink = inkId
  pointer.lastOk = transaction.id
  pointer.count = count
  pointer.remaining = count
  pointer.save()

  for (let i = 0; i < preimages.length; i++) {
    const data = preimages[i]
    const location = getLocation(section, i)
    const p = new Preimage(common.scopeId(location))
    p.index = BI.fromI32(i)
    p.pointer = pointer.id
    p.accessed = false
    p.data = data
    // p.secret = null
    // p.reveal event does not yet exist
    p.save()
  }
}

const size = 32

function preimagesFromData(b: Bytes): Bytes[] {
  const list: Bytes[] = []
  for (let s = 0; s < b.length; s += size) {
    list.push(Bytes.fromUint8Array(new Uint8Array(b.slice(s, s + size))))
  }
  return list
}

export function handleHeatEvent(event: RandomEvents.Heat): void {
  const heatEventId = common.scopeEventId('heat', event.params.location)
  const block = common.getBlock(event.block)
  const transaction = common.getTransaction(event.transaction, block)
  const preimageId = common.scopeId(event.params.location)
  const preimage = Preimage.load(preimageId)!
  const pointer = Pointer.load(preimage.pointer)!
  pointer.remaining = pointer.remaining.minus(BI.fromU64(1))
  pointer.save()

  let h = Heat.load(heatEventId)
  if (!h) h = new Heat(heatEventId)
  h.transaction = transaction.id
  h.index = event.logIndex
  h.preimage = preimage.id
  h.start = null
  h.save()
}

export function handleStartEvent(event: RandomEvents.Start): void {
  const startEventId = common.scopeEventId('start', event.params.key)
  const block = common.getBlock(event.block)
  const transaction = common.getTransaction(event.transaction, block)
  let s = Start.load(startEventId)
  if (!s) s = new Start(startEventId)
  s.owner = event.params.owner
  s.key = event.params.key
  s.transaction = transaction.id
  s.index = event.logIndex
  s.chopped = false
  s.save()
}

export function handleRevealEvent(event: RandomEvents.Reveal): void {
  const block = common.getBlock(event.block)
  const transaction = common.getTransaction(event.transaction, block)
  const preimageId = common.scopeId(event.params.location)
  const preimage = Preimage.load(preimageId)!
  let r = Reveal.load(preimageId)
  if (!r) r = new Reveal(preimageId)
  r.transaction = transaction.id
  r.index = event.logIndex
  r.preimage = preimage.id
  r.save()
}

export function handleCastEvent(event: RandomEvents.Cast): void {
  const castEventId = common.scopeEventId('cast', event.params.key)
  const block = common.getBlock(event.block)
  const transaction = common.getTransaction(event.transaction, block)
  const startEventId = common.scopeEventId('start', event.params.key)

  const start = Start.load(startEventId)!
  const revealIds = infoCsv.split('\n').map<Bytes>((row) => {
    const cells = row.split(',')
    const section = common.section(
      Address.fromString(cells[0]),
      Address.fromString(cells[1]),
      BI.fromUnsignedBytes(Bytes.fromHexString(cells[2])),
      BI.fromUnsignedBytes(Bytes.fromHexString(cells[3])),
    )
    return common.location(
      section,
      BI.fromUnsignedBytes(Bytes.fromHexString(cells[4])),
    )
  })

  let c = Cast.load(castEventId)
  if (!c) c = new Cast(castEventId)
  c.transaction = transaction.id
  c.index = event.logIndex
  c.start = start.id
  c.seed = event.params.seed
  c.reveal = revealIds
  c.save()
}

export function handleExpiredEvent(event: RandomEvents.Expired): void {
  const expiredEventId = common.scopeEventId('expired', event.params.key)
  const castEventId = common.scopeEventId('cast', event.params.key)

  const cast = Cast.load(castEventId)!
  cast.expired = castEventId
  cast.save()

  let e = Expired.load(expiredEventId)
  if (!e) e = new Expired(expiredEventId)
  e.recipient = event.params.recipient
  e.ender = event.params.ender
  e.save()
}

export function handleChopEvent(event: RandomEvents.Chop): void {
  const eventId = common.scopeEventId('chop', event.params.key)
  const start = Start.load(eventId)!
  start.chopped = true
  start.save()
}
