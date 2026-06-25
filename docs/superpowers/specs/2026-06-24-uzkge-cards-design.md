# Track 3 — uzkge Card-Game Class (single-card Texas Hold'em) — DESIGN SPEC

- **Status:** PROPOSAL / DESIGN ONLY — no implementation. Human approval required before any build.
- **Date:** 2026-06-24
- **Author:** explore+propose pass (agent), for human review
- **Scope track:** ZK program Track 3 (cards) — the least-charted track. See
  `docs/superpowers/specs/2026-06-23-zk-settle-design.md` §3 ("Track 3 — Card-game class")
  and `2026-06-24-zk-privacy-design.md` for the surrounding program.
- **One-line:** A multiparty (N-seat) verifiable card-game class for single-card Texas Hold'em,
  built on the **already-vendored Zypher `uzkge` shuffle/reveal verifiers**, the **existing
  2-party `zk-cards-core` + `ZkTable` stack** (extended to N parties), and the **MsgBoard
  board+PoW transport** (each card-reveal = one board post = one ~1–2s PoW).

> **READ THIS FIRST — the single most important finding.** Track 3 is **NOT greenfield.** The
> repo already contains a working, tested, **2-party** verifiable-card stack that does almost
> everything Track 3 needs *except* N>2 seats and full Hold'em hand-ranking:
> - `examples/games/zk-core` (`@gibs/zk-cards-core`): ElGamal masked deck, joint-key aggregation,
>   per-card decryption shares + Chaum–Pedersen proofs, EIP-712 channel, hash-chained transcript,
>   dispute-evidence builder. **Real card hiding + share soundness today.**
> - `packages/contracts/contracts/zk/ZkTable.sol`: a 2-party state-channel card table with
>   escrow, co-signed settle, top-up, and a **ForceMove-style dispute machine** that already
>   verifies on-chain reveal shares against the vendored Groth16 `RevealVerifier`
>   (`respondWithShare`, lines 293–315).
> - `packages/contracts/contracts/zk/HiLoWarRules.sol` + `examples/games/hilo-war`: a complete
>   **single-card, betting+showdown poker-like game** (Hi-Lo War) already implemented behind the
>   `IGameRules` seam — phases SETUP→DEAL→BET_COMMIT→BET_OPEN→CALL_OR_FOLD→SHOWDOWN→SETTLED.
>
> So Track 3's *genuinely new* surface is narrow and well-defined: **(a) make the deck protocol
> N-party, (b) make the channel/pot N-party, (c) add Hold'em betting + 5-card hand ranking, and
> (d) optionally swap the attested shuffle for a real Zypher SNARK shuffle.** This spec is written
> against that reality, not from scratch.

---

## 1. Goal

Ship a **trust-minimized, multiplayer (3–9 seat) single-card Texas Hold'em** game on the games
platform where:

- The deck is **jointly encrypted** under all seats' keys, **collaboratively shuffled** (no single
  seat learns the order), and **selectively revealed** — hole cards to one seat, community cards to
  all — using decryption shares proven correct.
- Each **card reveal is one MsgBoard post** carrying the encrypted card + reveal proof, gated by
  the board's **~1–2s WASM PoW**. The PoW doubles as **anti-spam** and a **pacing/fairness clock**
  (a natural per-action tempo and a basis for timeout windows).
- **Settlement is on-chain** through an N-party escrow channel: buy-ins escrow, betting/dealing
  runs off-chain over the board as co-signed states, and the chain is touched only to settle the
  pot, dispute, or enforce a per-seat timeout/fold.
- "Single-card Texas Hold'em" = standard Hold'em structure (2 hole cards/seat, flop/turn/river
  community cards, two-round-or-more betting), dealt **one physical card at a time** so each card
  maps cleanly to one reveal/proof/post. (The "single-card" framing is the *dealing granularity*,
  not a rules simplification.)

**Non-goal:** changing the proving system or re-deriving the verifiers. We consume the vendored
verifiers as-is.

---

## 2. What exists vs what's new (reuse map)

