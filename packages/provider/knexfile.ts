import configuration from './config'
import { makeConfig } from './src/db/config'
console.log(configuration)
const config = makeConfig({
  connection: configuration.database.url,
})

const development = config
const production = config

export default {
  development,
  production,
}
