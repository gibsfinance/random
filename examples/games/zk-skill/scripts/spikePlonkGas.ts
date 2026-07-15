// SPIKE (not part of the build/test path): generate REAL groth16 + PLONK proofs for the SAME
// sudoku_solve circuit + vector, and emit foundry fixtures so test/foundry/ProofSystemGas.t.sol can
// measure on-chain verify gas for each. Answers: "what does dropping the Groth16 per-circuit trusted
// setup (→ PLONK's universal setup) cost in gas?"
//
//   pnpm --filter @gibs/zk-skill exec tsx scripts/spikePlonkGas.ts

import { writeFileSync } from 'node:fs'
import path from 'node:path'
// @ts-expect-error - snarkjs ships no types
import * as snarkjs from 'snarkjs'
import { buildSudokuWitnessInput } from '../src/sudoku.js'
import { BUILD_DIR } from '../src/harness.js'

const SOLUTION: number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9,
  4, 5, 6, 7, 8, 9, 1, 2, 3,
  7, 8, 9, 1, 2, 3, 4, 5, 6,
  2, 3, 1, 5, 6, 4, 8, 9, 7,
  5, 6, 4, 8, 9, 7, 2, 3, 1,
  8, 9, 7, 2, 3, 1, 5, 6, 4,
  3, 1, 2, 6, 4, 5, 9, 7, 8,
  6, 4, 5, 9, 7, 8, 3, 1, 2,
  9, 7, 8, 3, 1, 2, 6, 4, 5,
]
const PUZZLE: number[] = SOLUTION.map((v, i) => (Math.floor(i / 9) === 0 || i % 9 === 0 ? v : 0))
const PLAYER = BigInt('0xabababababababababababababababababababab')

const dir = path.join(BUILD_DIR, 'sudoku_solve')
const wasm = path.join(dir, 'sudoku_solve_js', 'sudoku_solve.wasm')

/** snarkjs exportSolidityCallData emits a JS-array-ish string; pull every 0x-hex field out in order. */
function hexFields(calldata: string): string[] {
  return (calldata.match(/0x[0-9a-fA-F]+/g) ?? []).map((h) => BigInt(h).toString())
}

async function main() {
  const input = await buildSudokuWitnessInput({ puzzle: PUZZLE, solution: SOLUTION, player: PLAYER })

  // --- groth16 (current baseline: per-circuit phase-2 setup required) ---
  const g16 = await snarkjs.groth16.fullProve(input, wasm, path.join(dir, 'sudoku_solve_final.zkey'))
  const g16ok = await snarkjs.groth16.verify(
    JSON.parse(await snarkjs.zKey.exportVerificationKey(path.join(dir, 'sudoku_solve_final.zkey')).then((v: unknown) => JSON.stringify(v))),
    g16.publicSignals,
    g16.proof,
  )
  if (!g16ok) throw new Error('groth16 proof failed to verify off-chain')

  // --- plonk (universal setup: NO per-circuit ceremony) ---
  const plonkZkey = path.join(dir, 'sudoku_plonk.zkey')
  const pl = await snarkjs.plonk.fullProve(input, wasm, plonkZkey)
  const plVkey = await snarkjs.zKey.exportVerificationKey(plonkZkey)
  const plok = await snarkjs.plonk.verify(plVkey, pl.publicSignals, pl.proof)
  if (!plok) throw new Error('plonk proof failed to verify off-chain')

  // sanity: both systems must agree on the public signals for the same witness
  if (JSON.stringify(g16.publicSignals) !== JSON.stringify(pl.publicSignals)) {
    throw new Error('public signals diverge between groth16 and plonk')
  }

  const g16Cd = hexFields(await snarkjs.groth16.exportSolidityCallData(g16.proof, g16.publicSignals))
  const plCd = hexFields(await snarkjs.plonk.exportSolidityCallData(pl.proof, pl.publicSignals))

  // groth16 calldata order: pA[2], pB[2][2] (rows swapped for the verifier), pC[2], pub[83]
  const out = {
    _comment:
      'SPIKE fixture (scripts/spikePlonkGas.ts): real groth16 + PLONK proofs for the SAME sudoku_solve circuit/vector. Used by ProofSystemGas.t.sol to compare on-chain verify gas.',
    publicSignals: g16.publicSignals,
    groth16: {
      pA: g16Cd.slice(0, 2),
      pB0: g16Cd.slice(2, 4),
      pB1: g16Cd.slice(4, 6),
      pC: g16Cd.slice(6, 8),
    },
    // plonk calldata: proof[24] then the public signals
    plonk: { proof: plCd.slice(0, 24) },
  }
  const outPath = path.resolve(
    BUILD_DIR,
    '../../../../packages/contracts/test/foundry/fixtures/proofSystemGas.json',
  )
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log('groth16 pub len:', g16.publicSignals.length, '| plonk proof fields:', plCd.slice(0, 24).length)
  console.log('wrote', outPath)
}

main().then(() => process.exit(0))