| Capability | Exists today | Reusable for N-party Hold'em? |
|---|---|---|
| ElGamal masked deck, joint-key aggregation (`elgamal.ts`) | ✅ 2-party tested | ✅ aggregation is already N-key (`aggregatePubKeys` reduces a list); masking/remask unchanged |
| Decryption shares + Chaum–Pedersen proofs (`chaumPedersen.ts`) | ✅ | ✅ unmask already sums N shares (`unmaskWithShares`) |
| `MaskedDeckProvider` seam (`maskedDeck.ts`) | ✅ | ✅ the swap point for a real SNARK shuffle |
| `AttestedElGamalDeck` v0 (signature-attested shuffle) | ✅ | ⚠️ shuffle is **attested, not ZK** — see §6/Decision 2 |
| Vendored on-chain `ShuffleVerifier` (PLONK, 52-card) | ✅ verifier only | ⚠️ verifier present; **no prover** (gap) |
| Vendored on-chain `RevealVerifier` (Groth16 + CP-DL) | ✅ verifier only, **already called** by `ZkTable.respondWithShare` | ⚠️ verifier present; **reveal prover** also a gap for the SNARK path |
| EIP-712 co-signed channel (`channel.ts`, `stateSig.ts`) | ✅ 2-party | 🔧 must generalize 2 sigs → N sigs, 2 balances → N balances |
| `ZkTable.sol` escrow/settle/dispute | ✅ **2-party only** | 🔧 new N-party contract; **dispute skeleton reusable** |
| `IGameRules` seam + `HiLoWarRules` (single-card betting+showdown) | ✅ | ✅ pattern reusable; new `HoldemRules` needed |
| Hash-chained transcript + board transport + PoW | ✅ | ✅ directly reusable (board is broadcast; transcript is canonical) |
| Pot / rake / multi-seat payout | ⚠️ pot field exists in `ChannelState`, single-winner only | 🔧 N-seat payout vector + side-pots + rake new |
| 5-card hand ranking | ❌ | ❌ entirely new |

---

## 3. What the vendored uzkge verifiers actually prove (ground truth)

(From reading `packages/contracts/contracts/vendor/uzkge/**`. File/line cites in §13.)

### 3.1 `ShuffleVerifier.verifyShuffle(bytes proof, uint256[] publicKeyInput, uint256[] publicKeyCommitment) → bool`
- **Scheme:** PLONK over BN254. Deck cards live on **EdOnBN254 (Baby JubJub)**.
- **Public input:** `publicKeyInput` = flattened **before-deck ‖ after-deck**. For a 52-card deck
  that's 416 `uint256` (52 cards × 4 words × 2 decks); each card is an ElGamal pair
  `(e1.x, e1.y, e2.x, e2.y)`. `publicKeyCommitment` is the **aggregate joint key** (the N-seat key).
- **Proves:** the after-deck is a valid **permutation + re-encryption** of the before-deck under the
  joint key (every card appears exactly once; all cards freshly re-masked). The PLONK transcript is
  labelled `"Plonk shuffle Proof"`; the seat/shuffler count is derived from input length.
- **Sizing:** `VerifierKey_52` ⇒ 2^14 (16384) constraint rows, 416 public inputs.
  `VerifierKey_20` ⇒ 2^12 rows, 160 public inputs (a 20-card variant — useful for a de-risk deck).
- **Gas:** ~**1.57M** execution gas per shuffle verify (spike bench in `ShuffleVerifier52.t.sol`).

### 3.2 `RevealVerifier` — two forms
- **`verifyReveal(pk, masked, reveal, proofBytes)`** — **Chaum–Pedersen DL** (Baby JubJub).
  Proves `reveal` is a correct partial decryption of `masked` under seat key `pk`. Cheaper crypto,
  but the repo notes the **on-chain CP-DL path is ~15.6M gas** (too expensive) — see `ZkTable`
  comment at line 280.
- **`verifyRevealWithSnark(uint256[6] pi, uint256[8] zkproof)`** — **Groth16** (BN254 pairing).
  `pi = [masked.e1.x, masked.e1.y, reveal.x, reveal.y, pk.x, pk.y]`. **~225k gas.** This is the form
  `ZkTable.respondWithShare` actually uses.
- **Helpers:** `aggregateKeys(Point[])` (joint key = Σ seat keys) and `unmask(masked, reveals[])`
  (plaintext = `e2 − Σ reveals`).

### 3.3 The crypto-curve mismatch (FLAG — assumption-laden)
- The **vendored verifiers operate on EdOnBN254 / Baby JubJub** (and BN254 for the SNARK).
- The **existing off-chain `zk-cards-core` crypto is `secp256k1`** (`elgamal.ts` imports
  `@noble/curves/secp256k1`; `ChaumPedersen` is hand-rolled over secp256k1).
