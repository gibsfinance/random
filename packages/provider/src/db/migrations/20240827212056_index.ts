import type { Knex } from "knex";

import userConfig from '../../../config'
import { tableNames } from "../tables";

export async function up(knex: Knex): Promise<void> {
  const schema = knex.schema.withSchema(userConfig.database.schema)
  const exists = await schema.hasTable(tableNames.secret)
  if (exists) {
    console.log('altering table %o', tableNames.secret)
    await schema.alterTable(tableNames.secret, (t) => {
      t.renameColumn('index', 'accountIndex')
      t.renameColumn('random', 'randomContractAddress')
      // the on chain index as detected by the indexer / submitted in the ink tx
      // t.decimal('locationIndex', 78, 0)
      t.dropColumn('inkIndexed')
      t.dropColumn('inkTransactionHash')
      t.text('inkTransactionId')
        .nullable()
        .references('transactionId')
        .inTable('transaction')
      // t.text('heatTransactionId')
      //   .nullable()
      //   .references('transactionId')
      //   .inTable('transaction')
      t.text('revealTransactionId')
        .nullable()
        .references('transactionId')
        .inTable('transaction')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(userConfig.database.schema)
    .alterTable(tableNames.secret, (t) => {
      t.dropColumn('revealTransactionId')
      t.dropColumn('inkTransactionId')
      // t.dropColumn('locationIndex')
      t.text('inkTransactionHash').nullable()
      t.renameColumn('randomContractAddress', 'random')
      t.renameColumn('accountIndex', 'index')
      t.boolean('inkIndexed').defaultTo(false).notNullable()
    })
}
