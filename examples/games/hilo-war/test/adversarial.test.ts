import { describe, it, expect } from 'vitest'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import {
  AttestedElGamalDeck, LocalTransport, TEST_DOMAIN, buildEvidence,
  remask, deserializePoint, serializeMasked, deserializeMasked,
} from '@gibs/zk-cards-core'
import type { MaskedDeckProvider, WireMasked, WireShare, WireShuffle, ShuffleSigner } from '@gibs/zk-cards-core'
import { keccak256, concatHex, type Hex } from 'viem'
import { Player, openSession } from '../src/session'

const ANTE = 5n, ESCROW_EACH = 100n

function freshPair(opts: { deckA?: MaskedDeckProvider; deckB?: MaskedDeckProvider; escrowEach?: bigint } = {}) {
  const escrowEach = opts.escrowEach ?? ESCROW_EACH
  const [ta, tb] = LocalTransport.pair()
  const wa = privateKeyToAccount(generatePrivateKey())
  const wb = privateKeyToAccount(generatePrivateKey())
  const fallback = new AttestedElGamalDeck()
  const tableId = ('0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')) as Hex
  const a = new Player({ role: 'A', wallet: wa, peer: wb.address, transport: ta, deck: opts.deckA ?? fallback, domain: TEST_DOMAIN, tableId, ante: ANTE, escrowEach })
  const b = new Player({ role: 'B', wallet: wb, peer: wa.address, transport: tb, deck: opts.deckB ?? fallback, domain: TEST_DOMAIN, tableId, ante: ANTE, escrowEach })
  return { a, b, ta, tb }
}

/** sends a syntactically valid point that is NOT a correct decryption share */
class GarbageShareDeck extends AttestedElGamalDeck {
  override async share(secret: Hex, card: WireMasked, ctx: string): Promise<WireShare> {
    const good = await super.share(secret, card, ctx)
    // a share for a DIFFERENT ciphertext: proof won't verify against `card`
    const other = await super.share(secret, { c1: card.c2, c2: card.c1 }, ctx)
    return { share: other.share, proof: good.proof }
  }
}

// digest helpers copied from attestedDeck.ts (they are private there); the
// parent's verifyShuffle recomputes exactly this over (before, after.deck)
function deckDigest(deck: WireMasked[]): Hex {
  return keccak256(concatHex(deck.flatMap((m) => [m.c1, m.c2])))
}
function shuffleDigest(before: WireMasked[], after: WireMasked[]): Hex {
  return keccak256(concatHex([deckDigest(before), deckDigest(after)]))
}

/** valid attested shuffle that permutes nothing — makes card order deterministic */
class IdentityShuffleDeck extends AttestedElGamalDeck {
  override async shuffle(agg: Hex, deck: WireMasked[], signer: ShuffleSigner): Promise<WireShuffle> {
    // mirror AttestedElGamalDeck.shuffle minus the Fisher–Yates permutation
    const A = deserializePoint(agg)
    const out = deck.map((w) => serializeMasked(remask(A, deserializeMasked(w))))
    const proof = await signer.signMessage({ message: { raw: shuffleDigest(deck, out) } })
    return { deck: out, proof }
  }
}