- **Therefore the current off-chain deck and the vendored verifiers are NOT interoperable today.**
  The 2-party `ZkTable.respondWithShare` path verifies a Groth16 reveal against a **fixture**
  (`zypher-reveal-snark.json`) captured from an external "spike", **not** against shares produced
  by the live `AttestedElGamalDeck`. **Assumption to verify with the human/Zypher SDK:** moving to
  *real* uzkge proofs requires re-homing the off-chain deck crypto onto Baby JubJub (i.e. adopting
  the Zypher prover's own ElGamal/keygen), not just "calling a prover." This is the deepest hidden
  cost of the SNARK path and the main reason Decision 2 below leans toward keeping the
  attested/CP path for v1.

---

## 4. Architecture

```
                         ┌──────────────────────────────────────────────┐
   Seats 1..N (clients)  │  N-party Channel (off-chain, co-signed)        │
   each holds:           │  - ChannelStateN: nonce, balances[N], pot,     │
   - deck keypair (BJJ*) │    sidePots[], deckCommitment, phase,          │
   - wallet/channel key  │    gameStateHash                               │
                         │  - every state signed by ALL live seats        │
                         └───────────────┬──────────────────────────────┘
                                         │ posts (1 reveal / 1 shuffle = 1 post = 1 PoW ~1-2s)
                         ┌───────────────▼──────────────────────────────┐
                         │  MsgBoard transport (board.ts / transcript)   │
                         │  - ephemeral broadcast; PoW anti-spam + tempo │
                         │  - canonical order = hash-chained transcript  │
                         └───────────────┬──────────────────────────────┘
                                         │ settle / dispute / timeout
                         ┌───────────────▼──────────────────────────────┐
                         │  HoldemTableN.sol  (NEW, N-party)             │
                         │  - escrow buy-ins[N], pot, rake                │
                         │  - cooperative settle (N sigs)                │
                         │  - ForceMove dispute machine (per-seat demand)│
                         │  - reveal-share dispute → vendored Groth16     │
                         │  - HoldemRules (IGameRulesN) judge            │
                         └───────────────────────────────────────────────┘
   * BJJ = Baby JubJub if SNARK path; secp256k1 if attested/CP path (Decision 2)
```

**On-chain vs off-chain boundary (proposed):**
- **Off-chain (board-coordinated, the happy path):** keygen, joint-key aggregation, shuffle,
  per-card selective reveal, betting actions, hand evaluation, co-signing each `ChannelStateN`.
  Zero gas while everyone is live and honest.
- **On-chain (only on settle/dispute):** escrow buy-ins; verify N-of-N co-signed final state and
  pay the pot/side-pots/rake; the **dispute machine** that, when a seat stalls, forces the owed
  action (a move, or a **reveal share verified by the vendored Groth16 `RevealVerifier`**) or
  forfeits on the chess clock.
- **Deliberately NOT on-chain in v1:** the shuffle PLONK verify (1.57M gas) and on-chain
  hand-ranking — kept off-chain/disputable. See Decision 3 + Risks.

---

## 5. The shuffle/reveal-over-board data flow (Hold'em sequence)

Each numbered item below is **one board post** (one PoW, ~1–2s), appended to the hash-chained
transcript and (where it changes balances/phase) co-signed into a new `ChannelStateN`.

**Setup (once per hand):**
1. Each seat posts its **deck public key**. All seats compute the **joint key** `A = Σ pk_i`
   (deterministic; `aggregateKeys`/`aggregatePubKeys`). `deckCommitment` is set to the initial
   canonical masked deck under `A`.
2. **Collaborative shuffle (N posts, sequential).** Seat 1 permutes+re-encrypts the deck and posts
   `{after-deck, shuffleProof}`; seat 2 shuffles seat 1's output; … seat N last. After N shuffles
   no single seat knows the mapping. `deckCommitment` advances to the final deck.
   - *Attested path (v1):* `shuffleProof` = seat's signature over `keccak(before‖after)`
     (today's `AttestedElGamalDeck`).
   - *SNARK path (v2):* `shuffleProof` = PLONK proof verifiable by `ShuffleVerifier` (Decision 2).

**Deal (single card at a time — the core "single-card" mapping):**
3. **Hole cards:** for each of the 2 hole cards × N seats (= 2N reveals), the **other N−1 seats**
   each post a **decryption share + reveal proof** for that slot; the target seat combines all
   shares (`unmask`) to learn *only its own* hole card. Card stays hidden from everyone else.
4. **Flop (3 community cards):** for each of 3 slots, **all N seats** post their share; anyone can
   `unmask` → public card.
5. **Turn (1):** same, all-seat reveal of one slot.
6. **River (1):** same.

**Betting (interleaved with deal, standard Hold'em rounds):**
- After hole cards: pre-flop betting round. After flop/turn/river: a betting round each.
- Each betting action (check/bet/call/raise/fold) is a co-signed `ChannelStateN` update posted to
  the board. Pot/side-pots/contributions tracked in game state (mirrors `HiLoWarRules` bookkeeping,
  generalized to N seats + side-pots for all-ins).

**Showdown & settle:**
7. Surviving seats reveal their hole cards (all-seat shares for those slots). `HoldemRules`
   evaluates best 5-of-7 per seat; pot/side-pots awarded; rake deducted; final `ChannelStateN`
   (phase = SETTLED, pot = 0) co-signed by all and submitted to `HoldemTableN.settle`.

**Post budget / tempo (back-of-envelope, 6 seats):** ~N shuffles (6) + 2N hole reveals' worth of
share-rounds + flop/turn/river all-seat reveals + betting actions. Dealing alone is dozens of
posts × ~1–2s PoW. **This is slow** — a full hand is minutes of wall-clock. The PoW tempo is a
*feature* for fairness/anti-grief but a *UX cost*; see Risks + Decision 1 (de-risk).

**Board capacity:** one ElGamal card = 4 × 32B = 128B; a reveal share + Groth16 proof
(`8×uint256`) or CP proof (~160B) fits comfortably in a post (no hard size cap observed; PoW
difficulty scales mildly with payload). **A full 52-card deck in one post is 416 words (~13KB)** —
used only at on-chain `respondWithShare` (`deck.length == 208` for the contested 52-card commitment)
and in the shuffle post; this is large but within board limits. **FLAG:** confirm board/RPC max
payload accommodates a full-deck shuffle post; if not, the shuffle may need chunking or only its
commitment posted with the deck exchanged peer-to-peer.

---

## 6. The N-party contract surface (NEW — `HoldemTableN.sol` sketch)

`ZkTable.sol` is **structurally 2-party** (`playerA/playerB`, `keyA/keyB`, `escrowA/escrowB`,
`balanceA/balanceB`, `disputant ∈ {1,2}`, `_seatOf` returns 1/2, payout is a 2-tuple). It is **not**
directly reusable, but its **dispute architecture is the template**. Proposed new contract:

```solidity
// Generalizes ZkTable to N seats. ChannelStateN generalizes ChannelState.
struct ChannelStateN {
    bytes32 tableId;
    uint64  nonce;
    uint256[] balances;       // per-seat stack
    uint256 pot;
    uint256[] sidePots;       // for all-ins (see showdown model)
    uint256 rakeAccrued;      // taken at settle
    bytes32 deckCommitment;   // keccak of the current masked deck
    uint8   phase;            // HoldemRules phase enum
    bytes32 gameStateHash;    // preimage owned by HoldemRules
}

contract HoldemTableN is EIP712 {
    struct Table {
        address[] seats;          // wallets, ordered
        address[] channelKeys;    // per-seat channel signing key
        uint256[] escrow;         // per-seat buy-in
        uint256[2][] deckKeys;    // per-seat EdOnBN254 pubkey (for SNARK reveal disputes)
        IGameRulesN rules;
        uint16  rakeBps;          // e.g. 100–250 bps, capped
        uint64  clockBlocks;
        Status  status;           // None|Forming|Live|Disputed|Settled|Cancelled
        uint64  checkpointNonce;
        bool    hasCheckpoint;
        // dispute fields:
        uint64  disputeDeadline;
        uint8   disputant;        // seat index that opened the dispute
        uint8   demandSeat;       // seat that owes the action (per-seat demand)
        uint8   demandKind;       // 0=setup, MOVE, SHARE
        uint32  demandSlot;
        ChannelStateN disputeState;
    }

    // create(rules, buyIn, maxSeats, rakeBps, clockBlocks, channelKey, deckKey)  -> seat 0 escrows
    // join(tableId, channelKey, deckKey) payable                                  -> escrow == buyIn
    // start(tableId)                                                              -> Forming -> Live
    // leaveBeforeStart / cancel                                                   -> refunds
    // settle(tableId, state, sigs[])  -> require N valid co-sigs, isFinal, pot==0, conservation
    // openDispute(tableId, state, sigs[], gameState, demandSeat, demandKind, demandSlot)
    // respondWithState(...) | respondWithMove(...) | respondWithShare(...Groth16...)
    // resolveTimeout(tableId) -> forfeit per chess clock
}
```

**Key generalizations from `ZkTable`:**
- **`_seatOf` → index lookup** over `seats`/`channelKeys` arrays (returns 0..N−1).
- **`_checkCoSigned` → N signatures.** Conservation: `Σ balances + pot + Σ sidePots + rakeAccrued
  == Σ escrow`. (Mirror the off-chain channel check, generalized.)
- **Payout → vector.** `_payout` distributes `balances[i]` to each seat, awards pot/side-pots per
  `HoldemRules` result, sends `rakeAccrued` to the house/treasury, `forceSafeTransferETH` per seat
  so one griefing receiver can't block others (pattern already in `ZkTable._payout`).
- **Per-seat dispute.** `ZkTable` demands from "the counterparty" (binary). N-party adds a
  `demandSeat` field so a stall is attributed to a *specific* seat; only that seat can satisfy a
  MOVE/SHARE demand; the chess clock forfeits *that seat's* stake into the pot (effectively a
  **forced fold + timeout penalty**) while others continue or settle. The `whoseTurn` bitmask in
  `IGameRules` generalizes to an N-bit mask (`IGameRulesN.whoseTurn → uint256 bitmask`).
- **Reveal-share dispute reuses the vendored Groth16 path verbatim** — `respondWithShare` already
  exists in `ZkTable` (lines 293–315): load the contested 52-card deck (208 words), build
  `pi = [deck[4*slot..], reveal, pk]`, staticcall `verifyRevealWithSnark`. Reusable as-is, keyed by
  `demandSeat`'s `deckKey`.

**Known limitation inherited from `ZkTable` (carry forward + flag):** `demandSlot` legitimacy is
*not* adjudicated on-chain (the rules contract can't cheaply prove a slot is revealable now). It's
forfeit-only and bounded by escrow — acceptable for v1, same as the 2-party design (see `ZkTable`
@dev note lines 284–292). N-party makes this *slightly* worse (more slots, more seats) — revisit
with an `owesShare(gameState, slot, seat)` hook if SHARE disputes become adversarially load-bearing.

**`IGameRulesN` + `HoldemRules.sol`:** mirror `IGameRules`/`HiLoWarRules`, but:
- Phases: SETUP → SHUFFLE → DEAL_HOLE → BET_PREFLOP → DEAL_FLOP → BET_FLOP → DEAL_TURN → BET_TURN →
  DEAL_RIVER → BET_RIVER → SHOWDOWN → SETTLED.
- `applyMove` judges betting (check/bet/call/raise/fold with min-raise + side-pot math) and the
  showdown (best 5-of-7 hand ranking). **Hand ranking on-chain is the heaviest new logic** —
  needed only in the *disputed showdown* path, but must be exact-parity with the off-chain TS
  evaluator (fuzz-tested, as `HiLoWarParity.test.ts` does for Hi-Lo). See Risks.

---

## 7. Betting & showdown model

- **Betting:** standard Hold'em — small/big blinds (or antes for v1 simplicity), min-raise, multiple
  raises, all-in. Off-chain each action is a co-signed `ChannelStateN`. Bookkeeping generalizes
  `HiLoWarRules`' per-seat `contributed` + `pot` accumulation to N seats.
- **Side pots:** all-ins create side pots; `sidePots[]` tracks (amount, eligibleSeats). Standard
  poker side-pot algorithm. This is the main combinatorial complexity beyond Hi-Lo (which has only
  a single `pot` + `warPot`).
- **Showdown / hand ranking:** evaluate best 5-card hand from each surviving seat's 2 hole + 5
  community. Off-chain evaluator (TS) is normative for the happy path; an on-chain Solidity mirror
  is required *only* for disputed showdowns and must be parity-fuzzed against the TS evaluator.
- **Rake:** `rakeBps` (capped, e.g. ≤ 250 bps with an absolute cap) deducted from the pot at
  settle; `rakeAccrued` paid to a treasury/house address. Conservation includes rake so disputes
  always pay out exactly `Σ escrow`.
- **Folds/timeouts/disconnects (liveness):** A live seat that stops acting is handled by the
  per-seat dispute: any other seat opens a dispute naming `demandSeat`; if that seat doesn't post
  the owed move/share before the chess clock (sized in PoW-tempo-aware block windows), it **forfeits
  its current-hand stake into the pot (forced fold)** and play/settle continues among the rest.
  N-party liveness is genuinely harder than 2-party (one straggler shouldn't freeze the table) — the
  per-seat demand + forced-fold-on-timeout is the proposed answer.

---

## 8. How escrow + board + PoW are reused vs newly built

- **Reused as-is:** MsgBoard `board.ts` transport + WASM PoW stamper + off-main-thread guard;
  hash-chained `transcript.ts`; `elgamal.ts` masking/share/unmask + joint-key aggregation;
  Chaum–Pedersen prover/verifier (for the attested/CP path); `IGameRules` pattern;
  `ZkTable`'s dispute-machine architecture, `forceSafeTransferETH` payout safety, conservation
  invariant; the vendored `RevealVerifier` Groth16 path (`respondWithShare`).
- **Newly built:** `HoldemTableN.sol` (N-party escrow/pot/rake/settle/dispute);
  `IGameRulesN` + `HoldemRules.sol` (Hold'em phases, betting, side-pots, hand ranking);
  N-party off-chain channel (generalize `channel.ts` 2-sig → N-sig, 2-balance → N-balance);
  N-seat session orchestration over the board (deal sequencing, share collection, turn order);
  TS hand evaluator + its Solidity parity mirror; (optionally) the Zypher SNARK shuffle/reveal
  prover integration (Decision 2).

---

## 9. DECISIONS FOR THE HUMAN

### Decision 1 — First-game scope: full Hold'em now, or de-risk first?
- **Options:** (a) Full N-party single-card Texas Hold'em immediately. (b) **De-risk path:** ship a
  minimal N-party verifiable card game first — e.g. **N-seat one-card-high** (each seat gets one
  hole card, single ante, highest card wins; no betting rounds, no side-pots, no 5-card ranking) —
  to prove the *new* hard parts (N-party shuffle/reveal over the board + N-party escrow channel +
  per-seat timeout) before layering Hold'em betting/ranking on top.
- **RECOMMENDATION: (b) De-risk.** Rationale: the genuinely unproven surface is **N-party**
  shuffle/reveal coordination + N-party channel/timeout, *not* poker rules. The 2-party
  `HiLoWarRules` already proves single-card betting+showdown works behind `IGameRules`; multiplayer
  is the risk. A 3–6 seat one-card-high game exercises every new contract/protocol path with
  **zero** side-pot/hand-ranking complexity. Hold'em then reduces to "add `HoldemRules` + a hand
  evaluator + side-pots" behind the same proven N-party rails. This also lets us measure the real
  PoW-tempo UX cost of a multi-seat deal before committing to Hold'em's much larger post budget.

### Decision 2 — Prover availability (the critical feasibility gate)
- **Finding:** the repo has **only the on-chain verifiers** vendored (`ShuffleVerifier`,
  `RevealVerifier`). There is **NO off-chain prover** for either shuffle or reveal — no Rust, no
  WASM build, no `@zypher*`/`@uzkge*` npm dependency (confirmed absent from `pnpm-lock.yaml`). The
  test fixtures (`zypher-shuffle-head.json`, `zypher-reveal-snark.json`) are **static artifacts
  captured from an external "spike"/pinned-WASM**, only *verified* in tests, never *generated*. The
  live `AttestedElGamalDeck` uses a **signature** for shuffle (attested, not ZK) and **secp256k1**
  crypto — which is **a different curve than the vendored Baby JubJub verifiers** (§3.3), so the
  current off-chain deck and the vendored verifiers are not interoperable as-is.
- **Options:** (a) **v1 = keep attested shuffle + CP/Groth16 reveal on the existing secp256k1
  stack**, generalized to N parties (no external prover dependency; ships now; "real hiding + share
  soundness, attested shuffle" — same honesty posture as the 2-party stack). (b) **v2 = integrate a
  real Zypher uzkge prover** (their SDK/WASM or a Rust build) behind `MaskedDeckProvider`, which
  *also* requires re-homing the off-chain deck crypto onto Baby JubJub to match the verifiers.
- **RECOMMENDATION: Phase it — (a) for v1, (b) as a tracked follow-up.** Treat the SNARK shuffle as
  an **upgrade behind the `MaskedDeckProvider` seam**, exactly as `zk-cards-core` already documents
  ("a future provider replaces it behind the same interface once the SNARK SDK spike completes").
  **The prover gap should NOT block N-party Hold'em** because the attested path already gives real
  hiding + share soundness; what it lacks is a *ZK* shuffle (mitigated by the all-seats-shuffle
  protocol: cheating requires *all* shufflers to collude, and any single honest shuffler makes the
  order unknown). **FEASIBILITY VERDICT in §12.**

### Decision 3 — On-chain vs off-chain boundary (gas vs trust)
- **Options:** (a) **Thin chain (recommended):** chain only escrows, verifies N-of-N co-signed
  final state, pays out, and runs the dispute machine (forcing a move or a single Groth16 reveal
  ~225k gas, or hand-ranking only in a disputed showdown). Shuffle PLONK (1.57M gas) and routine
  reveals stay off-chain/disputable. (b) **Thick chain:** verify the shuffle PLONK proof and/or
  every reveal on-chain for maximal trustlessness.
- **RECOMMENDATION: (a) Thin chain.** On-chain shuffle verify is 1.57M gas *per shuffle* (×N
  shufflers per hand) — prohibitive per hand. The dispute-machine model (already proven in
  `ZkTable`) gives the same *economic* security (cheat → get disputed → lose escrow) at near-zero
  happy-path gas. On-chain hand-ranking is bounded to the rare disputed showdown.

### Decision 4 — Pot / rake / showdown + multiparty timeout/fold
- **Options:** rake model (per-pot bps cap vs per-seat fee); showdown evaluation authority
  (off-chain normative + on-chain dispute mirror vs always on-chain); timeout policy (forced-fold +
  stake-forfeit vs table-freeze + refund).
- **RECOMMENDATION:** **per-pot `rakeBps` with an absolute cap**, deducted at settle and included in
  conservation; **off-chain TS hand evaluator as normative with a fuzz-parity Solidity mirror** used
  only in disputed showdowns (mirrors the existing `HiLoWarParity` pattern); **per-seat
  forced-fold-on-timeout** (a stalling seat forfeits its current-hand stake into the pot via the
  chess clock; the table continues) so one disconnect never freezes N−1 honest seats. Side-pots via
  the standard all-in algorithm.

---

## 10. Risks

1. **Prover gap (highest).** No off-chain uzkge prover in-repo; the SNARK shuffle/reveal path is
   unbuilt and depends on an external Zypher SDK/WASM whose API, license, and **Baby JubJub crypto
   re-homing** cost are unverified. *Mitigation:* ship v1 on the attested/secp256k1 path behind the
   `MaskedDeckProvider` seam; gate the SNARK upgrade on a separate spike. (Decision 2.)
2. **Curve mismatch (§3.3).** Off-chain secp256k1 vs on-chain Baby JubJub — the live deck cannot
   produce proofs the vendored verifiers accept today. *Mitigation:* v1's reveal disputes can keep
   the existing fixture/Groth16 plumbing only if the deck is re-homed; otherwise v1 leans on
   co-signed settlement + state/move disputes and defers SNARK reveal disputes. **Must be resolved
   in planning** — it determines whether `respondWithShare` is live or deferred in v1.
3. **Gas of on-chain shuffle/reveal verify.** Shuffle PLONK ~1.57M gas; CP-DL reveal ~15.6M gas
   (unusable). *Mitigation:* thin-chain (Decision 3); use only the ~225k Groth16 reveal in disputes.
4. **N-party liveness.** One straggler must not freeze the table; collecting N signatures per state
   is more fragile than 2. *Mitigation:* per-seat forced-fold-on-timeout; PoW tempo gives natural
   window sizing; design for "settle among remaining live seats."
5. **On-chain hand ranking parity.** A Solidity 5-of-7 evaluator must exactly match the TS one or
   disputed showdowns mis-settle. *Mitigation:* fuzz-parity test (existing pattern); de-risk game
   (Decision 1) avoids it entirely for the first ship.
6. **PoW-tempo UX cost.** A full Hold'em hand is dozens of ~1–2s posts ⇒ minutes/hand. *Mitigation:*
   de-risk game first to measure; consider batching independent reveals; the tempo is also a
   *feature* (anti-grief, fairness clock).
7. **Board payload size for full-deck posts** (§5 FLAG). *Mitigation:* confirm RPC/board max; chunk
   or commit-only the shuffle if needed.
8. **Side-pot correctness** (multi-all-in) — classic source of poker bugs. *Mitigation:* de-risk
   game has no side-pots; heavy property tests for Hold'em.

---

## 11. Decomposition outline (for a later plan — NOT a commitment)

- **P0 — N-party crypto:** generalize/verify N-key aggregation, N-share unmask, per-slot share
  collection over the board (mostly exists in `zk-cards-core`; add N-seat orchestration + tests).
- **P1 — N-party channel:** generalize `channel.ts` (N sigs, N balances, conservation incl. pot/
  side-pots/rake); `ChannelStateN` + EIP-712 types; transcript already N-agnostic.
- **P2 — `HoldemTableN.sol` (or `OneCardHighTableN` for de-risk):** escrow[N], settle (N co-sigs),
  cancel/leave, conservation, vector payout, `forceSafeTransferETH`.
- **P3 — Dispute machine (N-party):** generalize `ZkTable` dispute to per-seat demand + chess clock
  + forced-fold-on-timeout; wire `respondWithShare` to the vendored Groth16 verifier (subject to
  Risk 2 resolution).
- **P4 — `IGameRulesN` + rules contract:** de-risk = one-card-high; Hold'em = betting/side-pots/
  hand-ranking; TS evaluator + Solidity parity fuzz.
- **P5 — Session orchestration over the board:** deal sequencing (the §5 flow), turn order, share
  collection, PoW pacing, reconnection.
- **P6 — (separate, gated) Zypher SNARK shuffle/reveal prover** behind `MaskedDeckProvider`
  (Decision 2 v2) — its own spike + spec.

---

## 12. FEASIBILITY VERDICT — prover side

**The N-party Hold'em game is FEASIBLE TO BUILD NOW on the existing attested/secp256k1 stack; the
*real Zypher uzkge SNARK shuffle/reveal* is NOT feasible in-repo today and is a genuine external
dependency (gap).**

Specifics:
- **What works today:** real ElGamal card hiding, joint N-key encryption, per-card decryption shares
  with Chaum–Pedersen soundness, co-signed channel, dispute machine, on-chain Groth16 *reveal*
  verifier (against a captured fixture). All proven in the 2-party stack.
- **The gap:** there is **no off-chain prover** for the PLONK *shuffle* or for producing *reveal*
  proofs that the vendored Baby-JubJub verifiers accept from live play. The verifiers are
  vendored; the proving side is external (Zypher SDK/WASM/Rust) and **unverified** — no SDK in the
  lockfile, fixtures came from an outside spike, and the live crypto is on a *different curve*
  (secp256k1) than the verifiers (Baby JubJub).
- **Why the gap does NOT block v1:** the attested shuffle (every seat shuffles; one honest shuffler
  ⇒ secret order) + real share-soundness gives a defensible trust model identical in posture to the
  shipped 2-party game. The SNARK shuffle is a **drop-in upgrade behind `MaskedDeckProvider`**, to
  be unblocked by a dedicated Zypher-SDK spike (its own spec).
- **Single biggest unknown to resolve before any SNARK build:** the **Baby JubJub re-homing cost**
  (§3.3) and the Zypher prover's API/license/perf. **Recommend the human authorize a short Zypher
  SDK spike in parallel with v1**, but do **not** gate N-party Hold'em on it.

---

## 13. Out of scope

- Building/porting the Zypher uzkge **prover** (separate spike/spec; Decision 2 v2).
- On-chain shuffle PLONK verification in the happy path (Decision 3).
- Tournament structure, blinds escalation, multi-table, rebuys/leave-mid-hand beyond forced-fold.
- Privacy beyond card-hiding (Track 2 territory); on-chain randomness/VRF (possible Track 4).
- Replacing the board transport or PoW.
- Re-deriving or re-auditing the vendored verifiers.

## 14. Open assumptions to confirm with the human (flagged)
1. **Curve re-homing (§3.3, Risk 2)** — is v1 allowed to keep secp256k1 + attested shuffle (reveal
   disputes possibly deferred), or must v1 use the Baby JubJub verifiers (requiring the Zypher
   prover up front)? *This is the load-bearing assumption.*
2. **De-risk game (Decision 1)** — is one-card-high an acceptable first ship, or must it be Hold'em?
3. **Board max payload** for a full-deck shuffle post (§5 FLAG).
4. **Rake destination/treasury** address & cap policy (Decision 4).
5. **Seat count target** (3–6 for v1 vs full 9) — affects gas of N-sig verification and side-pot
   complexity.

---

### Key source references
- Verifiers: `packages/contracts/contracts/vendor/uzkge/shuffle/ShuffleVerifier.sol`,
  `.../shuffle/RevealVerifier.sol`, `.../verifier/{ChaumPedersenDLVerifier,Groth16Verifier,PlonkVerifier}.sol`,
  `.../libraries/EdOnBN254.sol`, `.../shuffle/VerifierKey_{20,52}.sol`.
- Fixtures (captured, external origin): `packages/contracts/test/fixtures/zypher-{reveal-snark,shuffle-head}.json`;
  `packages/contracts/test/foundry/ShuffleVerifier52.t.sol`, `test/ZkVerifiers.test.ts`.
- 2-party channel to extend: `packages/contracts/contracts/zk/ZkTable.sol`,
  `.../zk/ChannelState.sol`, `.../zk/IGameRules.sol`, `.../zk/HiLoWarRules.sol`,
  `.../zk/ShuffleVerifier52.sol`.
- Off-chain card stack: `examples/games/zk-core/src/{elgamal,chaumPedersen,maskedDeck,attestedDeck,channel,transcript,stateSig,dispute}.ts`;
  `examples/games/hilo-war/src/{rules,encoding,session}.ts`.
- Board + PoW: `examples/games/msgboard-games/src/{board,stamper,msgboardTransport,transcript}.ts`.
- 2-party HouseChannel (a *different* model, not reused): `packages/contracts/contracts/games/{HouseChannel,HouseBankroll,GamePayouts,SessionState,Chips}.sol`.
- Program context: `docs/superpowers/specs/2026-06-23-zk-settle-design.md`,
  `docs/superpowers/specs/2026-06-24-zk-privacy-design.md`.
