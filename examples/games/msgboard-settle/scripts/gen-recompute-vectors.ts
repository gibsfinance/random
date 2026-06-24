/**
 * gen-recompute-vectors.ts — print fixed-seed parity vectors from the REAL TS game reference.
 * The numbers it prints are hardcoded into packages/contracts/test/foundry/GamePayouts.t.sol so the
 * Solidity port is checked against the canonical math (not a re-derivation).
 *
 * Run with a tsx that actually resolves (tsx is NOT a dep of @gibs/msgboard-settle; borrow the
 * house-service binary):
 *   cd examples/games/msgboard-settle && ../house-service/node_modules/.bin/tsx scripts/gen-recompute-vectors.ts
 */
import { dice, limbo, roundRandom } from '@gibs/msgboard-games'

// Two fixed (serverSeed, clientSeed, nonce) triples chosen to land a WIN and a LOSS for each game.
// Adjust the seeds until both outcomes appear (the script prints win/loss so you can tune).
const stake = 200n

function show(label: string, serverSeed: `0x${string}`, clientSeed: `0x${string}`, nonce: bigint,
             game: typeof dice | typeof limbo, targetX100: bigint) {
  const r = roundRandom(serverSeed, clientSeed, nonce)
  const outcome = game.settleRound(stake, { targetX100 } as never, r)
  const payout = outcome.win ? outcome.playerDelta + stake : 0n // playerDelta = payout - stake
  console.log(JSON.stringify({
    label, gameId: game.gameId, serverSeed, clientSeed, nonce: nonce.toString(),
    targetX100: targetX100.toString(), r: r.toString(),
    win: outcome.win, payout: payout.toString(),
  }))
}

const s = (n: number) => (`0x${n.toString(16).padStart(64, '0')}`) as `0x${string}`

// dice (gameId 1), target 5000 (50.00% roll-under)
show('dice-win',  s(1), s(2), 1n, dice, 5000n)
show('dice-loss', s(3), s(4), 1n, dice, 5000n)
// limbo (gameId 2), target 200 (2.00x)
// NOTE (Task 2 review fix): at target 200 / nonce 1, the s(5)/s(6) pair LOSES and s(7)/s(8) WINS.
// The labels were originally swapped; the seeds below are picked so each label matches its real
// outcome at nonce 1 (verified by running this script).
show('limbo-win',  s(7), s(8), 1n, limbo, 200n)
show('limbo-loss', s(5), s(6), 1n, limbo, 200n)
