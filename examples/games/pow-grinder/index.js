// Loads the prebuilt native addon for the current platform. The `.node` files are build artifacts
// (gitignored) — built by `cargo build --release --features napi` + copied to
// `pow-grinder.<platform>-<arch>.node` (see scripts/build-native.sh); CI builds the linux one.
const { platform, arch } = process
const candidates = [`./pow-grinder.${platform}-${arch}.node`, './pow-grinder.node']

let binding
let lastErr
for (const c of candidates) {
  try {
    binding = require(c)
    break
  } catch (e) {
    lastErr = e
  }
}
if (!binding) {
  throw new Error(
    `@gibs/pow-grinder: no native addon for ${platform}-${arch}. ` +
      `Build it: cargo build --release --features napi (in examples/games/pow-grinder). ` +
      `Last error: ${lastErr && lastErr.message}`,
  )
}

// stamp(category: Buffer[32], data: Buffer, workMultiplier, workDivisor, blockHash: Buffer[32],
//       startNonce, maxIters) -> Buffer(40) = nonce_be(8) ‖ hash(32), or null.
module.exports = { stamp: binding.stamp }
