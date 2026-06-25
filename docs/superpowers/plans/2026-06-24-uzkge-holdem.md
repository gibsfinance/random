# Track 3 — N-party verifiable Texas Hold'em — IMPLEMENTATION PLAN (TDD)

- **Status:** PLAN. Implement nothing until reviewed. Each task is red→green→refactor with exact
  commands + expected output.
- **Date:** 2026-06-24
- **Spec (source of truth):** `docs/superpowers/specs/2026-06-24-uzkge-cards-design.md` — FOLLOW IT.
- **Repo:** `/Users/michaelmclaughlin/Documents/gibs-finance/random` (pnpm workspace).
- **Decision baked in (overrides spec Decision 1 recommendation):** build **full N-party Texas
  Hold'em directly** — but **sequence the work to de-risk**: prove the new multiplayer surface
  (N-party shuffle/reveal + N-party channel/pot + per-seat timeout) in Tasks 1–4 *before* poker
  rules (betting/side-pots/hand-ranking) pile on in Tasks 5–8.

---

## Goal

Ship a trust-minimized, single-table, **3–9 seat** verifiable Texas Hold'em game on the games
platform:

- The deck is **jointly encrypted** under all seats' deck keys, **collaboratively shuffled** (each
  seat shuffles+re-encrypts in turn; one honest shuffler ⇒ unknown order), and **selectively
  revealed** — hole cards to exactly one seat, community cards to all — via decryption shares proven
  correct with Chaum–Pedersen.
- Each shuffle/reveal is **one MsgBoard post** gated by the board's ~1–2s WASM PoW (anti-spam +
  pacing clock + timeout-window basis).
- **Settlement is on-chain** through an N-party escrow channel (`HoldemTableN.sol`): buy-ins escrow,
  betting/dealing run off-chain as N-of-N co-signed states, the chain is touched only to settle,
  dispute, or enforce a **per-seat forced-fold-on-timeout** so one disconnect cannot freeze N−1
  honest seats.
- Pot/side-pots/rake settled with a **per-pot `rakeBps` + absolute cap inside conservation**; an
  off-chain TS 5-card hand evaluator is normative, mirrored by a Solidity evaluator used only in
  disputed showdowns and **fuzz-parity-tested** against the TS one.

**Non-goal:** changing the proving system, building the Zypher SNARK shuffle prover, or any
on-chain shuffle verification. v1 reuses the existing **attested/secp256k1** deck stack generalized
to N parties.

---

## Architecture

```
 Seats 1..N (clients)        ┌──────────────────────────────────────────────┐
 each holds:                 │  N-party channel (off-chain, co-signed)        │
  - deck keypair (secp256k1) │  ChannelStateN: nonce, balances[N], pot,       │
  - wallet/channel key       │   sidePots[], rakeAccrued, deckCommitment,     │
                             │   phase, gameStateHash  (signed by ALL live seats)
                             └───────────────┬──────────────────────────────┘
                                             │ 1 shuffle / 1 reveal = 1 board post = 1 PoW (~1–2s)
                             ┌───────────────▼──────────────────────────────┐
                             │  MsgBoard transport (board.ts / transcript)   │
                             │  ephemeral broadcast; PoW anti-spam + tempo;  │
                             │  canonical order = hash-chained transcript     │
                             └───────────────┬──────────────────────────────┘
                                             │ settle / dispute / per-seat timeout
                             ┌───────────────▼──────────────────────────────┐
                             │  HoldemTableN.sol (NEW, N-party)              │
                             │  escrow[N], pot, sidePots, rake, N-of-N settle│
                             │  per-seat dispute machine (demandSeat),       │
                             │  forced-fold-on-timeout, Groth16 share dispute│
                             │  consults HoldemRules (IGameRulesN)           │
                             └───────────────────────────────────────────────┘
```

**On-chain vs off-chain boundary (thin chain — spec Decision 3a):**
- **Off-chain happy path (zero gas):** keygen, joint-key aggregation, N-party shuffle, per-card
  selective reveal, betting actions, hand evaluation, co-signing each `ChannelStateN`.
- **On-chain only on settle/dispute:** escrow buy-ins; verify N-of-N co-signed final state and pay
  pot/side-pots/rake; the dispute machine that, when a seat stalls, forces the owed move/share or
  forfeits *that seat's* current-hand stake on the chess clock (forced fold) while the table
  continues.
- **Deliberately NOT on-chain in v1:** the shuffle PLONK verify (~1.57M gas) and routine reveals.
  On-chain hand-ranking runs only in a disputed showdown.

---

## Tech Stack

- **Off-chain:** TypeScript ESM, `@noble/curves` (secp256k1), `viem` (EIP-712 / EIP-191 sig +
  recovery), `vitest`. New package `@gibs/holdem` mirrors `@gibs/hilo-war`; extends
  `@gibs/zk-cards-core` (which is N-agnostic crypto already).
- **On-chain:** Solidity `^0.8.24`, solc `0.8.25`, Solady (`EIP712`/`ECDSA`/`SafeTransferLib`),
  evm `shanghai`. Tests run under both **Foundry** (fuzz/invariant) and **Hardhat+viem** (TS↔Sol
  parity), mirroring the existing ZkTable/HiLoWar split.
- **Transport:** `@msgboard/sdk` via `examples/games/msgboard-games/src/board.ts` (PoW stamper,
  off-main-thread guard) — reused unchanged.

---

## Global Constraints (bake into every task)

1. **Full Hold'em, de-risk ordering.** Tasks 1–4 prove N-party shuffle/reveal + N-party channel +
   per-seat timeout with *no* poker rules. Tasks 5–8 layer betting/side-pots/hand-ranking on the
   already-proven rails.
2. **Phased attested prover (spec Decision 2a).** v1 uses the existing `AttestedElGamalDeck`
   generalized to N parties: real ElGamal hiding + Chaum–Pedersen share soundness, **attested**
   (signature) shuffle. NO external Zypher dependency. The real Baby-JubJub SNARK shuffle is a
   SEPARATE later spike; `MaskedDeckProvider` is the drop-in seam (out of scope here).
3. **Thin chain (spec Decision 3a).** On-chain = escrow + N-of-N co-signed settle + payout +
   dispute. Shuffle and routine reveals stay off-chain/disputable.
4. **Rake-in-conservation (spec Decision 4).** `rakeBps` with an absolute `rakeCap`, deducted at
   settle, included in the conservation invariant so every accepted state and every dispute payout
   consumes exactly `Σ escrow`.
