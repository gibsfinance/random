# P2P coin flip — players as their own validators (design spec)

Status: agreed direction 2026-07-20. Upgrade path for the coin flip: drop the validator set;
the two players **are** the validators. Each commits their own randomness and posts a pre-signed
forfeit authorization (EIP-3009) up front, so bailing on the reveal pays the other player.
msgboard carries all coordination; the happy path is **one on-chain transaction total** (the
winner's settle). No third party, no house, no validator-honesty assumption.

## Why this works (and what the validator set was actually for)

Validator entropy is commit-reveal by neutral third parties. Its two jobs:

1. **Entropy nobody controls** — for a 2-party game, the players' own commit-reveal already
   provides this: `outcome = f(secret_A, secret_B)` is unpredictable to each party alone.
2. **Liveness** — someone always reveals, so the draw can't be held hostage. This is the only
   job that actually needs *someone else* — unless refusing to reveal is made strictly
   unprofitable. That's what the forfeit bond does.

So: entropy from the players, liveness from economics. Validators removed.

## Protocol

Roles: players A and B. Token: an EIP-3009 token (see [token requirements](#token)).
All off-chain messages are PoW-stamped msgboard posts (ordering + timestamping + public audit).

### 1. OPEN (off-chain, msgboard)
- A and B agree `terms = {gameId, token, stake, bond, revealDeadline, challengeWindow}`.
  `gameId = keccak(A, B, salt)` — unique per flip.
- Each posts `commit_i = keccak(gameId, i, secret_i)` (domain-bound: a commit can't be replayed
  across games or copied from the other player).
- Each signs and posts an **EIP-3009 `receiveWithAuthorization`**:
  `{from: player_i, to: FlipSettle, value: stake + bond, validAfter: 0,
    validBefore: revealDeadline + challengeWindow + claimWindow, nonce: keccak(gameId, i)}`
  - `receiveWithAuthorization` (not `transferWithAuthorization`): only the payee contract can
    execute it, so a mempool observer can't front-run/burn the authorization.
  - The `nonce` binds the authorization to this game; the token's 3009 nonce registry makes it
    single-use.
  - Nothing is escrowed yet. No gas has been spent by anyone.

### 2. REVEAL (off-chain, msgboard)
- Both post `secret_i` before `revealDeadline`.
- `outcome = keccak(gameId, secret_A, secret_B) & 1` → winner. Both players (and any reader)
  can verify commits and compute the winner instantly.

### 3. SETTLE (on-chain, one tx, winner pays gas)
- Winner calls `FlipSettle.settle(terms, commit_A, commit_B, secret_A, secret_B, auth_A, auth_B)`.
- Contract: verifies both commits, recomputes the outcome, pulls `stake + bond` from both via
  the two 3009 authorizations, pays the winner `2·stake`, **returns both bonds** (each player
  gets their bond back — the bond only ever moves on a forfeit).
- The loser never sends a transaction and never needs gas. The flip's full transcript (terms,
  commits, auths, reveals) sits on msgboard for anyone to audit.

### 4. FORFEIT (the bail path — optimistic, with a challenge window)
The contract cannot see msgboard, so it can't verify "B never revealed" directly. Absence is
proven optimistically:

- After `revealDeadline`, A calls
  `FlipSettle.claimForfeit(terms, commit_A, commit_B, secret_A, auth_A, auth_B)` —
  revealing A's own secret on-chain and opening a claim.
- **Challenge window** (`challengeWindow`, e.g. 24h): B can call
  `counterReveal(gameId, secret_B)`. If B does, the contract has both secrets → it settles as a
  normal fair flip (step 3 economics; both bonds returned). An honest-but-offline B loses
  nothing but the counter-reveal gas — which the forfeiting rules can even reimburse from A's
  claim deposit.
- If the window lapses unanswered: contract pulls both authorizations, pays A
  `2·stake + B's bond`, returns A's bond. Bailing cost B their stake **and** their bond.

Note the claim itself is a commitment: A must reveal `secret_A` to open it, so A can't use a
forfeit claim to fish — if B counter-reveals, the flip settles on exactly the numbers both
committed to in OPEN. Neither path lets anyone change or re-roll anything.

## The two traps (why the naive version is broken)

### Trap 1 — even-money indifference
At even money, a losing player's reveal costs them `stake`, and (bond-less) bailing also costs
`stake`. Indifferent → some fraction of losers grief for spite/latency. The **bond** breaks the
tie: bailing costs `stake + bond`, revealing a loss costs `stake`. Revealing strictly dominates
for any `bond > 0`; size it to also cover the counterparty's claim-path gas plus a margin
(e.g. `bond = 10–20% of stake`, floor of ~2× the claim gas at prevailing prices).

### Trap 2 — last-revealer grind (why this doesn't generalize to the raffle)
In a 2-party flip the reveal outcome is fully determined at commit time — withholding can't
*steer* the result, only forfeit it, and the bond makes that a strict loss. But with N parties
and a shared pot, a withholder chooses between `outcome(with my secret)` and
`outcome(without me)` — a free extra sample whose value scales with pot size, so bonds would
have to scale with the pot to stay safe. That's why the **raffle keeps the validator set** (or
graduates to per-entrant bonds ≥ pot-fraction EV, which stops being fun). This upgrade is
scoped to 2-party games; the flip is the clean fit.

## Where ZK does and doesn't enter

Honest accounting: the flip itself needs **no ZK** — one-shot secrets are revealed at the end,
so transparent commit-reveal is a complete proof. The badge stays 🤝 (two-party sealed
randomness), now with zero third parties. ZK enters later exactly where something must stay
hidden while proven: multiplayer hidden state (Hold'em track) and optional succinct settlement
(`settleWithProof`-style compression of transcripts).

## Token requirements {#token}

- Needs an EIP-3009 token. **Chips is ours** — add the 3009 extension (`receiveWithAuthorization`
  + authorization-nonce registry; OpenZeppelin-compatible, USDC-proven pattern).
- Native PLS / WPLS: no 3009. Fallback for arbitrary ERC-20s: one-time `approve(FlipSettle)` +
  a game-scoped EIP-712 `StakeAuth` verified by the contract itself (same signature UX, pull via
  `transferFrom`). 3009 is preferred because it needs no prior approval tx at all.

## Contract sketch

```
FlipSettle
  settle(terms, commitA, commitB, secretA, secretB, authA, authB)
    – verify commits, recompute outcome, pull both (stake+bond) via 3009,
      pay winner 2·stake, refund both bonds. gameId consumed.
  claimForfeit(terms, commitA, commitB, secretClaimer, authClaimer, authDefaulter)
    – require now > revealDeadline; verify claimer's commit; store claim; start window.
  counterReveal(gameId, secret)
    – within window: verify commit → settle as fair flip.
  finalizeForfeit(gameId)
    – after window: pay claimer 2·stake + defaulter's bond; refund claimer's bond.
```

State per game: one storage slot (claim hash + deadline), only touched on the forfeit path.
Happy path is stateless — `settle` verifies everything from calldata and the token's 3009
nonce registry provides replay protection.

## Migration

1. Chips + 3009 extension (contract change, testnet first).
2. `FlipSettle` contract + unit tests incl. both traps (indifference bond math, front-run of
   `transferWithAuthorization` vs `receiveWithAuthorization`, challenge-window griefing).
3. Web: coinflip screen gains the OPEN/REVEAL msgboard handshake (reuse the tables' co-sign
   session plumbing + the wordle screens' msgboard transport).
4. Badge: coinflip 🛡️ → 🤝. The Numbers stays 🛡️ (structurally multi-party; see Trap 2).
```
