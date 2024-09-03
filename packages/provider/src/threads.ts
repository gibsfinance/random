import { setTimeout } from "timers/promises"

export type Runner = () => Promise<void>

export const main = async (intervals: Map<Runner, number>) => {
  const list: ReturnType<Runner>[] = []
  for (const [fn, delay] of intervals.entries()) {
    const logErrAndContinue = (err: unknown) => {
      console.log(err)
    }
    const runner = async () => {
      await setTimeout(delay)
      await fn().catch(logErrAndContinue)
      return runner()
    }
    list.push(fn().catch(logErrAndContinue).then(runner))
  }
  await Promise.all(list)
}