5. **Per-seat timeout (spec Decision 4).** A stalling seat forfeits its current-hand stake into the
   pot via the chess clock (forced fold); the table never freezes for the honest majority.
6. **Attested-vs-SNARK boundary (spec §3.3, Risks 1–2).** v1 ships entirely on secp256k1 + attested
   shuffle. The vendored Groth16 `RevealVerifier` and `respondWithShare` are for the LATER SNARK
   path and are **DEFERRED in v1** (see Task 4 + Concerns). v1 SHARE disputes are answered by
   `respondWithState` (a strictly-newer co-signed state) or run the clock to forced-fold.

---

## Reused vs New

| Concern | Existing (reused) | New (built here) |
|---|---|---|
| ElGamal masked deck, joint-key aggregation | `zk-core/src/elgamal.ts` — `aggregatePubKeys` already reduces an N-list; `maskCard`/`remask`/`decryptionShare`/`unmaskWithShares` already N-share | — (consumed as-is) |
| Chaum–Pedersen share proof + verify | `zk-core/src/chaumPedersen.ts` | — (consumed as-is) |
| Crypto seam | `zk-core/src/maskedDeck.ts` `MaskedDeckProvider`; `attestedDeck.ts` `AttestedElGamalDeck` | thin N-party orchestration over the same provider (no provider change) |
| Hash-chained transcript + board PoW transport | `zk-core/src/transcript.ts`; `msgboard-games/src/board.ts`,`stamper.ts` | — (consumed as-is) |
| Co-signed channel | `zk-core/src/{channel,stateSig}.ts` — **2-party** (`balanceA/B`, `sigA/B`) | `channelN.ts` + `stateSigN.ts` — N balances, N sigs, conservation incl. side-pots+rake |
| On-chain channel/escrow/settle/dispute | `contracts/zk/ZkTable.sol` — **2-party**; dispute architecture is the template | `HoldemTableN.sol` — N seats, vector payout, per-seat demand, forced-fold |
| Rules seam + single-card betting+showdown | `contracts/zk/{IGameRules.sol,HiLoWarRules.sol}`; `hilo-war/src/{rules,encoding}.ts` | `IGameRulesN.sol` + `HoldemRules.sol`; `holdem/src/{rules,encoding}.ts` |
| Channel-state struct + EIP-712 lib | `contracts/zk/ChannelState.sol` | `ChannelStateN.sol` (dynamic arrays + side-pots + rake) |
| TS↔Sol parity fuzz pattern | `test/HiLoWarParity.test.ts` (mulberry32 seeded walks) | `HoldemParity.test.ts`, `HandEvalParity.test.ts` |
| 5-card hand ranking | ❌ none | `holdem/src/handEval.ts` (TS normative) + `HoldemHandEval.sol` (Sol mirror) |
| Side-pots / N-seat payout vector | ❌ `ChannelState` is single-winner | `holdem/src/sidePots.ts` + Sol mirror in `HoldemRules` |
| Vendored Groth16 `RevealVerifier` + `respondWithShare` | present, **already wired in ZkTable** | **DEFERRED in v1** (SNARK path; see Constraint 6) |

---

## File / package structure (new)

```
examples/games/holdem/                      # new pnpm pkg @gibs/holdem (mirror of hilo-war)
  package.json                              # vitest, deps: @gibs/zk-cards-core, viem, @noble/curves
  vitest.config.ts
  tsconfig.json
  src/
    deckN.ts          # Task 1: N-party joint key + N-party sequential shuffle over the deck
    revealN.ts        # Task 2: N-party selective reveal (hole→one seat, community→all)
    dealSeq.ts        # Task 3: board-coordinated deal sequence (shuffle→hole→flop→turn→river)
    stateSigN.ts      # Task 4: ChannelStateN EIP-712 types (N balances, side-pots, rake)
    channelN.ts       # Task 4: N-sig co-sign channel + N-conservation
    rules.ts          # Task 5: HoldemState, applyMove (betting rounds), side-pot bookkeeping
    encoding.ts       # Task 5: canonical ABI tuple mirrored by HoldemRules.sol
    sidePots.ts       # Task 5: standard all-in side-pot algorithm (pure)
    handEval.ts       # Task 6: 5-of-7 evaluator (TS normative)
    session.ts        # Task 8: N-seat orchestration (deal + betting + showdown over the board)
    index.ts
  test/
    deckN.test.ts revealN.test.ts dealSeq.test.ts
    channelN.test.ts sidePots.test.ts handEval.test.ts session.test.ts

packages/contracts/contracts/zk/
  ChannelStateN.sol   # Task 4: struct {tableId,nonce,balances[],pot,sidePots[],rakeAccrued,
                      #          deckCommitment,phase,gameStateHash} + EIP-712 lib
  IGameRulesN.sol     # Task 4/5: N-seat rules seam (whoseTurn -> uint256 bitmask)
  HoldemTableN.sol    # Task 4: N-party escrow/settle/dispute (template = ZkTable.sol)
  HoldemRules.sol     # Task 5/6/7: phases, betting, side-pots, showdown via HoldemHandEval
  HoldemHandEval.sol  # Task 6: Solidity 5-of-7 mirror of handEval.ts

packages/contracts/contracts/test/
  MockGameRulesN.sol  # Task 4: minimal IGameRulesN stub (mirror of MockGameRules.sol)

packages/contracts/test/foundry/
  HoldemTableN.t.sol           # Task 4: lifecycle/conservation/dispute fuzz (template ZkTable.t.sol)
  HoldemTableNInvariant.t.sol  # Task 4: solvency invariant (template ZkTableInvariant.t.sol)
packages/contracts/test/
  HoldemParity.test.ts         # Task 5/7: applyMove TS<->Sol seeded-walk parity
  HandEvalParity.test.ts       # Task 6: 5-of-7 TS<->Sol fuzz parity
```

**Why secp256k1 deck keys but `uint256[2]` deckKeys in the contract:** in v1 the contract NEVER
calls the Groth16 verifier (Constraint 6), so the `deckKeys` mapping is **omitted** from
`HoldemTableN` v1 (it exists in `ZkTable` only to feed `respondWithShare`). Re-add it only when the
SNARK reveal-dispute path is enabled in the later spike.

---

## Conventions (commands used throughout)

- **Off-chain TS tests** (run from repo root or the package dir):
  ```
  pnpm --filter @gibs/holdem test            # vitest run (whole package)
  pnpm --filter @gibs/holdem test -- deckN   # single file
  pnpm --filter @gibs/holdem typecheck       # tsc --noEmit
  ```
