const { env } = process

export default {
  database: {
    url: env.DATABASE_URL || 'postgres://random:password@localhost:9182/random',
    schema: env.DATABASE_SCHEMA || 'public',
    ssl: env.DATABASE_SSL === 'true',
  },
}
