/**
 * gen-recompute-vectors.ts — print fixed-seed parity vectors from the REAL TS game reference.
 * The numbers it prints are hardcoded into packages/contracts/test/foundry/GamePayouts.t.sol so the
 * Solidity port is checked against the canonical math (not a re-derivation).
 *
 * Run with a tsx that actually resolves (tsx is NOT a dep of @gibs/msgboard-settle; borrow the
 * house-service binary):
 *   cd examples/games/msgboard-settle && ../house-service/node_modules/.bin/tsx scripts/gen-recompute-vectors.ts
 */
import { dice, limbo, crash, monte, dicex2, roundRandom } from '@gibs/msgboard-games'

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

// ---- Phase-1 free reskins: crash (6), monte (9), dicex2 (10) ----
// For each, scan seed pairs s(2k-1)/s(2k) at nonce 1 until a WIN and a LOSS are found, then print
// both with their r + payout so they can be hardcoded into the foundry test.
type Found = { serverSeed: `0x${string}`; clientSeed: `0x${string}`; r: bigint; payout: bigint }

function scan(
  label: string,
  gameId: number,
  settle: (r: bigint) => { win: boolean; playerDelta: bigint },
): void {
  let win: Found | undefined
  let loss: Found | undefined
  for (let k = 100; k < 100_000 && (!win || !loss); k++) {
    const serverSeed = s(2 * k - 1)
    const clientSeed = s(2 * k)
    const r = roundRandom(serverSeed, clientSeed, 1n)
    const o = settle(r)
    const payout = o.win ? o.playerDelta + stake : 0n
    if (o.win && !win) win = { serverSeed, clientSeed, r, payout }
    if (!o.win && !loss) loss = { serverSeed, clientSeed, r, payout }
  }
  for (const [kind, f] of [['win', win], ['loss', loss]] as const) {
    if (!f) { console.log(JSON.stringify({ label: `${label}-${kind}`, gameId, error: 'not found' })); continue }
    console.log(JSON.stringify({
      label: `${label}-${kind}`, gameId,
      serverSeed: f.serverSeed, clientSeed: f.clientSeed, nonce: '1',
      r: f.r.toString(), win: kind === 'win', payout: f.payout.toString(),
    }))
  }
}

// crash (gameId 6), auto-cashout 200 (2.00x) — same curve as limbo
scan('crash', crash.gameId, (r) => crash.settleRound(stake, { autoCashoutX100: 200n }, r))
// monte (gameId 9), pick 0 — wins iff r % 3 == 0, pays 2.97x
scan('monte', monte.gameId, (r) => monte.settleRound(stake, { pick: 0 }, r))
// dicex2 (gameId 10), target 5000 mode 'both' — wins iff both derived rolls < 5000, pays 3.96x
scan('dicex2', dicex2.gameId, (r) => dicex2.settleRound(stake, { targetX100: 5000n, mode: 'both' }, r))
