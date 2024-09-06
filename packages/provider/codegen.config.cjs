fetch(process.env.INDEXER_URL)
  .then((r) => {
    if (r.ok) return r.text().then((res) => console.log(res))
    else {
      console.log(r)
    }
  })
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
