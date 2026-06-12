import { keccak256, stringToHex, recoverMessageAddress, type Hex } from 'viem'

export interface Envelope {
  tableId: Hex
  seq: number
  prev: Hex          // head hash before this entry (chain link)
  kind: string       // 'KEYGEN' | 'SHUFFLE' | 'DEAL_SHARE' | game moves...
  body: unknown      // JSON-serializable; hex blobs inside
  from: Hex          // signer address
  sig: Hex           // EIP-191 over the entry digest
}

export interface EnvelopeSigner {
  address: Hex
  signMessage(a: { message: { raw: Hex } }): Promise<Hex>
}

const GENESIS: Hex = `0x${'00'.repeat(32)}`

/**
 * Digest is keccak256 of a deterministic JSON serialisation.
 * Key order is fixed by the object literal — body keys are produced and
 * consumed by the same code, so ordering is stable for v0.
 */
export function entryDigest(e: Omit<Envelope, 'sig' | 'from'>): Hex {
  return keccak256(
    stringToHex(
      JSON.stringify({
        tableId: e.tableId,
        seq: e.seq,
        prev: e.prev,
        kind: e.kind,
        body: e.body,
      }),
    ),
  )
}

export async function makeEnvelope(
  signer: EnvelopeSigner,
  tableId: Hex,
  seq: number,
  prev: Hex,
  kind: string,
  body: unknown,
): Promise<Envelope> {
  const partial = { tableId, seq, prev, kind, body }
  const sig = await signer.signMessage({ message: { raw: entryDigest(partial) } })
  return { ...partial, from: signer.address, sig }
}

export async function verifyEnvelope(e: Envelope): Promise<boolean> {
  try {
    const rec = await recoverMessageAddress({
      message: { raw: entryDigest(e) },
      signature: e.sig,
    })
    return rec.toLowerCase() === e.from.toLowerCase()
  } catch {
    return false
  }
}

export class Transcript {
  entries: Envelope[] = []
  head: Hex = GENESIS
  constructor(public tableId: Hex) {}

  append(e: Envelope): void {
    if (e.tableId !== this.tableId) throw new Error('transcript: wrong table')
    if (e.seq !== this.entries.length)
      throw new Error(`transcript: seq must be ${this.entries.length}`)
    if (e.prev !== this.head) throw new Error('transcript: chain break (prev != head)')
    this.entries.push(e)
    this.head = keccak256(`${this.head}${entryDigest(e).slice(2)}` as Hex)
  }

  /** Full re-verification: chain links, seqs, signatures, signer membership. */
  async verify(parties: { A: Hex; B: Hex }): Promise<boolean> {
    let head: Hex = GENESIS
    const ok = new Set([parties.A.toLowerCase(), parties.B.toLowerCase()])
    for (const [i, e] of this.entries.entries()) {
      if (e.seq !== i || e.prev !== head || e.tableId !== this.tableId) return false
      if (!ok.has(e.from.toLowerCase())) return false
      if (!(await verifyEnvelope(e))) return false
      head = keccak256(`${head}${entryDigest(e).slice(2)}` as Hex)
    }
    return head === this.head
  }

  toJSON(): string {
    return JSON.stringify({ tableId: this.tableId, head: this.head, entries: this.entries })
  }

  static fromJSON(s: string): Transcript {
    const o = JSON.parse(s) as { tableId: Hex; head: Hex; entries: Envelope[] }
    const t = new Transcript(o.tableId)
    t.entries = o.entries
    t.head = o.head
    return t
  }
}
