import type { Knex } from "knex";

import userConfig from '../../../config'
import { tableNames } from "../tables";

export async function up(knex: Knex): Promise<void> {
  const schema = knex.schema.withSchema(userConfig.database.schema)
  const exists = await schema.hasTable(tableNames.secret)
  if (!exists) {
    console.log('creating table %o', tableNames.secret)
    await schema.createTable(tableNames.secret, (t) => {
      t.text('preimage').primary()
      t.decimal('index', 78, 0).index().unsigned().notNullable()
      t.text('seedId').references('seedId').inTable(tableNames.seed).notNullable()
      t.boolean('exposed').defaultTo(false)
      t.text('section').nullable()
      t.text('template').nullable()
      t.text('random').notNullable()
      t.decimal('chainId', 78, 0).unsigned().notNullable()
      t.text('inkTransactionHash').nullable()
      t.boolean('inkIndexed').notNullable()
    })
  }
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(userConfig.database.schema)
    .dropTableIfExists(tableNames.secret)
}

