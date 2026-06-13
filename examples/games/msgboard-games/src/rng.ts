import { keccak256, encodeAbiParameters, hexToBigInt, type Hex } from 'viem'

export interface SeedChain {
  /** seeds[0] is the published commit; seeds[k] is round k's server seed (1-indexed). */
  seeds: Hex[]
  commit: Hex
  length: number
}

/** Build a hash chain from a secret tip: seed[L]=tip, seed[i]=keccak256(seed[i+1]).
 *  The house keeps the whole array, publishes only `commit = seed[0]`. Round k uses seed[k];
 *  there are `length` playable rounds (k = 1..length). */
export function buildSeedChain(tip: Hex, length: number): SeedChain {
  if (length < 1) throw new Error('rng: chain length must be >= 1')
  const seeds: Hex[] = new Array(length + 1)
  seeds[length] = tip
  for (let i = length - 1; i >= 0; i--) seeds[i] = keccak256(seeds[i + 1]!)
  return { seeds, commit: seeds[0]!, length }
}

/** A revealed seed is valid iff hashing it yields the previously-known (prior) link. */
export function verifyReveal(priorLink: Hex, revealed: Hex): boolean {
  return keccak256(revealed) === priorLink
}

/** Round randomness: uint256(keccak256(abi.encode(serverSeed, clientSeed, nonce))). */
export function roundRandom(serverSeed: Hex, clientSeed: Hex, nonce: bigint): bigint {
  const packed = encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint64' }],
    [serverSeed, clientSeed, nonce],
  )
  return hexToBigInt(keccak256(packed))
}
