# Morbius-parity games — trustless, permissionless design spec

**Status:** design / awaiting review · **Date:** 2026-06-28
**Goal:** Match the morbius.io game catalog (dynamics + UI), but replace their *backend SHA256*
fairness (trust-the-server) with genuinely **trustless + permissionless** mechanics built on the
rails we already ship: the two-sided seed chain, on-chain recompute settlement, MsgBoard as the
immutable commit/transcript medium, and ZK proofs where hidden state demands them.

---

## 0. Why this is mostly content, not cryptography

morbius runs `SHA256` on its own server and *shows* you a hash. You must trust that the server did
not pick or swap the seed after seeing your bet, and the "verify" runs on their box. That is the
"won't be evil" trap.

Our existing rails already invert it, and **every** single-player casino game reduces to the same
three building blocks we have shipped:

1. **Two-sided commit-reveal** (`src/rng.ts`): house publishes `commit = seeds[0]` (head of a
   keccak hash-chain) and the player commits `clientSeedCommit = keccak256(clientSeed)` at OPEN —
   posted to **MsgBoard** *before* any play, so neither side can grind. Round randomness is
   `raw = uint256(keccak256(abi.encode(serverSeed, clientSeed, nonce)))`.
2. **`Game<TParams>` interface** (`src/game.ts`): `settleRound(stake, params, raw) → {playerDelta,
   win, multiplierX100}`, `encodeRound(...)`, and `maxMultiplierX100(params)` (the escrow ceiling —
   funds-safety: `escrowHouse = stake*(maxMult-100)/100` must cover every possible `raw`).
3. **On-chain recompute** (`GamePayouts.sol` + `HouseChannel.settleWithSeeds`): the contract
   *reproduces* the TS math from the revealed seeds — **permissionless** settle, no house signature,
   no trusted prover. Stateful games add a Solidity *rules mirror* (like `MinesRules`) for disputes.

So adding a morbius game = **(a)** write its `settleRound` (outcome as a pure function of `raw`),
**(b)** mirror it byte-for-byte in `GamePayouts.sol`, **(c)** for multi-step games, derive the
hidden layout *from the seed* (not house choice) and co-sign each step over MsgBoard. No new
cryptography for ~all of them. ZK is reserved for two things only: (i) optional **bet/outcome
privacy** (Track-2 Pedersen + range proofs, per-game opt-in), and (ii) **multiparty card secrecy**
(mental poker) — which only Poker needs, and which is already built.

### The one non-negotiable invariant (the anti-"won't-be-evil" rule)
For **every** game added under this spec:
> The outcome is a pure, published function of `(serverSeedCommit-before-bet, clientSeed-by-player,
> nonce)`. Any hidden layout (mine board, deck order, tower path) is **derived from `raw`**, not
> chosen by the house, and only its commitment is on MsgBoard before play. Settlement is
> **recomputable by anyone** on-chain. Fairness is verified by math, never asserted by our server.

A "commit-reveal of a house-*chosen* board" proves only immutability, **not** fairness — so all
stateful boards in this spec MUST be derived by seeded Fisher–Yates / rejection sampling from `raw`.

---

## 1. Implementation patterns (each gap maps to exactly one)

| Pattern | Shape | Existing exemplar | New per game |
|---|---|---|---|
| **P1 — single-draw stateless** | one `raw` → outcome | dice, limbo, keno, plinko | `settleRound` + `GamePayouts` branch |
| **P2 — seeded multi-value** | expand `raw` into a stream `raw_i = keccak(raw, i)` → grid/sequence | plinko (multi-row) | as P1 + a deterministic stream helper |
| **P3 — stateful ladder/board** | seed-derived hidden layout committed; co-signed REVEAL/CASH_OUT steps over MsgBoard; bust or cash | **mines** | board derivation + session rules + Solidity mirror |
| **P4 — single-player vs dealer (cards)** | deck shuffled from `raw`; player decisions co-signed; dealer follows fixed rule | (hilo-war machinery) | deck-from-seed + hand eval + rules mirror |
| **P5 — pooled / pari-mutuel** | many players, one seeded draw | raffle, coinflip | bet aggregation + seeded draw |

