import {
  Start,
  Chain,
  ConsumerPreimage,
  Unveil,
  Undermine,
} from "../../generated/schema"
import {
  Chain as ChainTemplate,
} from '../../generated/templates'
import * as ConsumerEvents from '../../generated/Consumer/Consumer'
import { Bytes, dataSource, DataSourceContext } from "@graphprotocol/graph-ts"
import * as common from './common'

export function handleChainCall(call: ConsumerEvents.ChainCall): void {
  // const context = new DataSourceContext()
  // context.setBytes('preimage', call.inputs.preimage)
  // ChainTemplate.createWithContext(dataSource.address(), context)
}

export function handleChainToCall(call: ConsumerEvents.ChainToCall): void {
  // const context = new DataSourceContext()
  // context.setBytes('preimage', call.inputs.preimage)
  // ChainTemplate.createWithContext(dataSource.address(), context)
}

export function handleUnveilCall(call: ConsumerEvents.UnveilCall): void {
  const context = new DataSourceContext()
  context.setBytes('unveiledSecret', call.inputs.unveiledSecret)
  const contract = ConsumerEvents.Consumer.bind(dataSource.address())
  const link = contract.link(call.inputs.identifier)
  // const serializedLink = Bytes.fromUint8Array(viem.concatBytes([
  //   link.identifier,
  //   link.key,
  //   link.owner,
  //   // link.underminable,
  //   link.preimage,
  //   link.unveiled,
  // ]))
  context.setBytes('owner', link.owner)
  context.setBytes('unveiledSecret', call.inputs.unveiledSecret)
  ChainTemplate.createWithContext(dataSource.address(), context)
}

export function handleChainEvent(event: ConsumerEvents.Chain): void {
  const block = common.getBlock(event.block)
  const transaction = common.getTransaction(event.transaction, block)
  const chainEventId = common.scopeEventId('chain', common.fromBigInt(event.params.identifier))
  const consumerPreimageEventId = common.scopeEventId('consumerPreimage', common.fromBigInt(event.params.identifier))
  const startEventId = common.scopeEventId('start', event.params.key)
  const start = Start.load(startEventId)!
  const context = dataSource.context()

  let conPre = ConsumerPreimage.load(consumerPreimageEventId)
  if (!conPre) conPre = new ConsumerPreimage(consumerPreimageEventId)
  conPre.data = context.getBytes('preimage')
  conPre.secret = null
  conPre.save()

  let c = Chain.load(chainEventId)
  if (!c) c = new Chain(chainEventId)
  c.owner = event.params.owner
  c.identifier = event.params.identifier
  c.start = start.id
  c.transaction = transaction.id
  c.consumerPreimage = conPre.id
  c.save()
}

export function handleUnveilEvent(event: ConsumerEvents.Unveil): void {
  const block = common.getBlock(event.block)
  const transaction = common.getTransaction(event.transaction, block)
  const unveilEventId = common.scopeEventId('unveil', common.fromBigInt(event.params.identifier))
  const consumerPreimageEventId = common.scopeEventId('consumerPreimage', common.fromBigInt(event.params.identifier))

  const conPre = ConsumerPreimage.load(consumerPreimageEventId)!
  conPre.secret = event.params.unveiledSecret
  conPre.save()

  let u = Unveil.load(unveilEventId)
  if (!u) u = new Unveil(unveilEventId)
  u.transaction = transaction.id
  u.index = event.logIndex
  u.consumerPreimage = conPre.id
  u.save()
}

export function handleUndermineEvent(event: ConsumerEvents.Undermine): void {
  const block = common.getBlock(event.block)
  const transaction = common.getTransaction(event.transaction, block)
  const undermineEventId = common.scopeEventId('undermine', common.fromBigInt(event.params.identifier))
  const chainEventId = common.scopeEventId('chain', common.fromBigInt(event.params.identifier))
  const consumerPreimageEventId = common.scopeEventId('consumerPreimage', common.fromBigInt(event.params.identifier))
  const context = dataSource.context()
  const owner = context.getBytes('owner')
  const unveiledSecret = context.getBytes('unveiledSecret')

  const conPre = ConsumerPreimage.load(consumerPreimageEventId)!
  conPre.secret = unveiledSecret
  conPre.data = event.params.preimage
  conPre.save()

  let u = Undermine.load(undermineEventId)
  if (!u) u = new Undermine(undermineEventId)
  u.transaction = transaction.id
  u.owner = owner
  u.chain = chainEventId
  u.consumerPreimage = conPre.id
  u.save()
}
