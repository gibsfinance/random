import * as viem from 'viem'
import _ from 'lodash'
import type { Context } from './utils'

export const revertedWithCustomError = async (contract: viem.GetContractReturnType, p: Promise<any>, errorName: string, args?: any[]) => {
  let threw = false
  let e!: Error
  try {
    await p
  } catch (err: any) {
    threw = true
    e = err
  }
  if (!threw) {
    throw new Error('expected revert, did not')
  }
  // const err = e as viem.SendTransactionErrorType
  const rpcError = e as viem.RpcError
  if (e) {
    // console.dir(rpcError.walk())
    if (rpcError.details && rpcError.details.includes(errorName)) {
      // check args
      if (!args || !args.length) {
        return
      }
      // be sure to implement args check!
    }
  }
  try {
    const er = rpcError.walk((err: unknown) => {
      return !!(err as any).data
    })
    const parsed = viem.decodeErrorResult({
      abi: contract.abi,
      data: (er as any).data,
    })
    if (parsed.errorName === errorName) {
      if (!parsed.args || _.isEqual(parsed.args, args)) {
        return
      }
    }
    console.log(parsed)
  } catch (err) {
    console.log('failed to parse', e)
  }
  throw new Error('unable to check error')
}

export const emit = async (ctx: Context, hash: viem.Hex, contract: viem.GetContractReturnType, eventName: string, args?: any[] | Record<string, any>) => {
  const client = await ctx.hre.viem.getPublicClient()
  const receipt = await client.getTransactionReceipt({
    hash,
  })
  const allEvents = viem.parseEventLogs({
    logs: receipt.logs,
    abi: contract.abi,
  })
  const filter = {
    eventName,
    address: contract.address,
  } as Partial<viem.ParseEventLogsReturnType<any, any, any, any>[0]>
  if (args) {
    let objectArgs!: Record<string, any>
    if (Array.isArray(args)) {
      const entry = _.find(contract.abi, {
        type: 'event',
        name: eventName,
      }) as viem.AbiEvent
      objectArgs = _.reduce(entry.inputs, (a, arg, i) => {
        a[arg.name!] = args[i]
        return a
      }, {} as Record<string, any>);
      (filter as any).args = objectArgs
    } else {
      objectArgs = args
    }
    (filter as any).args = objectArgs
  }
  const parsed = _.filter(allEvents, filter)
  if (!parsed.length) {
    throw new Error('unable to find event')
  }
}