**Cards are NOT mental poker.** In single-player-vs-dealer games the cards are public once dealt and
no other *player* holds hidden info — fairness is "was the 52-card deck shuffled from the committed
two-sided seed and not restacked." That is P4 (seeded shuffle + recompute), **not** B/mental-poker.
Mental poker (ZK shuffle + selective reveal) is only required when one *player's* cards must stay
secret from other *players* — i.e. multiplayer Poker, already shipped.

---

## 2. The 21 gaps

Grouped by pattern. Each entry: **dynamics/UI**, **params**, **outcome `f(raw)`**, **escrow
ceiling**, **on-chain**, **notes**. `EDGE = 1%` everywhere unless morbius reference says otherwise
(paytable VALUES still need confirming against IMG_2259.MP4 / live morbius — flagged ⚠).

### 2A. Single-draw stateless (P1 / P2) — 8 games

**1. Dice X2** (`/dicex2`)
- Dynamics/UI: dice with two independent rolls / a doubled-target variant (confirm exact morbius rule ⚠).
- Params: `{ targetX100, mode }`. Outcome: two draws `raw1=keccak(raw,0)%1e4`, `raw2=keccak(raw,1)%1e4`;
  win rule per mode (both-under / either-under). Multiplier from combined win-chance, edged.
- Escrow ceiling: max over the mode's multiplier table. On-chain: `_dicex2` branch. Reuse: dice math.

**2. Crash** (`/crash`) — *single-player auto-cashout form (the trustless one)*
- Dynamics/UI: rising multiplier curve; crashes at `C`. Player sets an **auto-cashout** target at OPEN
  (committed) → identical structure to limbo. (Live manual cashout is P3; see note.)
- Params: `{ autoCashoutX100 }`. Outcome: crash point `C = limbo-style (1-edge)/(1-U)` with `U=raw%1e6`;
  win iff `autoCashout ≤ C`, pays `autoCashout`. Escrow ceiling: `autoCashoutX100`. On-chain: reuse
  `_limbo` with a renamed param. **This is literally limbo with crash UI** — ship first.
- Note: a *live manual cashout* crash needs a co-signed CASH_OUT step before the seed-determined `C`
  is revealed (P3) so the player can't cash out after seeing the crash. Phase 2.

**3. Pachinko** (`/pachinko`)
- Dynamics/UI: ball drops through pegs into a slot (Plinko clone). Params: `{ rows, risk }`.
- Outcome: `rows` Bernoulli steps `bit_i = keccak(raw,i)&1` → bin = Σbits → `multiplier[bin]` (⚠ table).
  Escrow ceiling: max bin multiplier. On-chain: `_pachinko` = plinko mirror. Reuse: **plinko verbatim**.

**4. Wheel** (`/wheel`)
- Dynamics/UI: spin a segmented wheel; landing segment = multiplier. Params: `{ segments, risk }`.
- Outcome: `seg = raw % segments` → `multiplier[risk][seg]` (⚠ table). Escrow ceiling: max segment mult.
  On-chain: `_wheel` (table lookup). Reuse: keno-style table + edge.

**5. Roulette** (`/roulette2`)
- Dynamics/UI: European single-zero wheel (0–36); chip bets on numbers/splits/colors/dozens.
- Params: `{ bets: [{type, selection, amount}] }`. Outcome: `pocket = raw % 37`; payout = Σ over bets
  of `amount * payoutMultiple(type, pocket)`. Escrow ceiling: Σ max payout per bet (straight-up 35:1).
  On-chain: `_roulette` evaluates each bet type. Reuse: new but pure table; richest *params* of the set.

**6. Monte** (`/monte`) — three-card monte
- Dynamics/UI: pick 1 of 3 face-down; win if you find the card. Params: `{ pick∈{0,1,2} }`.
- Outcome: `winning = raw % 3`; win iff `pick==winning`, pays `~3x*(1-edge)`. Escrow ceiling: that mult.
  On-chain: trivial `_monte`. Reuse: dice-like.

**7. Greed Dice** (`/greed-dice`)
- Dynamics/UI: push-your-luck dice — re-roll to grow a multiplier, bust on a bad face, bank to cash.
  If "bank at any time" → P3 (co-signed steps). If "pre-commit number of rolls" → P1. Pick the P3
  form to match morbius's live feel (confirm ⚠). Params: `{ }` + per-step BANK/ROLL.
