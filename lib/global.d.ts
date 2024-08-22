import { tableNames } from './db/tables'

declare module 'knex/types/tables' {
  interface Timestamped {
    createdAt: Date;
    updatedAt: Date;
  }
  type TimestampedKeys = keyof Timestamped

  interface Tables {
    [tableNames.provider]: Provider
  }
}
