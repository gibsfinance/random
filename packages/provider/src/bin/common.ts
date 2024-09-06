import { db } from '../db'

let EXITCONDITION = false

const start = () => {
  function wait() {
    if (!EXITCONDITION)
      setTimeout(wait, 1000)
  }
  wait()
}

export const main = (run: () => Promise<void>) => (
  db.migrate.latest()
    .then(start)
    .then(() => run())
    .catch(console.error)
    .then(() => {
      EXITCONDITION = true
    })
    .then(() => db.destroy())
)
