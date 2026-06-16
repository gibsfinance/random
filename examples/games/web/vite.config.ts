import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The MsgBoard PoW grinder runs in a Web Worker (powWorker.ts) that imports @msgboard/sdk, so the
  // worker bundle code-splits — which requires the ES module format (Vite's default 'iife' can't).
  worker: { format: 'es' },
  test: {
    include: ['test/**/*.test.ts'],
  },
})