- **Foundry (fuzz/invariant), default profile** (from `packages/contracts`):
  ```
  forge test --match-path 'test/foundry/HoldemTableN*' -vvv
  ```
  `HoldemTableN.sol` must compile under the **default** profile (`via_ir = true`, runs 1000,
  shanghai) — same as ZkTable. Add it to the `skip` lists in the `[profile.zk]` block of
  `foundry.toml` exactly as `ZkTable.t.sol` is skipped there, so the viaIR-requiring suite never
  reaches the non-viaIR `zk` profile.
- **Hardhat+viem (TS↔Sol parity)** (from `packages/contracts`):
  ```
  pnpm --filter @gibs/contracts test --grep "Holdem TS<->Solidity parity"
  ```
  (root script: `NODE_OPTIONS=--max-old-space-size=8192 hardhat --max-memory 8192 test`)

Throughout: write the **failing** test first, run it, paste the RED output into the task report,
then implement to GREEN. No placeholders, no `it.skip`, no `TODO` left in shipped code.

---

# TASKS (de-risk order)

## Task 1 — N-party joint key + N-party sequential shuffle

**Goal:** prove that N seats can build a joint key and that each seat shuffling+re-encrypting in
turn produces a deck that (a) still decrypts to the original 52 cards under all N shares and (b)
whose order is unknown unless *all* shufflers collude. This is the riskiest brand-new surface, so it
goes first.

**Paths:** `examples/games/holdem/src/deckN.ts`, `examples/games/holdem/test/deckN.test.ts`.
Scaffold the package first (`package.json`, `vitest.config.ts`, `tsconfig.json` copied from
`examples/games/hilo-war` with name `@gibs/holdem`, dep `@gibs/zk-cards-core: workspace:*`).

**Consumes:** `@gibs/zk-cards-core` — `AttestedElGamalDeck`, `aggregatePubKeys` (via provider
`aggregate`), `MaskedDeckProvider` (`keygen/initialDeck/shuffle/verifyShuffle`), `WireMasked`,
`WireShuffle`. **Produces:** `deckN.ts` exports:
```ts
export interface SeatKeys { secret: Hex; pub: Hex; addr: Hex }      // addr = wallet for attest sig
export function jointKey(provider: MaskedDeckProvider, pubs: Hex[]): Hex   // = provider.aggregate(pubs)
export async function runShuffleChain(
  provider: MaskedDeckProvider, agg: Hex, seats: { signer: ShuffleSigner }[],
): Promise<{ finalDeck: WireMasked[]; rounds: WireShuffle[] }>     // seat 0 shuffles initialDeck, seat i shuffles seat i-1's output
export async function verifyShuffleChain(
  provider: MaskedDeckProvider, agg: Hex,
  initial: WireMasked[], rounds: WireShuffle[], signerAddrs: Hex[],
): Promise<boolean>                                                 // each round verifyShuffle against prev deck + that seat's addr
```

**TDD steps:**

1. **RED — joint key is order-independent and N≥3.** Test: keygen 5 seats; assert
   `jointKey(p, pubs)` equals `jointKey(p, shuffled(pubs))` (aggregation is a commutative sum) and
   is a valid compressed point. Run `pnpm --filter @gibs/holdem test -- deckN` → expect failure
   "Cannot find module './deckN'".
2. **GREEN — `jointKey`** delegates to `provider.aggregate`. Re-run → 1 pass.
3. **RED — full chain round-trips to the 52 cards.** Build initialDeck under `agg`; run
   `runShuffleChain` with 5 attested signers; then for every one of the 52 slots, collect a
   decryption `share` from ALL 5 seats over the **final** deck and `unmask` — assert the multiset of
   unmasked indices is exactly `{0..51}` (a permutation). REAL code below (no placeholder):
   ```ts
   import { describe, it, expect } from 'vitest'
   import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
   import { AttestedElGamalDeck } from '@gibs/zk-cards-core'
   import { jointKey, runShuffleChain, verifyShuffleChain } from '../src/deckN'

   const mkSeat = async (p: AttestedElGamalDeck) => {
     const k = await p.keygen(); const acct = privateKeyToAccount(generatePrivateKey())
     return { ...k, addr: acct.address, signer: acct }
   }
   it('N=5 shuffle chain is a permutation that round-trips under all shares', async () => {
     const p = new AttestedElGamalDeck()
     const seats = await Promise.all([0,1,2,3,4].map(() => mkSeat(p)))
     const agg = jointKey(p, seats.map(s => s.pub))
     const initial = await p.initialDeck(agg)
     const { finalDeck } = await runShuffleChain(p, agg, seats)
     const out: number[] = []
     for (let slot = 0; slot < 52; slot++) {
       const shares = []
       for (const s of seats) shares.push(await p.share(s.secret, finalDeck[slot]!, `table/slot/${slot}`))
       out.push(p.unmask(finalDeck[slot]!, shares))
     }
     expect([...out].sort((a,b)=>a-b)).toEqual(Array.from({length:52},(_,i)=>i))
   })
   ```
4. **GREEN — `runShuffleChain`** folds `provider.shuffle` over the seat list, threading each
   round's `deck` into the next. Re-run → pass.
5. **RED — chain verification + tamper rejection.** Test `verifyShuffleChain` returns `true` for an
   honest chain; mutate one byte of one round's `deck[0].c2` and assert `false` (the attest sig over
   `keccak(before‖after)` no longer recovers that seat's `addr`). Also assert a wrong `signerAddrs`
   order ⇒ `false`.
6. **GREEN — `verifyShuffleChain`** verifies each round against the running `before` deck and the
   matching `signerAddrs[i]`.
7. **RED — hiding property (one honest shuffler).** Test: with 3 seats where only seat 1's secret is
   known to the "adversary", show the final order cannot be derived from seats {0,2}'s shuffle
   permutations alone — operationalize as: re-running seat 1's `remask`+permute with a *fresh* RNG
   yields a different `finalDeck` digest while still round-tripping. (Documents the attested-path
   trust model from spec §12; not a ZK proof — see Concerns.)
8. **REFACTOR + run whole file:** `pnpm --filter @gibs/holdem test -- deckN` and
   `pnpm --filter @gibs/holdem typecheck`.

**Expected output (GREEN):** `Test Files 1 passed (1)`, all `deckN` cases green; typecheck exits 0.

**Concerns:** Fisher–Yates in `AttestedElGamalDeck.shuffle` uses `randomScalar() % (i+1)` — modulo
bias over 256-bit scalar vs ≤52 is negligible (already noted in source); assert distribution only
loosely. The attested shuffle is **not ZK** — security rests on "all shufflers would have to
collude." This is the spec's accepted v1 posture (§12); flag prominently in the report.

