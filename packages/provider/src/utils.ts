import { name } from "./chain"
import { indexer } from "./indexer"

export const status = () => (
  indexer.status().then(({ _meta }) => (
    _meta?.status?.[name]?.ready
  ))
)
