// Off-chain circom -> PLONK proving harness, reusable across circuits.
//
// Pipeline per circuit: circom compile (r1cs + wasm) -> `plonk setup` against the REAL
// universal Hermez powers-of-tau (downloaded + integrity-checked, cached under build/) ->
// zkey -> prove(input) / verify(proof, publicSignals).
//
// WHY PLONK (and why there is no ceremony machinery in this file anymore):
// Groth16 requires a PER-CIRCUIT phase-2 ceremony that must be re-run on EVERY circuit
// change. This package used to fake that phase-2 with a fixed public dev beacon, which made
// the toxic waste effectively public — i.e. anyone could forge a winning proof and drain the
// house. PLONK consumes the SAME universal ptau for any circuit and has NO per-circuit setup,
// so `plonk setup` below IS the complete setup: there is no contribute/beacon step to get
// wrong, and no toxic waste to leak. The dev-beacon apparatus is gone for good.
//
// The one remaining trust assumption is the Hermez ptau itself — a real, audited multi-party
// perpetual-powers-of-tau ceremony output, trusted here as such (we do not generate it).

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// snarkjs ships no type declarations; treat it as `any`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import * as snarkjs from 'snarkjs'

type PlonkProof = any
type PublicSignals = string[]

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const PACKAGE_ROOT = path.resolve(__dirname, '..')
export const CIRCUITS_DIR = path.join(PACKAGE_ROOT, 'circuits')
export const BUILD_DIR = path.join(PACKAGE_ROOT, 'build')
export const NODE_MODULES_DIR = path.join(PACKAGE_ROOT, 'node_modules')

/**
 * The universal ptau power every circuit in this package uses. PLONK's domain is the next
 * power of two >= (constraints + public inputs), and PLONK expands a circuit relative to its
 * R1CS constraint count, so this is sized for the largest circuit:
 *
 *   sudoku_solve  22,948 R1CS -> 34,245 PLONK constraints -> 2^16 domain  (overflows 2^15)
 *   wordle_solve   ~4.4k R1CS -> well under 2^16
 *   wordle_clue    ~1.5k R1CS -> well under 2^16
 *
 * A LARGER ptau works fine for a smaller circuit, so all three share this one file. If a
 * circuit ever outgrows it, bump to the next Hermez power (18, 20, ...) and update the URL +
 * digest below — the Hermez ptau is universal, so that is the ONLY change required: still no
 * per-circuit ceremony.
 */
export const HERMEZ_PTAU_POWER = 16
const HERMEZ_PTAU_FILE = `powersOfTau28_hez_final_${HERMEZ_PTAU_POWER}.ptau`
const HERMEZ_PTAU_URL = `https://storage.googleapis.com/zkevm/ptau/${HERMEZ_PTAU_FILE}`
/**
 * SHA-256 of the Hermez ptau, pinned so a re-download (or a corrupted/substituted cache) can
 * never silently swap the setup out from under the committed verifiers. This pins the ARTIFACT;
 * it is not itself evidence the ceremony was honest — that is the documented trust assumption
 * above. The file's own internal consistency + contribution chain is checkable independently
 * with `snarkjs powersoftau verify build/powersOfTau28_hez_final_16.ptau`.
 */
const HERMEZ_PTAU_SHA256 = '1c401abb57c9ce531370f3015c3e75c0892e0f32b8b1e94ace0f6682d9695922'

function circomBin(): string {
  return process.env.CIRCOM_BIN ?? 'circom'
}

function sh(cmd: string, args: string[]) {
  execFileSync(cmd, args, { stdio: 'pipe' })
}

function sha256File(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex')
}

export interface CompiledCircuit {
  name: string
  r1csPath: string
  wasmPath: string
}

/** Compile circuits/<name>.circom -> build/<name>/{name}.r1cs + wasm (cached). */
export function compileCircuit(name: string): CompiledCircuit {
  const outDir = path.join(BUILD_DIR, name)
  const r1csPath = path.join(outDir, `${name}.r1cs`)
  const wasmPath = path.join(outDir, `${name}_js`, `${name}.wasm`)
  if (!existsSync(r1csPath) || !existsSync(wasmPath)) {
    mkdirSync(outDir, { recursive: true })
    const circuitPath = path.join(CIRCUITS_DIR, `${name}.circom`)
    sh(circomBin(), [circuitPath, '--r1cs', '--wasm', '--sym', '-l', NODE_MODULES_DIR, '-o', outDir])
  }
  return { name, r1csPath, wasmPath }
}

/**
 * The REAL universal Hermez powers-of-tau, cached under build/ (fetched on first use, then
 * integrity-checked against HERMEZ_PTAU_SHA256 on EVERY call — including cache hits, so a
 * corrupted cache is caught rather than silently used).
 *
 * This is a plain fetch of a published ceremony artifact — there is deliberately no local
 * `powersoftau new/contribute/beacon/prepare phase2` path. Generating our own would recreate
 * exactly the knowable-toxic-waste problem PLONK is here to eliminate.
 */
