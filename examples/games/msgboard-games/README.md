# @gibs/msgboard-games

Off-chain broadcast/session substrate for instant player-vs-house games.

This package implements the **off-chain layer only**: provably-fair round settlement, EIP-712 co-signed state transitions, and a hash-chained transcript. On-chain settlement (HouseChannel contract, ZkTable dispute path) is deliberately deferred to a later plan. This package never submits a transaction.

---

## SessionState tuple

```ts
interface SessionState {
  tableId: Hex         // bytes32 — session identifier
  nonce: bigint        // uint64, strictly increasing, one per round
  balancePlayer: bigint // uint256 chip units
  balanceHouse: bigint
  settlementMode: number // uint8: 0 = optimistic, 1 = escrowed, 2 = zk
  gameId: number         // uint8: 1 = dice, 2 = limbo
  gameStateHash: Hex     // bytes32, keccak256(game.encodeRound(...))
  rngCommit: Hex         // bytes32, server-seed hash-chain head for this session
}
```

Both parties EIP-712 co-sign every `SessionState` (see `signSessionState` / `SESSION_STATE_TYPES`). The tuple order is consensus — a future Solidity mirror must match it exactly.

---

## Provably-fair RNG

The house pre-commits to a seed chain before the session opens:

```
seeds[L] = secret tip
seeds[i] = keccak256(seeds[i+1])  for i = L-1 .. 0
rngCommit = seeds[0]   ← published in the OPEN envelope
```

Round *k* (1-indexed) uses `seeds[k]`. Each reveal is verified against the prior chain link (`keccak256(revealed) === priorLink`), giving the **stake.com-style reveal-on-rotation** property: the house cannot change a future seed after committing.

Round randomness combines all three inputs so neither party can grind independently:

```
roundRandom = uint256(keccak256(abi.encode(serverSeed, clientSeed, nonce)))
```

The player supplies `clientSeed` per round; `nonce` equals the round index.

---

## Game seam

```ts
interface Game<TParams> {
  gameId: number
  settleRound(stake: bigint, params: TParams, raw: bigint): RoundOutcome
  encodeRound(stake: bigint, params: TParams, raw: bigint): Hex  // abi-encoded preimage of gameStateHash
}
```

### Dice (`gameId = 1`)

- Roll space: `[0, 9999]` (0.00%–99.99%)
- Win condition: `roll < targetX100`
- Multiplier: `floor((10000 − 100) × 10000 / targetX100 / 100)` hundredths
- Example: target 54.50% (`targetX100 = 5450`) → 1.81× multiplier
- House edge: 1% (`EDGE_BPS = 100`)

Matches the morbius formula: `mult = 99 / target`.

### Limbo (`gameId = 2`)

- Uniform space: `u ∈ [0, 999_999]`
- Result multiplier: `floor(99 × 1_000_000 / (1_000_000 − u))` hundredths
- Win condition: `resultX100 >= targetX100`
- Win chance: `(1 − edge) / target` = `99 × 10000 / targetX100` hundredths-of-a-percent
- Example: target 5.00× (`targetX100 = 500`) → win chance 19.80%

Matches morbius: `winChance = 99 / target`.

All arithmetic is `bigint` fixed-point in hundredths; no floating-point.

---

## Transport

```ts
interface Transport {
  send(msg: unknown): Promise<void>
  onMessage(handler: MessageHandler): void
}
```

Two implementations:

- **`LocalTransport`** — in-memory, synchronous delivery via microtask. Supports fault injection (`dropNext(n)`, `delayMs`). Used in all tests.
- **`MsgBoardTransport`** — broadcasts over `@msgboard/sdk` under a per-table category (`mbg:<tableId>`). Designed for real deployments; callers call `poll()` to receive inbound messages. The board is ephemeral by design — the retained transcript is the evidence, not the board.

---

## Transcript and post-session verification

Every session event (OPEN, ROUND) is appended as a signed `Envelope`:

```ts
interface Envelope {
  tableId: Hex; seq: number; prev: Hex  // hash-chain link
  kind: string; body: unknown
  from: Hex; sig: Hex                    // EIP-191 over the entry digest
}
```

The entry digest is abi-structured (`keccak256(abi.encode(tableId, seq, prev, keccak256(kind), keccak256(body)))`), so an on-chain adjudicator can recompute it from calldata.

`verifyFinishedSession(transcriptJson, ctx)` re-verifies a whole session from the transcript JSON alone:

1. Chain links, sequence numbers, and EIP-191 envelope signatures (`Transcript.verify`)
2. The published `rngCommit` matches `ctx.commit`
3. Every server-seed reveal is valid against the chain
4. Every round outcome is recomputed from `(serverSeed, clientSeed, nonce)` and matches the recorded values
5. Both parties' EIP-712 co-signatures on every reconstructed `SessionState`

This is the "board is ephemeral, evidence is retained locally" property from the design spec.

---

## Running

```sh
# tests (34 cases)
pnpm test

# type-check
pnpm typecheck

# runnable demo: two sessions (Dice + Limbo), 10 rounds each, final transcript verify
pnpm demo
```

---

Design spec: `docs/superpowers/specs/2026-06-13-msgboard-games-design.md` (in the msgboard repo).
