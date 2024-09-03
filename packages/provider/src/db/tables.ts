import type { Knex } from 'knex'

export const tableNames = {
  seed: 'seed',
  preimage: 'preimage', // a location
  secret: 'secret', // a secret generated from a provided mnemonic
  // transaction: 'transaction', // relevant transaction data
  // block: 'block', // relevant block data (number, hash, mined_at)
  // event
  // ink: 'ink',
  // bleach: 'bleach',
  // expired: 'expired',
  // heat: 'heat',
  // start: 'start',
  // reveal: 'reveal',
  // cast: 'cast',
  // chop: 'chop',
  // // reader
  // ok: 'ok',
  // consumer
  // consumerReveal: 'consumer_reveal',
  // chain: 'chain',
  // undermine: 'undermine',
  // randomness providers, consumers, etc - hold data for reputation counts
  // participant: 'participant',
  // reputation: 'reputation',
} as const

const tn = Object.values(tableNames)

export type TableNames = typeof tn[number]

export type Tx = Knex | Knex.Transaction
