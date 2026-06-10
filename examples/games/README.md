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

The 943 run is a deliberate manual gate, not part of continuous integration, but the whole
procedure is automated by `e2e/scripts/run-943.ts`. An operator holding the funded mnemonic runs,
from `examples/games/e2e`:

```bash
MNEMONIC="$(op read 'op://gibs/randomness/recovery phrase')" \
  RPC_943=<the valve.city endpoint> \
  pnpm run-943
```

The script deploys `CoinFlip` and `Raffle` against the live core Random at
`0x775AF72d62c85d2F7f0Bcc05BAa4Be0830087217` (pinned in `@gibs/games-core`'s chain registry) and
caches the addresses in `scripts/.games-943.json` so a re-run reuses them; allowlists three
mnemonic-derived validators and inks two price-zero preimages per validator (one for each game —
a preimage is one-shot); funds the player wallets from account zero with explicit gas caps (the
PulseChain call-prevalidation quirk); runs one coin-flip duel and one full raffle round, casting
inside the twelve-block heat window; asserts at every settlement that the off-chain `settle`
names the on-chain winner; waits out the hundred-block claim window and finalises the raffle
payout; and appends the run record below under "943 run log".

Useful switches: `DRY_RUN=true` simulates the deploys and an ink without broadcasting anything;
`SKIP_FINALISE=true` stops after the parity assertions instead of waiting roughly seventeen
minutes for the claim window (anyone may call `finalise` later); `COINFLIP=0x…`/`RAFFLE=0x…`
reuse known deployments; `EXPECTED_PROVIDER` guards against running with the wrong mnemonic.
`CHAIN=local` runs the identical code path against anvil as a smoke test (mining instead of
waiting, no run-log append). The original `packages/contracts/scripts/duel-943.ts` remains the
historical reference for the funding and gas-cap patterns.

## 943 run log

_No 943 run recorded yet. Operators: append deployed addresses and parity output here._
