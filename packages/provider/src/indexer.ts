import * as gqlreq from 'graphql-request'
import config from '../config'
import { contracts } from './contracts'
import { chain } from './chain'
import { PointerFilter, PreimageFilter, Query } from './gql/graphql'
import * as viem from 'viem'

const { gql } = gqlreq

export const queries = {
  unlinkedSecrets: gql`query UnlinkedSecrets($preimageFilter: PreimageFilter!) {
    preimages(where: $preimageFilter) {
      items {
        data
        secret
        pointer {
          provider
          token
          duration
          durationIsTimestamp
          price
          offset
        }
        index
        heat {
          index
        }
        start {
          key
        }
      }
    }
  }`,
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
    pointers (where: $pointerFilter, orderBy: "offset", orderDirection: "asc") {
      items {
        provider
        price
        duration
        durationIsTimestamp
        token
        offset
        preimages(where: {
          accessed: true,
          revealId: null,
          castId: null
        }, limit: 1000) {
          items {
            data
            timestamp
            index
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
      ink {
        transaction {
          index
          block {
            number
          }
        }
      }
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
        index
      }
    }
  }`,
  getPointersUnder: gql`query GetLinksUnder($chainId: BigInt!, $address: String!, $provider: String!) {
    pointers(limit: 1000, where: {
      chainId: $chainId,
      address: $address,
      provider: $provider
    }, orderBy: "offset", orderDirection: "asc") {
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
        section
        template
        count
        offset
        ink {
          transaction {
            hash
          }
        }
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
  unlinkedSecrets: async (preimageFilter: PreimageFilter) => {
    return await client().request<Pick<Query, 'preimages'>>({
      document: queries.unlinkedSecrets,
      variables: { preimageFilter },
    })
  },
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
