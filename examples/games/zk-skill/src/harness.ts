// Off-chain circom -> Groth16 proving harness, reusable across circuits.
//
// Pipeline per circuit: circom compile (r1cs + wasm) -> dev powers-of-tau
// (generated once, shared, cached under build/) -> groth16 setup -> zkey ->
// prove(input) / verify(proof, publicSignals).
//
// NOTE: the powers-of-tau + zkey produced here are a DEV/TEST-ONLY trusted
// setup (fixed entropy, single contribution, no final beacon). They are
// good enough to prove the circuit logic off-chain (this package's whole
// point) but MUST NOT be reused for any real/production deployment — a
// real ceremony belongs to the M1 on-chain milestone.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// snarkjs ships no type declarations; treat it as `any`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import * as snarkjs from 'snarkjs'

type Groth16Proof = any
type PublicSignals = string[]

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const PACKAGE_ROOT = path.resolve(__dirname, '..')
export const CIRCUITS_DIR = path.join(PACKAGE_ROOT, 'circuits')
export const BUILD_DIR = path.join(PACKAGE_ROOT, 'build')
export const NODE_MODULES_DIR = path.join(PACKAGE_ROOT, 'node_modules')

const DEV_ENTROPY = 'zk-skill-m0-dev-entropy-not-for-production'

function circomBin(): string {
  return process.env.CIRCOM_BIN ?? 'circom'
}

function sh(cmd: string, args: string[]) {
  execFileSync(cmd, args, { stdio: 'pipe' })
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

/** Dev powers-of-tau, prepared for phase2, cached per `power` under build/. */
export function ensurePtau(power: number): string {
  const finalPath = path.join(BUILD_DIR, `pot${power}_final.ptau`)
  if (existsSync(finalPath)) return finalPath
  mkdirSync(BUILD_DIR, { recursive: true })
  const bin = path.join(NODE_MODULES_DIR, '.bin', 'snarkjs')
  const pot0 = path.join(BUILD_DIR, `pot${power}_0000.ptau`)
  const pot1 = path.join(BUILD_DIR, `pot${power}_0001.ptau`)
  sh(bin, ['powersoftau', 'new', 'bn128', String(power), pot0])
  sh(bin, ['powersoftau', 'contribute', pot0, pot1, '--name=zk-skill-m0-dev', `-e=${DEV_ENTROPY}`])
  sh(bin, ['powersoftau', 'prepare', 'phase2', pot1, finalPath])
  return finalPath
}

export interface CircuitSetup {
  name: string
  wasmPath: string
  zkeyPath: string
  vkey: object
}

/** groth16 setup for a compiled circuit against a prepared ptau (cached). */
export function setupCircuit(name: string, ptauPower: number): CircuitSetup {
  const { r1csPath, wasmPath } = compileCircuit(name)
  const ptauPath = ensurePtau(ptauPower)
  const outDir = path.join(BUILD_DIR, name)
  const zkeyPath = path.join(outDir, `${name}_final.zkey`)
  const vkeyPath = path.join(outDir, `${name}_vkey.json`)
  const bin = path.join(NODE_MODULES_DIR, '.bin', 'snarkjs')
  if (!existsSync(zkeyPath)) {
    sh(bin, ['groth16', 'setup', r1csPath, ptauPath, zkeyPath])
  }
  if (!existsSync(vkeyPath)) {
    sh(bin, ['zkey', 'export', 'verificationkey', zkeyPath, vkeyPath])
  }
  const vkey = JSON.parse(readFileSync(vkeyPath, 'utf8')) as object
  return { name, wasmPath, zkeyPath, vkey }
}

export type CircuitInput = Record<string, unknown>

/** Runs witness generation + groth16 prove. Throws if a constraint fails. */
export async function prove(
  setup: CircuitSetup,
  input: CircuitInput,
): Promise<{ proof: Groth16Proof; publicSignals: PublicSignals }> {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    setup.wasmPath,
    setup.zkeyPath,
  )
  return { proof, publicSignals }
}

export async function verify(
  setup: CircuitSetup,
  publicSignals: PublicSignals,
  proof: Groth16Proof,
): Promise<boolean> {
  return snarkjs.groth16.verify(setup.vkey, publicSignals, proof)
}
