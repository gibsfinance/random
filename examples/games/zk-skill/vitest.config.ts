import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // circom compile + groth16 setup (dev ptau) is slow the first time per circuit.
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
})
