import { describe, it, expect } from 'vitest'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { Transcript, makeEnvelope, verifyEnvelope } from '../src/transcript'
import { LocalTransport } from '../src/transport'

const A = privateKeyToAccount(generatePrivateKey())
const B = privateKeyToAccount(generatePrivateKey())
const tableId = ('0x' + 'cd'.repeat(32)) as `0x${string}`

describe('transcript', () => {
  it('appends signed envelopes, hash-chained, and verifies end to end', async () => {
    const t = new Transcript(tableId)
    const e1 = await makeEnvelope(A, tableId, 0, t.head, 'KEYGEN', { pub: '0x01' })
    t.append(e1)
    const e2 = await makeEnvelope(B, tableId, 1, t.head, 'KEYGEN', { pub: '0x02' })
    t.append(e2)
    expect(t.entries).toHaveLength(2)
    expect(await t.verify({ A: A.address, B: B.address })).toBe(true)
  })
  it('rejects out-of-order seq and broken chain', async () => {
    const t = new Transcript(tableId)
    const e1 = await makeEnvelope(A, tableId, 0, t.head, 'X', {})
    t.append(e1)
    const wrongSeq = await makeEnvelope(B, tableId, 5, t.head, 'X', {})
    expect(() => t.append(wrongSeq)).toThrow(/seq/)
    const wrongPrev = await makeEnvelope(B, tableId, 1, ('0x' + 'ee'.repeat(32)) as `0x${string}`, 'X', {})
    expect(() => t.append(wrongPrev)).toThrow(/chain/)
  })
  it('verify fails if a body is tampered after the fact', async () => {
    const t = new Transcript(tableId)
    t.append(await makeEnvelope(A, tableId, 0, t.head, 'X', { v: 1 }))
    ;(t.entries[0]!.body as any).v = 2
    expect(await verifyEnvelope(t.entries[0]!)).toBe(false)
    expect(await t.verify({ A: A.address, B: B.address })).toBe(false)
  })
  it('round-trips through JSON', async () => {
    const t = new Transcript(tableId)
    t.append(await makeEnvelope(A, tableId, 0, t.head, 'X', { v: 1 }))
    const t2 = Transcript.fromJSON(t.toJSON())
    expect(await t2.verify({ A: A.address, B: B.address })).toBe(true)
  })
})

describe('local transport', () => {
  it('delivers both directions; drop injection loses messages', async () => {
    const [ta, tb] = LocalTransport.pair()
    const got: string[] = []
    const back: string[] = []
    tb.onMessage((m) => got.push(m as string))
    ta.onMessage((m) => back.push(m as string))
    await ta.send('one')
    ta.dropNext()
    await ta.send('two')
    await ta.send('three')
    await tb.send('back')
    await new Promise((r) => setTimeout(r, 10))
    expect(got).toEqual(['one', 'three'])
    expect(back).toEqual(['back'])
  })
})
