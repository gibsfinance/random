console.log('process.env.INDEXER_URL=%o', process.env.INDEXER_URL)
module.exports = {
  // Specify the schema URL
  schema: process.env.INDEXER_URL,
  target: 'typescript',
  generates: {
    './src/gql/': {
      preset: 'client',
      plugins: [
        'typescript',
        'typescript-operations',
      ],
    },
  },
};
