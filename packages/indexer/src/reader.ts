import { ponder } from "@/generated";
import { scopedId, upsertBlock, upsertTransaction } from "./utils";

ponder.on('Reader:Ok', async ({ event, context }) => {
  await upsertBlock(context, event)
  const tx = await upsertTransaction(context, event)
  await context.db.Pointer.update({
    id: scopedId.pointer(context, event.args.section),
    data: {
      lastOkTransactionId: tx.id,
    },
  })
})