---

## Task 2 — N-party selective reveal (hole-to-one-seat, community-to-all)

**Goal:** prove the two reveal modes: a **hole** card is reconstructable by exactly one target seat
(it collects the N−1 *other* seats' shares + its own) and unreadable by anyone missing a share; a
**community** card is reconstructable by everyone (all N shares are public).

**Paths:** `examples/games/holdem/src/revealN.ts`, `test/revealN.test.ts`.

**Consumes:** Task 1 `deckN` + provider `share`/`verifyShare`/`unmask`. **Produces:**
```ts
export interface RevealShare { from: Hex; share: WireShare }   // from = seat deck-pub for verify
export function ctxFor(tableId: Hex, slot: number): string     // 'holdem/<tableId>/slot/<slot>' — binds replay
export async function collectShares(seats, deck, slot, tableId): Promise<RevealShare[]>
export function verifyAllShares(provider, pubs, deck, slot, tableId, shares): boolean
export function revealCommunity(provider, deck, slot, shares): number      // requires all N shares
export function revealHole(provider, deck, slot, ownShare, peerShares): number  // own + N-1 peers
```

**TDD steps:**

1. **RED — community reveal needs ALL shares.** Deal a known slot; collect all N shares; assert
   `revealCommunity` returns the right index; then drop one share and assert it **throws**
   (`unmaskWithShares` throws "not a card point"). Run → module-not-found.
2. **GREEN — `revealCommunity`/`collectShares`/`ctxFor`.**
3. **RED — share soundness (Chaum–Pedersen) rejects a forged share.** Replace one seat's `share`
   with `decryptionShare` from a *different* secret but keep its proof; assert
   `verifyAllShares` → `false`, and a tampered proof also → `false`. (This exercises the real CP
   soundness already in `chaumPedersen.ts`.)
4. **GREEN — `verifyAllShares`** loops `provider.verifyShare(pub, deck[slot], share, ctx)`.
5. **RED — hole reveal is private.** Simulate seat `t` as target: it gets `peerShares` from the
   other N−1 seats + computes its own; `revealHole` returns its card. Assert that with only the
   peer shares (target withholds its own) `unmask` throws → the card stays hidden from a passive
   observer who lacks the target's secret. Assert the ctx string includes the slot so a share for
   slot X can't be replayed to verify slot Y.
6. **GREEN — `revealHole`.**
7. **REFACTOR + run:** `pnpm --filter @gibs/holdem test -- revealN`; typecheck.

**Expected output:** all `revealN` cases green.

**Concerns:** `ctx` binding is the only replay defense for shares — every reveal MUST use a ctx that
includes `tableId` AND `slot` (Task 3 enforces uniqueness per hand via a hand counter). Hole privacy
in v1 is "passive-observer private": the target's own secret is required to finish `unmask`, which
is correct, but the *transport* still broadcasts the peer shares — fine, since a peer share alone
reveals nothing without the target's secret.

---

## Task 3 — Board-coordinated deal sequence (shuffle → 2 hole/seat → flop3 → turn → river)

**Goal:** drive the full deal over the MsgBoard transport where **each shuffle round and each
reveal is exactly one board post** appended to the hash-chained transcript, in canonical order.

**Paths:** `examples/games/holdem/src/dealSeq.ts`, `test/dealSeq.test.ts`.

**Consumes:** Tasks 1–2; `@gibs/zk-cards-core` `Transcript`/`makeEnvelope`/`verifyEnvelope`;
`Transport` (use the in-memory test transport pattern from `hilo-war/test` — a shared array, NOT a
live board, so tests stay fast/deterministic). The live-board PoW path (`msgboard-games/board.ts`)
is wired in Task 8 / e2e only.

**Produces:**
```ts
export type DealStep =
  | { kind: 'SHUFFLE'; seat: number; round: WireShuffle }
  | { kind: 'HOLE_SHARE'; target: number; slot: number; share: RevealShare }
  | { kind: 'COMMUNITY_SHARE'; group: 'FLOP'|'TURN'|'RIVER'; slot: number; share: RevealShare }
export function dealPlan(nSeats: number): { holeSlots: number[][]; flop: number[]; turn: number; river: number }
export async function postStep(transcript, signer, step): Promise<Envelope>   // one envelope = one post
export function deckCommitment(deck: WireMasked[]): Hex                        // keccak, mirrors maskedDeck deckDigest
```

**TDD steps:**

1. **RED — deal plan slot layout.** For N=6: 2 hole cards/seat from the top of the (post-shuffle)
   deck = slots `0..11` (seat s hole slots = `[s, s+N]` — i.e. standard one-card-at-a-time dealing,
   not contiguous), flop = next 3, turn = next, river = next. Assert no slot is used twice and the
   count = `2N + 5`. Run → module-not-found.
2. **GREEN — `dealPlan`.** Encode the one-card-at-a-time mapping (round 1: each seat slot s; round
   2: each seat slot N+s) so it matches the spec's "single-card" framing.
3. **RED — full deal produces a valid transcript.** Build N seats, run `runShuffleChain`, then for
   every reveal in `dealPlan` order: `collectShares` and `postStep` one envelope each. Assert: the
   transcript head chains (each `prev` equals the previous head), every envelope `verifyEnvelope`s,
   the post count = `N (shuffles) + 2N (hole shares ×?) ...` — assert exact post budget, and that
   each seat can `revealHole` its 2 cards and everyone can `revealCommunity` the 5 board cards.
4. **GREEN — `postStep`/`deckCommitment`** and the driver loop in the test helper.
5. **RED — out-of-order / wrong-seat posts rejected.** Post a HOLE_SHARE from the wrong signer →
   `verifyEnvelope` false; post steps in a non-canonical order → assert the consumer detects the
   `prev`-chain break.
6. **GREEN.**
7. **REFACTOR + run:** `pnpm --filter @gibs/holdem test -- dealSeq`; typecheck. Record the **post
   count for N=2..9** in the task report (PoW-tempo budget, Concern below).

**Expected output:** all `dealSeq` cases green; report includes a post-count table.

**Concerns (PoW/board latency across a full hand):** post budget grows ~`O(N²)` for hole shares
(each of 2N hole slots needs N−1 peer shares) unless shares are **batched per seat per round**. Plan
the encoding so one seat can post *all its shares for a reveal group in one envelope* (a
`share[]` body) — this collapses a flop reveal from N posts to N posts but a hole round from
`2N·(N−1)` to `N` posts. Measure and record; if a full 9-seat hand exceeds a few minutes of PoW
wall-clock, recommend batching independent reveals (spec Risk 6) — but do NOT change the security
model.

---

## Task 4 — N-party channel `HoldemTableN.sol` + off-chain `channelN`/`stateSigN` (thin chain)

**Goal:** the N-party escrow/settle/dispute contract and its off-chain co-signing mirror, with **no
poker rules yet** (uses `MockGameRulesN`). This proves N-of-N co-sign, conservation incl.
side-pots+rake, vector payout, per-seat demand, and forced-fold-on-timeout.

**Paths (on-chain):** `contracts/zk/ChannelStateN.sol`, `contracts/zk/IGameRulesN.sol`,
`contracts/zk/HoldemTableN.sol`, `contracts/test/MockGameRulesN.sol`,
`test/foundry/HoldemTableN.t.sol`, `test/foundry/HoldemTableNInvariant.t.sol`.
**Paths (off-chain):** `holdem/src/stateSigN.ts`, `holdem/src/channelN.ts`,
`holdem/test/channelN.test.ts`, `test/ZkChannelNSig.test.ts` (digest parity).

**Consumes (templates):** `ZkTable.sol`, `ChannelState.sol`, `IGameRules.sol`, `MockGameRules.sol`,
`ZkTable.t.sol`, `ZkTableInvariant.t.sol`, `channel.ts`, `stateSig.ts`, `channel.test.ts`.

**ChannelStateN.sol (the key generalization):**
```solidity
struct SidePot { uint256 amount; uint256 eligibleMask; }   // bit i set => seat i eligible
struct ChannelStateN {
    bytes32 tableId;
    uint64  nonce;
    uint256[] balances;       // per-seat stack
    uint256 pot;
    SidePot[] sidePots;
    uint256 rakeAccrued;      // taken at settle
    bytes32 deckCommitment;
    uint8   phase;
    bytes32 gameStateHash;
}
library ChannelStateNLib {
    // EIP-712 typehash MUST encode dynamic arrays per EIP-712 (hash of concatenated element
    // hashes). Mirror byte-for-byte in stateSigN.ts. SidePot is its own typed struct.
}
```

**Conservation invariant (everywhere a state is accepted):**
`Σ balances + pot + Σ sidePots.amount + rakeAccrued == Σ escrow`.

**HoldemTableN.sol surface (template = ZkTable, generalized):**
- `create(rules, buyIn, maxSeats, rakeBps, rakeCap, clockBlocks, channelKey)` → seat 0 escrows
  `msg.value`; `rakeBps <= MAX_RAKE_BPS` (e.g. 250) and `rakeCap` stored.
- `join(tableId, channelKey) payable` → `msg.value == buyIn`; appends to `seats`/`channelKeys`/
  `escrow`; reject duplicate keys (mirror `ZkTable.join`'s collision guard, generalized to scan the
  arrays).
- `start(tableId)` → `Forming → Live` once `seats.length >= 2`.
- `leaveBeforeStart` / `cancel` → refunds via `forceSafeTransferETH`.
- `settle(tableId, state, sigs[])` → `sigs.length == seats.length`, every `ECDSA.recoverCalldata`
  matches `channelKeys[i]`, `rules.isFinal(state.phase)`, `state.pot == 0` AND all `sidePots`
  empty, conservation, nonce > checkpoint; then `_payoutVector(state.balances)` + rake to treasury.
- `openDispute(tableId, state, sigs[], gameState, demandSeat, demandKind, demandSlot)` → N-of-N
  co-sign check; `rules.hashGameState(gameState) == state.gameStateHash`;
  `rules.whoseTurn(gameState) & (1 << demandSeat) != 0` (per-seat demand guard); set
  `disputeDeadline`.
- `respondWithState` / `respondWithMove` → as ZkTable but keyed by `demandSeat`; move judged by
  `rules.applyMove`.
- **`respondWithShare` — STUB/REVERT in v1.** Constraint 6: include the function selector for ABI
  stability but `revert ShareDisputeDeferred()` (documented). The SNARK path re-enables it.
- `resolveTimeout(tableId)` → on the chess clock, the `demandSeat`'s **current-hand contribution is
  forfeited into the pot and awarded per the contested state's result**, i.e. a **forced fold**:
  the seat keeps its `balances[demandSeat]` but loses its in-pot stake; remaining pot/side-pots are
  distributed to still-eligible seats per the contested `gameStateHash` result, or, if no showdown
  result exists yet, the pot is split among the non-forfeiting eligible seats. Conservation
  guarantees exactly `Σ escrow` is paid. (This is the multiplayer generalization of ZkTable's
  binary forfeit; see Concerns for the liveness subtlety.)

**`_payoutVector`** loops `forceSafeTransferETH(seats[i], balances[i])` and pays `rakeAccrued` to a
constructor-set `treasury` — one griefing receiver cannot block others (ZkTable pattern).

**IGameRulesN.sol:** mirror `IGameRules` but `whoseTurn(bytes) returns (uint256 mask)` (N-bit), and
`isFinal`/`applyMove`/`hashGameState` unchanged in shape.

**TDD steps (off-chain first, then Solidity):**

1. **RED — `stateSigN` digest parity skeleton.** Port `stateSig.ts` to N arrays; write
   `channelN.test.ts` asserting genesis nonce 0, N-conservation, monotone nonce, rejects bad
   signer, rejects conservation violation with side-pots+rake (mirror `channel.test.ts`). Run
   `pnpm --filter @gibs/holdem test -- channelN` → module-not-found.
2. **GREEN — `stateSigN.ts` + `channelN.ts`** (`ChannelN` collecting N sigs:
   `propose`→`countersign` by each peer→`finalize` when `sigs.length == N`).
3. **RED — Solidity lifecycle fuzz.** Author `HoldemTableN.t.sol` (template `ZkTable.t.sol`):
   `testFuzz_createJoinSettle` for N∈{2,5,9} with fuzzed `buyIn`, fuzzed balance split summing to
   `Σ escrow − rake`, asserting every wei paid and zero residue; `vm.sign` each seat over the
   recomputed `stateDigest`. Run `forge test --match-path 'test/foundry/HoldemTableN*' -vvv` →
   compile error (no contract).
4. **GREEN — `ChannelStateN.sol` + `IGameRulesN.sol` + `MockGameRulesN.sol` + `HoldemTableN.sol`.**
   Re-run forge → fuzz green.
5. **RED — conservation + rake-in-conservation fuzz.** Assert any state where
   `Σ balances + pot + Σ sidePots + rake != Σ escrow` reverts `ConservationViolated`; assert
   `settle` reverts if `rakeAccrued > rakeCap` or `> rakeBps·pot/10000`.
6. **GREEN.**
7. **RED — per-seat dispute + forced-fold-on-timeout fuzz.** `openDispute` naming `demandSeat`,
   advance `block.number` past the clock, `resolveTimeout`, assert: forfeiting seat keeps its
   balance, loses in-pot stake; remaining eligible seats receive pot; total paid == `Σ escrow`;
   `respondWithShare` reverts `ShareDisputeDeferred`.
8. **GREEN.**
9. **RED — solvency invariant.** `HoldemTableNInvariant.t.sol` (template `ZkTableInvariant.t.sol`):
   across random create/join/settle/dispute sequences, contract ETH balance for live tables ==
   Σ unsettled escrow; settled tables hold 0.
10. **GREEN.**
11. **RED — digest parity (TS↔Sol).** `test/ZkChannelNSig.test.ts` (hardhat+viem): deploy
    `HoldemTableN`, assert `stateDigest(stateN)` on-chain equals `hashStateN(domain, stateN)` in
    `stateSigN.ts` for fuzzed N-seat states (the EIP-712 dynamic-array encoding is the bug-prone
    part). Run `pnpm --filter @gibs/contracts test --grep "ChannelN digest"`.
12. **GREEN + REFACTOR.** Add `HoldemTableN.t.sol`/`HoldemTableNInvariant.t.sol`/
    `MockGameRulesN.sol` to the `[profile.zk]` `skip` list in `foundry.toml`.

**Expected output:** `forge test --match-path 'test/foundry/HoldemTableN*'` → all fuzz/invariant
pass (512 runs under default profile); `channelN` vitest green; digest-parity green.

**Concerns (HIGHEST RISK):** N-party liveness correctness. The forced-fold-on-timeout must (a) never
let a stalling seat *steal* by stalling (it forfeits, never gains), (b) never freeze honest seats,
and (c) always conserve. The subtle case: **multiple simultaneous stalls** — if two seats both owe
and both time out, the contested state's `whoseTurn` mask may name several seats. v1 simplification
to flag: `openDispute` demands from exactly ONE `demandSeat`; resolving forfeits that one; honest
seats then re-open against the next staller. Document that a coordinated N−1 stall degrades to
serial dispute rounds (bounded by escrow, never insolvent) — acceptable for v1, revisit with a
multi-seat demand in a follow-up. Also: EIP-712 hashing of `SidePot[]` and `uint256[]` is the most
likely parity bug — Task 4 step 11 is the gate.

---

## Task 5 — Betting rounds + side-pots (TS + `IGameRulesN` seam)

**Goal:** Hold'em betting (blinds/antes, check/bet/call/raise/fold, min-raise, all-in) across the
four rounds (pre-flop/flop/turn/river) with the standard side-pot algorithm, behind `IGameRulesN`,
mirrored in `HoldemRules.sol`.

**Paths:** `holdem/src/rules.ts`, `holdem/src/encoding.ts`, `holdem/src/sidePots.ts`,
`holdem/test/sidePots.test.ts`, `contracts/zk/HoldemRules.sol`, `test/HoldemParity.test.ts`.

**Consumes:** `hilo-war/src/{rules,encoding}.ts` (state-machine + ABI-tuple pattern),
`HiLoWarRules.sol` (applyMove judge pattern), `HiLoWarParity.test.ts` (seeded-walk fuzz), Task 4
seam.

**Produces (TS):**
```ts
export enum Phase { SETUP, SHUFFLE, DEAL_HOLE, BET_PREFLOP, DEAL_FLOP, BET_FLOP,
                    DEAL_TURN, BET_TURN, DEAL_RIVER, BET_RIVER, SHOWDOWN, SETTLED }
export interface HoldemState {
  phase: Phase; nSeats: number; button: number; toAct: number;
  stacks: bigint[]; committed: bigint[];         // this-round contributions
  totalContributed: bigint[];                    // whole-hand (drives side-pots)
  folded: boolean[]; allIn: boolean[];
  currentBet: bigint; minRaise: bigint; lastAggressor: number;
  pot: bigint; sidePots: { amount: bigint; eligible: number[] }[];
  rakeBps: number; rakeCap: bigint;
}
export type Move =
  | { kind:'POST_BLIND'; seat:number; amount:bigint }
  | { kind:'CHECK'|'CALL'|'FOLD'; seat:number }
  | { kind:'BET'|'RAISE'; seat:number; to:bigint }      // 'to' = total this-round commitment
  | { kind:'DEAL_DONE'; phase:Phase }                   // session attests the reveal group completed
export function applyMove(s: HoldemState, m: Move): { state: HoldemState } | { error: string }
```
**`sidePots.ts`** — pure standard algorithm:
```ts
export function buildSidePots(totalContributed: bigint[], folded: boolean[]):
  { amount: bigint; eligible: number[] }[]
```

**TDD steps:**

1. **RED — side-pot algorithm property tests.** `sidePots.test.ts`: classic cases — (a) no all-in:
   one main pot, all non-folded eligible; (b) one short all-in: main pot capped at the all-in
   level × eligible, side pot for the rest; (c) **multiple all-ins at different levels:** N layered
   pots, eligibility shrinking; (d) folded contributors' chips stay in the pots but they're not
   eligible; (e) odd-chip remainder is assigned deterministically (to the first eligible seat left
   of the button — define and test the rule). Assert `Σ pots == Σ totalContributed` for every case
   (conservation). Run → module-not-found.
2. **GREEN — `buildSidePots`.**
3. **RED — betting state machine.** Seeded-walk style (mulberry32, mirror `HiLoWarParity`) over
   `applyMove`: blinds posted, min-raise enforced (a raise must be ≥ previous raise increment),
   round closes when all non-folded matched or all-in, `toAct` rotates skipping folded/all-in,
   phase advances PREFLOP→…→RIVER→SHOWDOWN, pot/side-pots recomputed. Assert illegal moves
   (under-min-raise, acting out of turn, betting more than stack, check facing a bet) are rejected.
4. **GREEN — `rules.ts` + `encoding.ts`** (canonical ABI tuple; `GAME_STATE_ABI` mirrored exactly
   in `HoldemRules.sol`, dynamic arrays for `stacks`/`committed`/`folded`/`sidePots`).
5. **RED — `HoldemRules.sol` parity.** `HoldemParity.test.ts` (template `HiLoWarParity.test.ts`):
   500 seeded walks for N∈{2,3,6}, asserting TS `applyMove` and `HoldemRules.applyMove` agree on
   accept/reject and on the post-move `keccak(encode(state))`; plus `whoseTurn` spot-state checks
   (mask names exactly the seats that owe). Run `pnpm --filter @gibs/contracts test --grep "Holdem TS<->Solidity parity"` → fails (no contract).
6. **GREEN — `HoldemRules.sol`** betting half (showdown/hand-eval is Task 6). Re-run → parity green
   for all betting walks (terminate walks at SHOWDOWN for now).
7. **REFACTOR + run** both vitest and hardhat suites.

**Expected output:** `sidePots` + betting vitest green; 500-walk parity green with coverage
assertions (every interior phase reached, ≥1 all-in, ≥1 fold, ≥1 multi-way pot — assert
`>0` like HiLoWarParity does).

**Concerns (side-pot edge cases):** the classic poker bug surface — multi-level all-ins, ties
across side pots, odd-chip remainders, and rake interaction (rake comes off the *total* pot but the
cap applies before side-pot split — define order explicitly and test `Σ payouts + rake == Σ
contributed`). All-in for less than a full raise must NOT reopen the betting (incomplete-raise
rule) — test it.

---

## Task 6 — 5-card hand evaluator (TS normative + Solidity mirror + fuzz parity)

**Goal:** evaluate the best 5-of-7 hand per seat, identically in TS and Solidity.

**Paths:** `holdem/src/handEval.ts`, `holdem/test/handEval.test.ts`,
`contracts/zk/HoldemHandEval.sol`, `test/HandEvalParity.test.ts`.

**Consumes:** `zk-core/src/cards.ts` (`rankOf`/`suitOf`, index = `(rank-2)*4 + suit`).

**Produces:**
```ts
// A single comparable score: higher = better. Encodes category (8=straight flush … 0=high card)
// in the high bits, then up to 5 tiebreak ranks. Pure integer; no floats.
export function evaluate7(cards: number[/*7 distinct indices*/]): bigint
export function compareHands(a: number[], b: number[]): number   // sign of evaluate7(a)-evaluate7(b)
```
Solidity `HoldemHandEval.sol`: `function evaluate7(uint8[7] calldata cards) external pure returns (uint256 score)` producing the **bit-identical** score.

**TDD steps:**

1. **RED — category recognition (TS).** Hand-built fixtures for every category: high card, pair,
   two pair, trips, straight (incl. wheel A-2-3-4-5), flush, full house, quads, straight flush,
   royal. Assert ordering: each category beats all below; within-category tiebreaks (kickers,
   higher straight, higher pair) resolve correctly; **A-high vs wheel** straight ordering correct.
   Run → module-not-found.
2. **GREEN — `handEval.ts`.** Compute the 5-best of 7 by scoring all C(7,5)=21 combos and taking
   the max score (simple, auditable; perf is fine — only runs in disputes/showdown). Score layout:
   `(category << 20) | (r1 << 16) | (r2 << 12) | (r3 << 8) | (r4 << 4) | r5`.
3. **RED — exhaustive ties + known-answer.** A handful of WSOP-style known board+holes with the
   documented winner; plus symmetric ties (two seats with the same 5-card best from different hole
   cards) must compare equal. Assert `compareHands` is a total order (antisymmetric, transitive on
   a sampled set).
4. **GREEN.**
5. **RED — `HoldemHandEval.sol` fuzz parity.** `HandEvalParity.test.ts` (hardhat+viem): mulberry32
   draws 7 distinct card indices, calls TS `evaluate7` and on-chain `evaluate7`, asserts the
   `uint256` scores are **equal** over ≥2000 random 7-card sets, and that the *ordering* of random
   pairs agrees in sign. Run `pnpm --filter @gibs/contracts test --grep "HandEval parity"` →
   fails (no contract).
6. **GREEN — `HoldemHandEval.sol`.** Same 21-combo scan, same bit layout, gas-aware but
   parity-exact. Re-run → ≥2000-case parity green.
7. **REFACTOR + run** both suites; record the worst-case gas of `evaluate7` (it runs once per
   surviving seat in a disputed showdown).

**Expected output:** `handEval` vitest green; ≥2000-case TS↔Sol parity green with score equality
AND ordering agreement.

**Concerns (TS↔Sol parity is load-bearing):** any divergence mis-settles disputed showdowns. The
two evaluators MUST share the exact score bit-layout and the exact wheel-straight handling; the
fuzz is the gate (mirror HiLoWarParity's "prove it reached deep states" coverage asserts — here:
assert each category appeared at least once across the fuzz). Integer-only on both sides (no
floats, no signed shifts).

---

## Task 7 — Showdown settlement + rake (HoldemRules showdown half)

**Goal:** complete `HoldemRules.applyMove` SHOWDOWN: with all surviving seats' 7-card hands and the
side-pots from Task 5, award each pot to its best eligible hand(s) (split on ties, odd-chip rule),
deduct rake (bps + cap, in conservation), and reach `SETTLED` with a `balances[]` payout vector +
`rakeAccrued`.

**Paths:** extend `holdem/src/rules.ts` (+`handEval` import), `HoldemRules.sol`
(+`HoldemHandEval`), extend `HoldemParity.test.ts`, new `holdem/test/showdown.test.ts`.

**Consumes:** Tasks 5 (side-pots) + 6 (hand eval).

**Produces:** `SHOWDOWN` move resolution: for each side pot (main first), find max
`evaluate7(hole∪board)` among eligible non-folded seats; split equally; **odd chip** to the eligible
seat closest left of the button (defined + tested in Task 5, reused here); accumulate winners into
`balances[]`; compute `rakeAccrued = min(rakeCap, rakeBps·totalPot/10000)` deducted **before** the
split; set `phase=SETTLED`, `pot=0`, `sidePots=[]`.

**TDD steps:**

1. **RED — single-pot showdown.** N=3, no all-ins, known holes+board, assert the right seat gets
   `pot − rake`, rake accrued correctly, `Σ balances + rake == Σ buyIns` (conservation). Run → fails.
2. **GREEN — showdown resolution in `rules.ts`.**
3. **RED — multi side-pot showdown.** Two all-ins at different levels; assert each pot awarded to
   its best eligible seat; a short all-in can win only the pots it's eligible for; ties split with
   correct odd-chip; conservation holds. Plus a fold-to-win (everyone folds to one seat — no
   evaluation, pot − rake to the last seat).
4. **GREEN.**
5. **RED — `HoldemRules.sol` SHOWDOWN parity.** Extend `HoldemParity.test.ts` walks to run through
   SHOWDOWN (supplying revealed hole indices like HiLoWar's `SHOWDOWN` move supplies cards),
   asserting TS↔Sol agree on the final `balances[]`/`rakeAccrued`/state hash. Run hardhat parity.
6. **GREEN — `HoldemRules.sol` showdown half** calling `HoldemHandEval.evaluate7`. Re-run → full
   walks (incl. showdown) parity green.
7. **REFACTOR + run** both suites.

**Expected output:** showdown vitest green; full-walk parity green including SETTLED states.

**Concerns:** rake-cap-in-conservation ordering (rake before split) must match between TS and Sol
exactly; odd-chip distribution must be deterministic and identical on both sides; a side pot with a
single eligible seat (others folded/all-in-short) returns uncalled chips correctly (no rake on
uncalled returns — define + test).

---

## Task 8 — End-to-end multi-seat hand (off-chain session + co-sign + settle)

**Goal:** one full N-seat Hold'em hand over the (in-memory, then optionally live) board: keygen →
joint key → shuffle chain → deal (hole+flop+turn+river) → 4 betting rounds → showdown → N-of-N
co-signed SETTLED state → `HoldemTableN.settle` pays out. Proves the whole stack composes.

**Paths:** `holdem/src/session.ts`, `holdem/test/session.test.ts`; an e2e settle test that submits
the final state to an anvil-deployed `HoldemTableN` (template `test/MsgBoardSettleE2E.test.ts` /
`ZkTable.test.ts` settle path).

**Consumes:** all prior tasks; `hilo-war/src/session.ts` (the `Player` driver, inbox/waiter,
transcript chaining, per-turn timing metadata pattern) as the orchestration template.

**Produces:** `HoldemSession`/`Seat` driver: each seat runs the same code with its index; drives the
deal sequence (Task 3), feeds revealed cards into betting (Task 5) and showdown (Task 7), co-signs
each `ChannelStateN` via `channelN` (Task 4), and produces the final co-signed SETTLED state.

**TDD steps:**

1. **RED — happy-path full hand (N=3, in-memory transport).** Scripted choices (seat 0 raises pre-
   flop, seat 1 calls, seat 2 folds, …), deterministic deck via seeded RNG; assert: every reveal
   posted as one envelope, every `ChannelStateN` fully co-signed (3 sigs), showdown winner correct,
   final balances conserve, `phase==SETTLED`, `pot==0`. Run → module-not-found.
2. **GREEN — `session.ts`.**
3. **RED — N=6 with one all-in + side pot.** Assert side-pot payout matches Task 7; transcript
   verifies end-to-end.
4. **GREEN.**
5. **RED — on-chain settle (anvil).** Deploy `HoldemTableN` + `HoldemRules`, create/join N seats,
   run the session to a co-signed SETTLED state, submit `settle(state, sigs[])`, assert each seat's
   ETH balance changes by its payout and the contract residue is 0. (Hardhat+viem, template
   `MsgBoardSettleE2E.test.ts`.)
6. **GREEN.**
7. **RED — forced-fold liveness e2e.** One seat goes silent mid-hand; another `openDispute`s naming
   it; advance blocks; `resolveTimeout`; assert the table settles among the rest with the staller's
   in-pot stake forfeited and conservation intact.
8. **GREEN + REFACTOR.** Final full-suite run:
   ```
   pnpm --filter @gibs/holdem test
   pnpm --filter @gibs/holdem typecheck
   (cd packages/contracts && forge test --match-path 'test/foundry/HoldemTableN*' -vvv)
   pnpm --filter @gibs/contracts test --grep "Holdem|HandEval|ChannelN"
   ```

**Expected output:** all of the above green; record the full-hand post count + wall-clock (with the
in-memory transport, sub-second; the PoW-tempo figure is the Task 3 measurement projected onto the
live board).

**Concerns:** composition of timeouts across rounds (the chess clock must be sized in PoW-tempo
block windows so an honest seat grinding a legitimate reveal post isn't forfeited — size
`clockBlocks` ≥ a comfortable multiple of the measured per-post PoW time). Reconnection mid-hand is
out of scope beyond forced-fold (spec §13).

---

## Risks (carried as explicit task concerns)

- **N-party liveness/timeout correctness (Task 4, HIGHEST).** Forced-fold must never let a staller
  gain, never freeze honest seats, always conserve; simultaneous multi-seat stalls degrade to
  serial dispute rounds in v1 (bounded by escrow). Solvency invariant test is the gate.
- **Hand-evaluator TS↔Sol parity (Task 6).** Divergence mis-settles disputed showdowns; ≥2000-case
  fuzz with score-equality AND ordering-agreement is the gate; shared bit-layout + wheel handling.
- **Side-pot edge cases (Tasks 5/7).** Multi-level all-ins, ties across pots, odd chips, incomplete
  raises, rake-cap-in-conservation ordering, uncalled-chip returns. Heavy property tests; assert
  `Σ payouts + rake == Σ contributed` everywhere.
- **secp256k1-attested vs Baby-JubJub-SNARK gap (Constraint 6, spec §3.3/Risks 1–2).** v1 stays
  fully on secp256k1 + attested shuffle. The vendored Groth16 `RevealVerifier` and
  `respondWithShare` are **deferred** (revert stub) — they belong to the LATER SNARK path, which
  also requires re-homing the off-chain deck onto Baby JubJub. v1 SHARE disputes resolve via
  `respondWithState` or the clock. Do NOT wire the Groth16 path or `deckKeys` in v1.
- **Board/PoW latency across a full hand (Tasks 3/8).** ~`O(N²)` hole-share posts unless batched;
  measure and record; batching is a tempo optimization, not a security change.
- **EIP-712 dynamic-array hashing parity (Task 4).** `uint256[]`/`SidePot[]` typed-data encoding is
  the most likely silent bug; the on-chain `stateDigest` vs `stateSigN` parity test is the gate.

---

## Out of scope

- The real Zypher uzkge **SNARK shuffle/reveal prover** (separate spike + spec; the
  `MaskedDeckProvider` seam is the drop-in point). On-chain shuffle PLONK verification (~1.57M gas).
- On-chain hand-ranking in the happy path (only in disputed showdowns).
- Anything beyond single-table Hold'em: tournaments, blinds escalation, multi-table, rebuys,
  leave-mid-hand beyond forced-fold, on-chain VRF/randomness.
- Re-deriving or re-auditing the vendored verifiers; replacing the board transport or PoW.
```
