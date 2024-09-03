import { publicClient } from "./chain"
import * as msgboard from '@pulsechain/msgboard'

let msgB!: msgboard.MsgBoard


process.on('message', async (data: string) => {
  const msgBoard = msgB = msgB || new msgboard.MsgBoard({
    send: (method: any, params: any) => {
      return publicClient.request({
        method,
        params,
      })
    },
  })
  const msg = JSON.parse(data)
  if ((msg as any).cancel) {
    return msgB.cancel()
  }
  console.log(msg)
  if (msg.work) {
    const status = await msgBoard.status()
    const multiplier = BigInt(msg.start)
    const easy = BigInt(status.easyFactor) * multiplier
    const hard = BigInt(status.hardFactor) * multiplier
    // msgBoard.difficultyFactor
    console.log('setting difficulty factor', hard, easy)
    msgboard.setDifficultyFactor(hard, easy)
    const work = await msgBoard.doPoW(msg.category, msg.data)
    process.send?.(work.toJSON())
  }
})

process.send?.('msg')