- Outcome (P3): each ROLL draws `face=keccak(raw,k)%6`; bust set busts, else multiplier grows by a
  fixed ladder; BANK cashes running multiplier. Escrow ceiling: max ladder before forced stop.
  On-chain: `GreedDiceRules` mirror (mines-style). Reuse: mines session machinery.

**8. Cipher** (`/cipher`) — "????" reveal game
- Dynamics/UI: guess a hidden code/symbol; partial-match feedback may chain a multiplier (Mastermind-ish;
  confirm exact rule ⚠). Likely P3 (guess → feedback → guess) or P1 (single guess).
- Outcome: hidden code `derive(raw)`; per-guess score → multiplier. Escrow ceiling: max multiplier.
  On-chain: `CipherRules`. Reuse: P3 if interactive, else P1.

### 2B. Stateful ladder / board (P3) — 5 games

All share the **mines** machinery: seed-derived hidden layout, `hashBoard`-style commit on MsgBoard at
OPEN, co-signed REVEAL/ADVANCE and CASH_OUT steps, running `multiplierX100`, bust → loss; a Solidity
rules mirror for the dispute path. **Layout MUST be `raw`-derived** (provably fair), not house-placed.

**9. Towers / Dragon Tower** (`/towers`)
- Dynamics/UI: climb floors; each floor pick 1 of N tiles, K are safe; advance multiplies, bomb busts;
  cash out anytime. Params: `{ floors, tilesPerFloor, safePerFloor }`. Per-floor mult =
  `(tiles/safe)*(1-edge)`. Layout: per-floor safe set from `keccak(raw, floor)`. Mirror: `TowersRules`.

**10. Chicken** (`/chicken`) — cross-the-road
- Dynamics/UI: step forward lane by lane; each lane safe or crash; multiplier grows per lane; cash out.
  Params: `{ difficulty }` → per-lane crash prob. Layout: per-lane crash from `keccak(raw,lane)`.
  Mirror: `ChickenRules`. (Structurally Towers with tilesPerLane=1.)

**11. Firewalk** (`/firewalk`)
- Dynamics/UI: walk a path of tiles; each step safe or burn; escalating multiplier; cash out. Same shape
  as Chicken with a themed escalation curve (confirm ⚠). Mirror: `FirewalkRules` (or reuse Chicken with
  a curve param).

**12. Heist** (`/heist`)
- Dynamics/UI: open vaults/crack safes for loot multipliers; an alarm tile busts; bank to escape. Mines
  with reward-bearing safe tiles (each safe reveal adds a seed-derived multiplier, not just survival).
  Params: `{ vaults, alarms, rewardTable }`. Layout + per-vault reward from `keccak(raw,i)`. Mirror:
  `HeistRules`.

**13. Cascade** (`/cascade`)
- Dynamics/UI: tumbling grid — symbols fall, matching clusters pay and are removed, remaining fall and
  cascade until no match (Gates-of-Olympus-style). **Fully determined by the seed** → can be a *single*
  settled outcome (P2): build grid from `raw`, resolve all cascades deterministically, return total
  multiplier. No per-step co-sign needed (no player decisions mid-cascade). Params: `{ bet, lines? }`.
  Outcome: `totalMultX100 = resolveCascades(gridFrom(raw))` (⚠ symbol/pay table). Escrow ceiling: capped
  max win (declare a hard cap, escrow to it). On-chain: `_cascade` resolves the same tumble loop — heavy
  but pure; gas-bench, and if too heavy use an optimistic co-sign + on-chain *dispute-only* recompute.

### 2C. Single-player vs dealer — cards (P4) — 8 games

Shared machinery: **deck shuffled from `raw`** (seeded Fisher–Yates over 52), player decisions co-signed
over MsgBoard, dealer follows fixed published rules, payout by hand eval. A Solidity **deck+rules mirror**
recomputes for disputes. NOT mental poker (cards are public once dealt; no other player). Reuse the
hand-eval and channel scaffolding from the Hold'em/hilo-war work where possible.

