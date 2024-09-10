import type { Knex } from "knex";

import userConfig from '../../../config'
import { tableNames } from "../tables";

export async function up(knex: Knex): Promise<void> {
  const schema = knex.schema.withSchema(userConfig.database.schema)
  const exists = await schema.hasTable(tableNames.transactionAction)
  if (!exists) {
    console.log('creating table %o', tableNames.transactionAction)
    await schema.createTable(tableNames.transactionAction, (t) => {
      // we can use incrementing because we do not need this to be deterministic
      t.bigIncrements('actionId').primary()
      t.text('type').notNullable()
      t.text('detail').nullable()
      t.text('transactionId')
        .references('transactionId')
        .inTable('transaction')
        .notNullable()
        .index()
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(userConfig.database.schema)
    .dropTableIfExists(tableNames.transactionAction)
}
