import * as msgboard from '@pulsechain/msgboard'
import { publicClient } from './chain'

export const msgBoard = () => new msgboard.MsgBoard({
  send: (method: any, params: any) => {
    return publicClient.request({
      method,
      params,
    })
  },
}, {
  breakInterval: 30_000n,
})