**14. Baccarat** (`/baccarat`) — *pure RNG, no player decisions → P1-simple*
- Params: `{ bet∈{player,banker,tie}, amount }`. Outcome: deal per fixed third-card rules from
  `shuffle(raw)`; resolve; payout by bet (banker 0.95:1, player 1:1, tie 8:1 ⚠). Escrow ceiling: tie
  payout. On-chain: `_baccarat` (deal both hands + fixed draw rules). **Ship early — no co-sign needed.**

**15. Dragon Tiger** (`/dragon-tiger`) — *pure RNG → P1-simple*
- Params: `{ bet∈{dragon,tiger,tie}, amount }`. Outcome: one card each from `shuffle(raw)`; higher wins;
  payouts (1:1, tie 11:1 ⚠). Escrow: tie. On-chain: trivial `_dragonTiger`. Ship early.

**16. Andar Bahar** (`/andar-bahar`) — *pure RNG → P1-simple*
- Params: `{ bet∈{andar,bahar}, amount }`. Outcome: reveal joker, deal alternately A/B from `shuffle(raw)`
  until a rank match; winning side = match side; payout per side (~0.9–1:1 ⚠). Escrow: max side payout.
  On-chain: `_andarBahar` (deal loop). Ship early.

**17. Hi-Lo** (`/hilo`) — card ladder (P3)
- Dynamics/UI: a card is shown; guess next higher/lower (or same); correct chains a growing multiplier;
  cash out anytime. Params: per-step HIGHER/LOWER/CASH_OUT. Cards from `shuffle(raw)` stream; per-step
  multiplier = `(1-edge)/P(correct)` from remaining-deck odds. Mirror: `HiLoRules`. Reuse: adapt the
  existing **hilo-war** rules to the single-player ladder.

**18. Three Card Poker** (`/three-card-poker`) — vs dealer (P4)
- Params: `{ ante, playBet?, pairPlus? }`; one PLAY/FOLD decision (co-signed). Outcome: 3 cards each from
  `shuffle(raw)`; dealer qualifies on Q-high; standard ante/play + Pair-Plus payouts (⚠ table). Escrow:
  Pair-Plus straight-flush top. On-chain: `_threeCardPoker` (3-card eval). Reuse: small hand-eval.

**19. Video Poker** (`/video-poker`) — Jacks-or-Better (P4)
- Params: `{ bet }`; one HOLD-mask decision (co-signed). Outcome: deal 5 from `shuffle(raw)`, replace
  non-held from the seed stream, pay by final rank (⚠ paytable). Escrow: royal-flush mult. On-chain:
  `_videoPoker` (5-card rank). Reuse: poker hand-eval from Hold'em.

**20. Blackjack** (`/BLACKJACK`, multiplayer `/blackjack-multi`) — vs dealer (P4)
- Dynamics/UI: hit/stand/double/split vs dealer; deck from `shuffle(raw)`; dealer hits to 17. Params:
  per-step HIT/STAND/DOUBLE/SPLIT (co-signed). Outcome: standard BJ payouts (3:2 BJ ⚠). Escrow: split+
  double worst case (size carefully). On-chain: `BlackjackRules` mirror (the most decision-rich P4).
  `blackjack-multi` = several P4 seats sharing one seeded shoe; still public cards → **not** mental poker.

**21. Craps** (`/craps`) — dice, multi-roll (P3)
- Params: line/come/odds/prop bets; multi-roll come-out → point. Outcome: per-roll `2d6` from
  `keccak(raw,k)`; resolve bets per craps rules. Mirror: `CrapsRules`. Reuse: dice + a bet-resolution
  table; richest *state* machine of the set — sequence last.

### Bonus (Structure C, ~free): **Lottery** (`/lottery`)
Pooled pari-mutuel draw → reuse **raffle** rails: players buy tickets (MsgBoard posts), a seeded draw
picks winner(s), on-chain pooled settle. Not counted in the 21; near-zero new work.

---

## 3. What MsgBoard + ZK each provide

- **MsgBoard (every game):** carries the OPEN commit (server `commit` + `clientSeedCommit`), every
  co-signed step, and the final reveal — the immutable, publicly-auditable transcript that replaces
  morbius's private server log. The pre-bet commitment living on MsgBoard is what makes "commit before
  the bet" *verifiable by anyone*, not asserted.
