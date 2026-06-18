import { onchainTable } from 'ponder'

// One row per indexed CoinFlip/Raffle log. The frontend queries these and runs its EXISTING
// deriveCoinFlipLobby / deriveRaffleRounds over them, so the round logic stays in one place and
// doesn't diverge. Event args are stored as JSON with bigints serialised to strings (JSON/GraphQL
// has no bigint); the frontend re-hydrates the handful of bigint fields it reads.
export const gameEvent = onchainTable('game_event', (t) => ({
  id: t.text().primaryKey(), // `${txHash}-${logIndex}` — unique per log; re-indexing is idempotent
  game: t.text().notNull(), // 'coinflip' | 'raffle'
  name: t.text().notNull(), // event name: Entered, Paired, Settled, RoundOpened, Drawn, …
  args: t.json().notNull(), // decoded args; bigints as decimal strings
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
  logIndex: t.integer().notNull(),
}))