export function ensurePtau(): string {
  const ptauPath = path.join(BUILD_DIR, HERMEZ_PTAU_FILE)
  if (!existsSync(ptauPath)) {
    mkdirSync(BUILD_DIR, { recursive: true })
    // eslint-disable-next-line no-console
    console.log(`[harness] fetching ${HERMEZ_PTAU_URL} (~76MB, once)...`)
    sh('curl', ['-fsSL', '-o', ptauPath, HERMEZ_PTAU_URL])
  }
  const got = sha256File(ptauPath)
  if (got !== HERMEZ_PTAU_SHA256) {
    throw new Error(
      `harness: ${HERMEZ_PTAU_FILE} failed its integrity check (sha256 ${got}, expected ` +
        `${HERMEZ_PTAU_SHA256}). Refusing to run a setup against an unverified ptau — delete ` +
        `${ptauPath} to re-fetch it from ${HERMEZ_PTAU_URL}.`,
    )
  }
  return ptauPath
}

export interface CircuitSetup {
  name: string
  wasmPath: string
  zkeyPath: string
  vkey: object
}

/**
 * `plonk setup` for a compiled circuit against the universal Hermez ptau (cached).
 *
 * This is the COMPLETE setup. Unlike groth16, there is no phase-2 contribution/beacon step —
 * PLONK derives the circuit's proving/verifying key deterministically from the universal ptau,
 * so this function has no entropy of its own and nothing to leak.
 */
export function setupCircuit(name: string): CircuitSetup {
  const { r1csPath, wasmPath } = compileCircuit(name)
  const ptauPath = ensurePtau()
  const outDir = path.join(BUILD_DIR, name)
  const zkeyPath = path.join(outDir, `${name}_plonk.zkey`)
  const vkeyPath = path.join(outDir, `${name}_plonk_vkey.json`)
  const bin = path.join(NODE_MODULES_DIR, '.bin', 'snarkjs')
  if (!existsSync(zkeyPath)) {
    sh(bin, ['plonk', 'setup', r1csPath, ptauPath, zkeyPath])
  }
  if (!existsSync(vkeyPath)) {
    sh(bin, ['zkey', 'export', 'verificationkey', zkeyPath, vkeyPath])
  }
  const vkey = JSON.parse(readFileSync(vkeyPath, 'utf8')) as object
  return { name, wasmPath, zkeyPath, vkey }
}

export type CircuitInput = Record<string, unknown>

/** Runs witness generation + PLONK prove. Throws if a constraint fails. */
export async function prove(
  setup: CircuitSetup,
  input: CircuitInput,
): Promise<{ proof: PlonkProof; publicSignals: PublicSignals }> {
  const { proof, publicSignals } = await snarkjs.plonk.fullProve(input, setup.wasmPath, setup.zkeyPath)
  return { proof, publicSignals }
}

export async function verify(
  setup: CircuitSetup,
  publicSignals: PublicSignals,
  proof: PlonkProof,
): Promise<boolean> {
  return snarkjs.plonk.verify(setup.vkey, publicSignals, proof)
}

/**
 * The 24 field elements of a PLONK proof, in the exact order the generated Solidity
 * `verifyProof(uint256[24] _proof, uint256[N] _pubSignals)` expects — i.e. snarkjs's own
 * `plonk.exportSolidityCallData` order. Deriving it from that function (rather than hand-packing
 * proof.A/proof.B/...) is what keeps the fixture and the on-chain verifier from drifting.
 */
export async function proofToCalldata(
  proof: PlonkProof,
  publicSignals: PublicSignals,
): Promise<string[]> {
  const calldata: string = await snarkjs.plonk.exportSolidityCallData(proof, publicSignals)
  const fields = (calldata.match(/0x[0-9a-fA-F]+/g) ?? []).map((h) => BigInt(h).toString())
  const expected = 24 + publicSignals.length
  if (fields.length !== expected) {
    throw new Error(
      `harness: expected ${expected} calldata fields (24 proof + ${publicSignals.length} public), got ${fields.length}`,
    )
  }
  return fields.slice(0, 24)
}

/**
 * Export the generated PLONK Solidity verifier for a zkey, renamed to `contractName` (snarkjs
 * always emits `contract PlonkVerifier`, which would collide across circuits and with the
 * vendored uzkge PlonkVerifier). Returns the source; callers write it next to the fixture they
 * generate from the SAME zkey in the SAME pass — see the generator scripts.
 */
export function exportSolidityVerifier(
  setup: CircuitSetup,
  contractName: string,
  header: string,
): string {
  const bin = path.join(NODE_MODULES_DIR, '.bin', 'snarkjs')
  const raw = path.join(BUILD_DIR, setup.name, `${contractName}.raw.sol`)
  execFileSync(bin, ['zkey', 'export', 'solidityverifier', setup.zkeyPath, raw], { stdio: 'pipe' })
  let sol = readFileSync(raw, 'utf8')
  sol = sol.replace(/contract\s+PlonkVerifier\b/, `contract ${contractName}`)
  // drop snarkjs's leading SPDX line so our header's SPDX is the only one
  sol = sol.replace(/^\/\/ SPDX-License-Identifier:[^\n]*\n/, '')
  return header + sol
}

/** Write `contents` to `outPath`, creating parents. */
export function writeGenerated(outPath: string, contents: string) {
  mkdirSync(path.dirname(outPath), { recursive: true })
  writeFileSync(outPath, contents)
  // eslint-disable-next-line no-console
  console.log(`[gen] wrote ${outPath}`)
}