- **On-chain recompute (every game):** the permissionless settle — the contract reproduces the result
  from revealed seeds; no house co-sign required to get paid.
- **ZK — only where it buys something:**
  - *Bet/outcome privacy* (optional, per game): Track-2 Pedersen commitments + range proofs hide stake
    and result while preserving the recompute (we have M1; M2 on-chain verifier merged).
  - *Multiparty card secrecy*: mental-poker shuffle + selective reveal — **only Poker**, already built.
  - Single-player card games do **not** need ZK; seeded shuffle + recompute is sufficient and cheaper.

---

## 4. Sequencing (value / effort)

1. **Free reskins (days): ✅ SHIPPED (2026-06-28).** Crash (id 6, =limbo), Pachinko (id 7, =plinko),
   Wheel (id 8), Monte (id 9), Dice X2 (id 10) — all five implemented as `Game<TParams>` modules in
   `examples/games/msgboard-games/src/games/` with full unit + escrow-ceiling tests (121 TS tests green).
   On-chain recompute mirrors added for the pure-formula three (Crash, Monte, Dice X2) in
   `GamePayouts.sol`, parity-pinned by `GamePayouts.t.sol` vectors (12 foundry tests green). Pachinko +
   Wheel are table games → on-chain mirror deferred to the same "table games on-chain" milestone as the
   not-yet-mirrored Plinko/Keno (they settle via the co-signed transcript path meanwhile). Remaining:
   UI screens to match morbius dynamics, and pinning the ⚠ placeholder paytables to real values.
2. **Pure-RNG cards (P1-simple): ✅ SHIPPED (2026-06-28).** Baccarat (id 11), Dragon Tiger (id 12),
   Andar Bahar (id 13) — a self-contained seeded 52-card deck (`src/cards.ts`, full Fisher–Yates from
   one round random, on-chain-reproducible) + deal-from-seed by fixed rules, no co-sign. Edge is
   STRUCTURAL (banker commission / tie odds / andar-first asymmetry), not an extra 1%. Full unit tests
   + web screens wired. On-chain deal mirror deferred to the "table games on-chain" milestone.
3. **Ladders (P3, one engine): ✅ SHIPPED (2026-06-28).** A generalized co-signed ladder ENGINE
   (`src/ladder.ts`) — seed-DERIVED hidden layout (never house-placed), co-signed steps, running
   multiplier, cash-out/bust, generic dispute replay (`verifyLadder`), gameStateHash ABI encoding — then
   Towers (14), Chicken (15), Firewalk (16), Heist (17), Hi-Lo (18), Greed Dice (19) as thin per-step
   resolvers. Full tests (growth, bust, escrow ceilings, dispute accept/reject) + a generic
   `useLadderSession` hook + six web screens. On-chain `LadderRules.sol` dispute mirror tracks the same
   "stateful games on-chain" milestone as MinesRules. 157 msgboard-games TS tests green overall.
4. **Decision cards (P4): ✅ SHIPPED (2026-06-29).** Craps (id 20, decisionless multi-roll → fits
   Game<TParams>), Three Card Poker (21, play/fold), Video Poker (22, hold-mask), Blackjack (23,
   hit/stand/double state machine). `src/poker.ts` 3-card + 5-card (Jacks-or-Better) evaluators. Trust
   model = mines-style: deck committed via keccak(seed), cards revealed incrementally (hole/undrawn deck
   stay hidden until settlement), per-game `verify(claim, seed)` re-checks the whole hand. Full logic
   tests (195 msgboard-games TS green) + web screens (Craps on useSession; the three decision games on an
   in-process-house deal→decide→settle flow with client-side verify). Splits/odds-bets out of scope.
5. **Cascade (P2): ✅ SHIPPED (2026-06-29).** `src/games/cascade.ts` (id 24) — a 6×5 tumbling-grid slot
   (Gates-of-Olympus-style): scatter-pays at 8+ of a symbol, winners clear, survivors fall, fresh symbols
   drop from the seed stream, tumble repeats until no match. The ENTIRE tumble (initial grid + every
   refill) is a pure function of `raw` via `subRandom(raw, index)` → single P2 settle, no co-sign; the
   total is hard-capped at 50.00x (= the escrow ceiling) and tumbles bounded, so it always terminates.
   RTP is not closed-form (branching refills), so — as real slots are certified — the pay table is
   calibrated by Monte-Carlo and the realized RTP (~0.94) is verified in a band strictly below 100%
   (`test/cascade.test.ts`, 8 tests: determinism, escrow bound, scatter invariants, RTP). A `CascadeScreen`
   replays the tumble with a client-side verify. On-chain `_cascade` mirror tracks the stateful-games
   milestone (heavy-but-pure tumble loop; gas-bench, else optimistic + dispute-only).
