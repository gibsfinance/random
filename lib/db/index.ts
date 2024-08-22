import knex from 'knex'
import * as conf from './config'

export const db = knex(conf.config)
