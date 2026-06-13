# Random [![Coverage Status](https://coveralls.io/repos/github/gibsfinance/random/badge.svg?branch=master)](https://coveralls.io/github/gibsfinance/random?branch=master)

a repo for generating randomness on chain

## deployment notes

```bash
npx hardhat ignition deploy ignition/modules/Random.ts --network pulsechainV4
npx hardhat ignition deploy ignition/modules/Reader.ts --network pulsechainV4
npx hardhat ignition deploy ignition/modules/Consumer.ts --network pulsechainV4
npx hardhat ignition verify chain-943 --include-unrelated-contracts
```

## ZK cards contracts

A game-agnostic two-party state-channel card table plus the first game's rules and the
SNARK verifiers that adjudicate disputes. Deployed together via `ignition/modules/ZkCards.ts`.

- **`ZkTable`** — escrow + the channel/dispute machine. It is game-agnostic: it verifies
  EIP-712 co-signed `ChannelState`s and delegates transition legality to a per-table
  `IGameRules` contract chosen at `create` (the joiner accepts those rules by joining — no
  owner, no registry governance). The honest path is three transactions (create, join,
  settle) and never pays proof-verification gas.
- **`IGameRules`** — the rules seam. `ZkTable` consults one of these per table for
  `hashGameState` / `whoseTurn` / `isFinal` / `applyMove`.
- **`HiLoWarRules`** (game id 1) — a pure mirror of `@gibs/hilo-war`'s `applyMove`,
  consulted only by the dispute machine. The TS module is normative; `HiLoWarParity` fuzzes
  the two against each other.
- **Vendored uzkge verifiers** (`contracts/vendor/uzkge/`, pinned commit `2ae729db`) +
  the calldata-shaped `ShuffleVerifier52` wrapper. **The pin is a consensus constant** —
  prover wasm and these verifiers must come from the same commit; see `contracts/vendor/VENDOR.md`
  for the pin, the GPL-3.0 license posture, and the pre-mainnet blockers.

Disputes are answered by a higher-nonce co-signed state, by the demanded game move
(validated by the rules contract), or by the demanded reveal share — the latter is
**Groth16 snark-reveal only** (`RevealVerifier`); the CP-DL on-chain path is banned at
15.6M gas. Clock expiry forfeits the disputed pot to the disputant and settles balances
from the contested co-signed state. The chess clock is creator-set per table
(`clockBlocks`, bounds 30–60480, ~5 min to ~1 week; suggested client default 360 ≈ 1 hour);
no dispute bond in v1.

The EIP-712 domain is `("ZkTable", "1", chainId, zkTableAddress)`, consumed off-chain via
`makeDomain` in `@gibs/zk-cards-core`. Channel-state and game-state hashes are abi-encoded
(not JSON) so the contract can reproduce them — the canonical tuples are mirrored in the TS
packages and enforced by parity tests.

## randomness providing

Providing randomness, at the end of the day, is a numbers game (excuse the pun).

You need to be able to ensure that validators have a reason to stay online and keep their stack of preimages up to date, but you want it to happen at as little of a cost and complexity as possible so that providers do not have a high barrier to cross to get you the randomness you request.

This game is achieved using the following mechanics:

- providers stake a number of tokens that they expect to be paid (on average) for providing their seeds this occurs when preimages are written
- consumers stake an amount to cover the total randomness seeds requested. the prices can be different for each provider's preimages
- any provider that gets their secret on chain, either via the consumer or by writing it themselves, before the consumer asks for the campaign to end will not be slashed
- consumers can "slash" any validator by taking the preimages that they requested and were not delivered
- failing to get all secrets on chain means that providers will not be rewarded with the funds that the consumer staked
- providers must either put secrets on chain themselves or come up with mechanism to do so in batches if gas is a consideration
- consumers must request a number of seeds that make the number that is generated credibly neutral, luckily, only one actor must be honest for the seed to be credibly random

consider the following example

alice requests randomness from bob, charlie, and david. bob's preimage costs 90 PLS while charlie's costs 125 and david's costs 100. Alice will have to stake 315 PLS (90+125+100) to properly request randomness inputs from the 3 sources. From here, the following results could occur:

- all 3 providers expose their secrets to the public and alice, who writes the data on chain, distributes the pot to david who was randomly chosen by the resulting seed.
- all 3 providers expose their secrets to the public, however alice has faulted and does not write the secrets on chain quickly. at some point, david notes that he is the winner of the pot and notes that the timeline is expiring. he decides to write the randomness on chain, distributing tokens to each of the validators and the pot to himself.
- all 3 providers expose their secrets, alice faults, then all 3 of the providers fault. in this case, any address that has the appropriate data and secrets can submit them on chain. bob is the first to come back online and he decides to submit all 3 secrets. releasing each of the 3 providers staked tokens back to themselves and distributing the pot to david.
- providers expose, alice and providers fault. bob comes online and only knows his secret. he submits that secret to make sure that he is not slashed. alice comes online next and has all 3 secrets, but chooses to cancel the timeline because it has expired. she is reimbersed with her stake as well as charlie and david's staked tokens.