6. **Lottery (Structure C): ✅ SHIPPED (2026-06-29).** `src/lottery.ts` — a pooled, pari-mutuel raffle
   (players-vs-players; the house only takes a rake, no bankroll risk). `winningTicket =
   roundRandom(serverSeed, participationCommit, nonce) % totalTickets`, where `participationCommit` is a
   hash of the FINAL ticket list — so the draw is ungrindable by EITHER side (house commits its seed
   before sales close; a late buyer can't compute the winner without the seed preimage). Single + tiered
   (`lotteryDrawMultiple`, distinct tickets) draws, exact pool/rake/prize-split math (no wei lost),
   `verifyLotteryDraw`. `test/lottery.test.ts` (9 tests incl. win-frequency-tracks-share + the
   ungrindable/preimage property). `LotteryScreen` demos buy→draw→verify. Reuses the existing on-chain
   raffle rails for settlement.
7. **Privacy pass:** wire Track-2 bet/outcome privacy across the P1 games once the catalog is in.

## 5. Open items
- ✅ **Paytable RTP — DONE (2026-06-29).** The eyeballed bucket tables were not just unverified, they
  were broken (wheel paid 111% — house loses; pachinko 79%; keno 51%). Rebuilt via `src/rtp.ts`: every
  table is normalized from a relative shape to a fair mean of 1.00x (binomial for plinko/pachinko,
  uniform for wheel, hypergeometric for keno), edged once → verified ~1% edge. `test/rtp.test.ts`
  computes each table's realized RTP and asserts it is never player-favorable and within band. Phase-2/3
  games are RTP-correct by construction (payouts derived from probability). Matching morbius's exact
  distribution numbers (IMG_2259.MP4 + live site) remains optional polish.
- ✅ **Secret-exposure tests — DONE (2026-06-29).** `test/secrecy.test.ts` asserts commit-before-reveal:
  seed-chain future-seed hiding, client-seed commit binding, roundRandom needing both raw seeds, and
  mines/ladder layouts absent from in-flight state + tamper/wrong-seed rejection.
- 🔄 **On-chain mirror — pure-RNG games DONE (2026-06-29).** `GamePayouts.sol` now recomputes baccarat
  (11), dragon tiger (12), andar bahar (13) — incl. the seeded Fisher–Yates shuffle ported bit-for-bit —
  and the cascade tumbling slot (24), joining dice/limbo/crash/monte/dicex2 on the single-draw recompute
  path. Parity is pinned by `test/foundry/CardCascadePayouts.t.sol` (13 vectors from the canonical TS via
  `gen-recompute-vectors.ts`; 111 foundry tests green). Cascade gas-benched ~160k (heavy-but-pure tumble
  loop) — fine for permissionless/dispute settle. STILL DEFERRED to a "stateful games on-chain" milestone:
  the RTP-table games (plinko/keno/pachinko/wheel — need the table-builder on-chain) and the stateful/
  decision games (mines, ladder family, three-card poker, video poker, blackjack — recompute needs the
  per-step transcript, not just `r`).
- ⚠ Exact rules for the novel originals (Cipher, Firewalk, Heist, Greed Dice, Cascade) need confirming
  against the live games — the patterns above are the trust-correct skeleton; the precise curves are TBD.
- Escrow ceilings must be proven `>= max payout` per game (extend `test/escrowCeiling.test.ts`).
- Decide co-sign vs on-chain-recompute cost trade per remaining stateful game (Blackjack gas); Cascade's
  recompute is now mirrored and benched.
- Confirm whether any morbius "Live" tables are true human-dealer (3rd-party) — those are **out of
  scope**: a human dealer cannot be made trustless; do not fake it.
