import { db } from '../db'

export const main = (run: () => Promise<void>) => (
  db.migrate.latest()
    .then(() => run())
    .catch(console.error)
    .then(() => db.destroy())
)
