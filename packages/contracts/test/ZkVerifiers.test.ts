import { expect } from 'chai'
import hre from 'hardhat'
// joint and revealSample keys are unused here but retained because the fixture is a
// byte-exact provenance artifact from the pinned wasm.
import shuffleFixture from './fixtures/zypher-shuffle-head.json'
import revealFixture from './fixtures/zypher-reveal-snark.json'
import { revertedWithCustomError } from './expectations'

// Flatten a 52-card deck (each card is 4 field elements) into a flat uint256[] array.
// Mirrors the spike bench: `deck.flat().map(BigInt)`.
const flatDeck = (deck: string[][]): bigint[] => deck.flat().map((v) => BigInt(v))

describe('ZkVerifiers', () => {
  it('verify52: accepts a real spike-generated shuffle proof', async () => {
    const vk1 = await hre.viem.deployContract('VerifierKeyExtra1_52')
    const vk2 = await hre.viem.deployContract('VerifierKeyExtra2_52')
    const shuffler = await hre.viem.deployContract('ShuffleVerifier52', [vk1.address, vk2.address])

    const pi: bigint[] = [...flatDeck(shuffleFixture.before), ...flatDeck(shuffleFixture.after)]
    const pkc: bigint[] = shuffleFixture.pkc.map((v) => BigInt(v))
    const proof = shuffleFixture.proof as `0x${string}`

    const publicClient = await hre.viem.getPublicClient()
    const { result } = await publicClient.simulateContract({
      address: shuffler.address,
      abi: shuffler.abi,
      functionName: 'verify52',
      args: [proof, pi, pkc],
      gas: 30_000_000n,
    })
    expect(result).to.equal(true)
  })

  it('verify52: rejects a tampered proof', async () => {
    const vk1 = await hre.viem.deployContract('VerifierKeyExtra1_52')
    const vk2 = await hre.viem.deployContract('VerifierKeyExtra2_52')
    const shuffler = await hre.viem.deployContract('ShuffleVerifier52', [vk1.address, vk2.address])

    const pi: bigint[] = [...flatDeck(shuffleFixture.before), ...flatDeck(shuffleFixture.after)]
    const pkc: bigint[] = shuffleFixture.pkc.map((v) => BigInt(v))
    // Flip the last byte of the proof to invalidate it.
    const good = shuffleFixture.proof
    const tampered = (good.slice(0, -2) + (good.slice(-2) === 'ff' ? '00' : 'ff')) as `0x${string}`

    const publicClient = await hre.viem.getPublicClient()
    await revertedWithCustomError(
      shuffler,
      publicClient.simulateContract({
        address: shuffler.address,
        abi: shuffler.abi,
        functionName: 'verify52',
        args: [tampered, pi, pkc],
        gas: 30_000_000n,
      }),
      'InvalidShuffleProof',
    )
  })

  it('verifyRevealWithSnark: accepts a real Groth16 reveal proof', async () => {
    const reveal = await hre.viem.deployContract('RevealVerifier')

    const pi = revealFixture.pi.map((v) => BigInt(v)) as unknown as readonly [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
    ]
    const zkproof = revealFixture.zkproof.map((v) => BigInt(v)) as unknown as readonly [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
    ]

    const ok = await reveal.read.verifyRevealWithSnark([pi, zkproof])
    expect(ok).to.equal(true)
  })
})
