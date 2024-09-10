import type { Knex } from "knex";

import userConfig from '../../../config'
import { tableNames } from "../tables";
import { compositeId } from "../utils";

const transactionId = compositeId(tableNames.transaction, 'transactionId', ['hash', 'chainId'])

export async function up(knex: Knex): Promise<void> {
  const schema = knex.schema.withSchema(userConfig.database.schema)
  const exists = await schema.hasTable(tableNames.transaction)
  if (!exists) {
    console.log('creating table %o', tableNames.transaction)
    await schema.createTable(tableNames.transaction, (t) => {
      t.text('transactionId').primary()
      t.text('hash').index().notNullable()
      t.bigint('chainId').index().notNullable()
      t.text('from').notNullable()
      t.text('to').notNullable()
      // only available after
      t.bigint('blockNumber').nullable().index()
      t.integer('transactionIndex').nullable().index()
    })
    await transactionId.up(knex)
  }
}

export async function down(knex: Knex): Promise<void> {
  await transactionId.down(knex)
  await knex.schema.withSchema(userConfig.database.schema)
    .dropTableIfExists(tableNames.transaction)
}
