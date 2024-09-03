import * as viem from 'viem'
import * as randomUtils from '@gibs/random/lib/utils'

type PreimageInfo = {
  provider: viem.Hex;
  price: bigint;
  durationIsTimestamp: boolean;
  duration: bigint;
  token: viem.Hex;
}

const slots = [
  'timeline',
  'seed',
  'latest',
  'custodied',
  'count',
] as const

const slotList = Object.values(slots)

export type Slot = typeof slotList[number]

const byteOptions = { size: 32, dir: 'left' } as const

export const slot = (slot: Slot, location: Partial<PreimageInfo>) => {
  const index = slots.indexOf(slot)
  if (slot === 'count') {
    return viem.keccak256(
      viem.concatBytes([
        viem.padBytes(viem.toBytes(location.provider!), byteOptions),
        viem.toBytes(randomUtils.encodeToken(location)),
        viem.numberToBytes(location.price!, byteOptions),
        viem.numberToBytes(index, byteOptions)
      ]),
    )
  }
  throw new Error('slot not defined')
}
