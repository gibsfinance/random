import {
  Pointer,
} from "../../generated/schema"
import * as ReaderEvents from '../../generated/Reader/Reader'

import * as common from './common'

export function handleOkEvent(event: ReaderEvents.Ok): void {
  const block = common.getBlock(event.block)
  const transaction = common.getTransaction(event.transaction, block)
  const pointerId = common.scopeId(event.params.section)
  const pointer = Pointer.load(pointerId)!
  pointer.lastOk = transaction.id
  pointer.save()
}
