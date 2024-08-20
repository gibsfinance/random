import _ from 'lodash'

import { Config, DeepPartial } from './src/types'
import exampleConfig from './example.config'

export default _.defaultsDeep(exampleConfig, {
  // write config params here to extend the baseline (example)
} as DeepPartial<Config>) as Config
