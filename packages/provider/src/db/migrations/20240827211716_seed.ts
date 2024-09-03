import type { Knex } from "knex";

import userConfig from '../../../config'
import { tableNames } from "../tables";

export async function up(knex: Knex): Promise<void> {
  const schema = knex.schema.withSchema(userConfig.database.schema)
  const exists = await schema.hasTable(tableNames.seed)
  if (!exists) {
    console.log('creating table %o', tableNames.seed)
    await schema.createTable(tableNames.seed, (t) => {
      t.text('seedId').primary()
    })
  }
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(userConfig.database.schema)
    .dropTableIfExists(tableNames.seed)
}

