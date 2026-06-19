/**
 * Unit tests for the PulseChain-safe gas helpers. Pure functions — no node needed. We assert the
 * exact PulseChain shape (live ~5 gwei price) resolves to a sane buffered LEGACY price, and that
 * the degenerate / misuse cases are handled.
 */
import { expect } from 'chai'
import { bufferedLegacyFee, resolveLegacyFee, bufferedGasLimit } from '../scripts/gas'

const GWEI = 1_000_000_000n

describe('gas helpers (PulseChain-safe legacy fee)', () => {
  it('buffers the live price 2x by default', () => {
    expect(bufferedLegacyFee(5n * GWEI).gasPrice).to.equal(10n * GWEI)
  })

  it('PulseChain shape: live 5 gwei → 10 gwei legacy (well above the ~7 wei base fee)', () => {
    // 943 reports eth_gasPrice ~5 gwei while baseFee ~7 wei; a 2x legacy price clears it comfortably.
    const { gasPrice } = bufferedLegacyFee(5n * GWEI)
    expect(gasPrice).to.equal(10n * GWEI)
    expect(gasPrice > 7n).to.equal(true) // dwarfs the base fee
  })

  it('honours a custom buffer', () => {
    expect(bufferedLegacyFee(5n * GWEI, { bufferBps: 15_000n }).gasPrice).to.equal((5n * GWEI * 15_000n) / 10_000n)
  })

  it('applies the floor when the chain reports a near-zero price', () => {
    expect(bufferedLegacyFee(0n).gasPrice).to.equal(1n * GWEI) // default 1 gwei floor
    expect(bufferedLegacyFee(1n, { floorWei: 2n * GWEI }).gasPrice).to.equal(2n * GWEI)
  })

  it('does not floor when the buffered price already exceeds it', () => {
    expect(bufferedLegacyFee(5n * GWEI, { floorWei: 1n * GWEI }).gasPrice).to.equal(10n * GWEI)
  })

  it('rejects a negative price and a sub-1x buffer (would underprice)', () => {
    expect(() => bufferedLegacyFee(-1n)).to.throw(/non-negative/)
    expect(() => bufferedLegacyFee(5n * GWEI, { bufferBps: 9_999n })).to.throw(/>= 10000/)
  })

  it('resolveLegacyFee reads the live price from the source then buffers', async () => {
    const source = { getGasPrice: async () => 5n * GWEI }
    expect((await resolveLegacyFee(source)).gasPrice).to.equal(10n * GWEI)
  })

  it('bufferedGasLimit pads an estimate 1.3x and caps under the block limit', () => {
    expect(bufferedGasLimit(1_700_000n)).to.equal((1_700_000n * 13_000n) / 10_000n) // 2,210,000
    expect(bufferedGasLimit(28_000_000n)).to.equal(29_000_000n) // capped
    expect(() => bufferedGasLimit(0n)).to.throw(/positive/)
  })
})