describe('adversarial sessions', () => {
  it('bad deal share is rejected with a thrown error', async () => {
    const { a, b } = freshPair({ deckB: new GarbageShareDeck() })
    await openSession(a, b)
    await expect(Promise.all([
      a.playFlip({ bet: 'HOLD', onRaise: 'CALL' }),
      b.playFlip({ bet: 'HOLD', onRaise: 'CALL' }),
    ])).rejects.toThrow(/bad deal share/)
  })

  it('stall mid-flip yields dispute evidence with the right demand', async () => {
    const { a, b, tb } = freshPair({})
    await openSession(a, b)
    tb.dropNext(99) // B's outbound black-holes; A will stall awaiting the deal share
    const flip = a.playFlip({ bet: 'HOLD', onRaise: 'CALL' })
    const outcome = await Promise.race([
      flip.then(() => 'DONE'),
      new Promise((r) => setTimeout(() => r('TIMEOUT'), 300)),
    ])
    expect(outcome).toBe('TIMEOUT')
    const ev = buildEvidence({
      coSigned: a.channel.latest!, transcript: a.transcript, sinceSeq: 0,
      demand: { from: 'B', kind: 'DEAL_SHARE', detail: 'share owed for the open flip' },
    })
    expect(ev.state.nonce).toBe(0n)         // stalled before any flip co-sign
    expect(ev.demand.from).toBe('B')
    expect(ev.messages.length).toBeGreaterThanOrEqual(1) // A's outbound deal share is in her log
    flip.catch(() => {})                     // park the pending promise
  })

  it('replayed stale co-signed state is rejected by the channel', async () => {
    const { a, b } = freshPair({})
    await openSession(a, b)
    await Promise.all([a.playFlip({ bet: 'HOLD', onRaise: 'CALL' }), b.playFlip({ bet: 'HOLD', onRaise: 'CALL' })])
    const stale = a.channel.latest!
    await Promise.all([a.playFlip({ bet: 'HOLD', onRaise: 'CALL' }), b.playFlip({ bet: 'HOLD', onRaise: 'CALL' })])
    await expect(b.channel.accept(stale)).rejects.toThrow(/nonce/)
  })

  it('identity deck: every flip ties; war pot accumulates through co-signed states', async () => {
    const deck = new IdentityShuffleDeck()
    const { a, b } = freshPair({ deckA: deck, deckB: deck })
    await openSession(a, b)
    // identity shuffle → slots (0,1)=2♣/2♦, (2,3)=2♥/2♠, (4,5)=3♣/3♦: all ties
    const expectations = [10n, 20n, 30n]
    for (const expectedWarPot of expectations) {
      const [ra] = await Promise.all([
        a.playFlip({ bet: 'HOLD', onRaise: 'CALL' }),
        b.playFlip({ bet: 'HOLD', onRaise: 'CALL' }),
      ])
      expect(ra.flip.result).toBeNull()
      expect(ra.flip.warPot).toBe(expectedWarPot)
      const s = a.channel.latest!.state
      expect(s.pot).toBe(expectedWarPot)                       // carry lives in the channel pot
      expect(s.balanceA + s.balanceB + s.pot).toBe(2n * ESCROW_EACH)
    }
  })

  it('session pipelining: a second table opens while the first is unsettled', async () => {
    const { a, b } = freshPair({})
    await openSession(a, b)
    await Promise.all([a.playFlip({ bet: 'HOLD', onRaise: 'CALL' }), b.playFlip({ bet: 'HOLD', onRaise: 'CALL' })])
    // no settle for table 1 — open table 2 immediately
    const second = freshPair({})
    await openSession(second.a, second.b)
    expect(second.a.channel.latest!.state.nonce).toBe(0n)
    expect(a.channel.latest!.state.nonce).toBeGreaterThan(0n)  // table 1 untouched, unsettled, independent
    // cfg is private on Player; the tableId comparison is test-only introspection
    expect((second.a as any).cfg.tableId).not.toBe((a as any).cfg.tableId)
  })

  it('reshuffle: 26 flips exhaust the deck and play continues with conservation intact', async () => {
    // escrowEach 1000n: 27 flips swing ±10 each — 100n could go bust mid-run on an
    // unlucky deck and flake the test on a negative-balance throw
    const { a, b } = freshPair({ escrowEach: 1000n })
    await openSession(a, b)
    for (let k = 0; k < 27; k++) {
      await Promise.all([a.playFlip({ bet: 'HOLD', onRaise: 'CALL' }), b.playFlip({ bet: 'HOLD', onRaise: 'CALL' })])
    }
    const s = a.channel.latest!.state
    expect(s.balanceA + s.balanceB + s.pot).toBe(2000n)
  }, 120_000)
})
