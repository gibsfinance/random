import * as gqlreq from 'graphql-request'
import config from '../config'
import { contracts } from './contracts'
import { chain } from './chain'
import { PointerFilter, PreimageFilter, Query, StartFilter } from './gql/graphql'
import * as viem from 'viem'

const { gql } = gqlreq

export const queries = {
  preimagesInStart: gql`query GetStartBatches ($preimageFilter: PreimageFilter!) {
    preimages(where: $preimageFilter) {
      items {
        heat {
          start {
            key
            castId
            chopped
            heat(orderBy: "index", orderDirection: "asc") {
              items {
                preimage {
                  data
                  index
                  pointer {
                    duration
                    durationIsTimestamp
                    price
                    token
                    provider
                    offset
                  }
                }
              }
            }
          }
        }
      }
    }
  }`,
  requestsForSecrets: gql`query GetRequestsForSecrets(
    $pointerFilter: PointerFilter!
  ) {
    pointers (where: $pointerFilter) {
      items {
        provider
        preimages(where: {
          accessed: true,
          revealId: null,
          castId: null
        }, limit: 100, orderBy: "timestamp", orderDirection: "asc") {
          items {
            data
            timestamp
            heat {
              index
              transaction {
                index
                block {
                  timestamp
                }
              }
            }
          }
        }
      }
    }
  }`,
  pointersOrderedBySelf: gql`query GetPreimagesOrderedBySelf(
    $pointerLimit: Int!,
    $pointerFilter: PointerFilter!,
    $preimageLimit: Int!,
    $preimageFilter: PreimageFilter!
  ) {
    pointers(where: $pointerFilter, limit: $pointerLimit) {
    items {
      provider
      token
      price
      duration
      durationIsTimestamp
      offset
      preimages(
        limit: $preimageLimit,
        where: $preimageFilter,
        orderBy: "data", orderDirection: "asc"
      ) {
        items {
          data
          index
        }
      }
    }
  }
}`,
  getConsumablePointers: gql`query getPointers($where: PointerFilter!) {
    pointers(where: $where, limit: 1000) {
      items {
        id
        token
        price
        duration
        durationIsTimestamp
      }
    }
  }`,
  getPreimages: gql`query GetPreimages($where: PreimageFilter!) {
    preimages(where: $where, limit: 1000) {
      items {
        data
        section
      }
    }
  }`,
  getPointersUnder: gql`query GetLinksUnder($chainId: BigInt!, $address: String!, $provider: String!) {
    pointers(limit: 1000, where: {
      chainId: $chainId,
      address: $address,
      provider: $provider
    }) {
      items {
        id
        remaining
        storage
        provider
        token
        price
        duration
        durationIsTimestamp
        offset
      }
    }
  }`
}

let c: null | gqlreq.GraphQLClient = null

const client = (): gqlreq.GraphQLClient => {
  if (c) return c
  c = new gqlreq.GraphQLClient(config.indexer.url!)
  return c
}

export const indexer = {
  unfinishedStarts: async (preimageFilter: PreimageFilter) => {
    return await client().request<Pick<Query, 'preimages'>>({
      document: queries.preimagesInStart,
      variables: {
        preimageFilter,
      },
    })
  },
  requestsForSecrets: async (pointerFilter: PointerFilter) => {
    return await client().request<Pick<Query, 'pointers'>>({
      document: queries.requestsForSecrets,
      variables: {
        pointerFilter,
      },
    })
  },
  pointersOrderedBySelf: async (variables: any) => {
    return await client().request<Pick<Query, 'pointers'>>({
      document: queries.pointersOrderedBySelf,
      variables,
    })
  },
  preimages: async (where: PreimageFilter) => {
    return await client().request<Pick<Query, 'preimages'>>({
      document: queries.getPreimages,
      variables: {
        where,
      },
    })
  },
  pointers: async (vars: {
    provider: viem.Hex
  }) => {
    return await client().request<Pick<Query, 'pointers'>>({
      document: queries.getPointersUnder,
      variables: {
        chainId: chain.id,
        address: contracts().random.address,
        ...vars,
      },
    })
  },
}
