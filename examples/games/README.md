# Games Platform — off-chain core and consumers

The off-chain half of the games platform: a chain-agnostic core library, one thin package per
game, and an end-to-end harness that proves the off-chain settlement always names the same winner
the contract pays.

## Package layout

- **`core/` (`@gibs/games-core`)** — the substrate every game and every front end builds on. It
  owns the chain registry (a local development node on chain identifier 31337 and PulseChain
  testnet version four on chain identifier 943), the contract bindings and client factories, the
  validator secret and seed helpers, the round-state reader, the operator helpers (inking a
  validator pool, building bound heat locations, casting the seed), and the four-method `Game`
  interface. The fairness guarantee is structural: `settle(params, entries, seed)` takes the seed
  as an input only, so a game implementation physically cannot route player data back into the
  seed.
- **`coinflip/` (`@gibs/coinflip`)** — the coin flip as a `Game` implementation: an even seed pays
  the heads player, an odd seed pays the tails player, exactly as the contract computes it.
- **`raffle/` (`@gibs/raffle`)** — the raffle as a `Game` implementation: the revealed guess
  closest to the draw (one plus the seed modulo two hundred fifty-six, in the range one to two
  hundred fifty-six) wins; ties break to the earliest commit block and then the smallest ticket
  identifier, identical to the contract's comparison.
- **`e2e/` (`@gibs/games-e2e`)** — the deploy helper, the cross-layer parity test, and the two
  runnable scripts. Nothing here contains game logic; it exercises the packages above against real
  contracts on a real node.

## Running the local end to end

Prerequisites: install Foundry so the `anvil` local node is available, compile the contracts once
(`npx hardhat compile` inside `packages/contracts`), and run `pnpm install` at the repository root.

1. Start the local node in one terminal: `anvil`
2. From the repository root, in another terminal:
   - `pnpm --filter @gibs/games-e2e test` — the cross-layer parity test: a full raffle round
     on-chain, then the off-chain `settle` over the same entries and seed, asserting both name the
     same winning ticket.
   - `pnpm --filter @gibs/games-e2e duel` — a complete coin flip: two players enter, the validator
     subset is heated, the secrets are cast, and the script prints the off-chain winner beside the
     on-chain winner followed by `PARITY OK`.
   - `pnpm --filter @gibs/games-e2e raffle` — a complete raffle round through finalisation, with
     the same parity print.

Each script deploys fresh contracts, so restart `anvil` between runs (or just leave it running —
fresh deployments do not collide, but event scans start from block zero, so a fresh chain keeps
the output unambiguous).

## The disclosed trust assumption

Any player-facing surface must show this plainly: **a draw is safe as long as at least one of the
chosen validators is honest.** The contracts bind the heated entropy locations to the declared
validator subset positionally, so no party — not the operator, not the other player, not the game
itself — can substitute entropy sources after entry. What remains is the honesty assumption over
the subset the players accepted: if every validator in the subset colludes, they can grind the
seed; if even one is honest, they cannot.

## The live PulseChain testnet version four run (manual gate)

The 943 run is a deliberate manual gate, not part of continuous integration. The procedure, for an
operator holding the funded mnemonic:

1. Read the mnemonic without echoing it: `MNEMONIC="$(op read 'op://gibs/randomness/recovery phrase')"`
2. Core Random is already live at `0x775AF72d62c85d2F7f0Bcc05BAa4Be0830087217` (this address is
   pinned in `@gibs/games-core`'s chain registry). Deploy `Raffle` and `CoinFlip` against it,
   allowlist the funded validator accounts on each game, and ink one price-zero preimage per
   validator.
3. Set `CHAIN=943` and run one coin-flip duel and one raffle round end to end. The cast must land
   inside the twelve-block heat window, so override the remote procedure call endpoint to the
   valve.city one (`RPC_943`) for reliability inside that window. See the header of
   `packages/contracts/scripts/duel-943.ts` for the funding amounts and the gas-cap pattern — that
   script remains the reference harness for 943.
4. Confirm the on-chain winner equals the off-chain `settle` output, then record the deployed
   addresses and the run output below under "943 run log".

## 943 run log

_No 943 run recorded yet. Operators: append deployed addresses and parity output here._
