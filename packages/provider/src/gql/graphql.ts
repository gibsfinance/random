/* eslint-disable */
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  BigInt: { input: any; output: any; }
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSON: { input: any; output: any; }
};

export type Bleach = {
  __typename?: 'Bleach';
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  pointer: Pointer;
  pointerId: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type BleachFilter = {
  AND?: InputMaybe<Array<InputMaybe<BleachFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<BleachFilter>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  pointerId?: InputMaybe<Scalars['String']['input']>;
  pointerId_gt?: InputMaybe<Scalars['String']['input']>;
  pointerId_gte?: InputMaybe<Scalars['String']['input']>;
  pointerId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  pointerId_lt?: InputMaybe<Scalars['String']['input']>;
  pointerId_lte?: InputMaybe<Scalars['String']['input']>;
  pointerId_not?: InputMaybe<Scalars['String']['input']>;
  pointerId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type BleachPage = {
  __typename?: 'BleachPage';
  items: Array<Bleach>;
  pageInfo: PageInfo;
};

export type Block = {
  __typename?: 'Block';
  hash: Scalars['String']['output'];
  id: Scalars['String']['output'];
  number: Scalars['BigInt']['output'];
  timestamp: Scalars['BigInt']['output'];
};

export type BlockFilter = {
  AND?: InputMaybe<Array<InputMaybe<BlockFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<BlockFilter>>>;
  hash?: InputMaybe<Scalars['String']['input']>;
  hash_gt?: InputMaybe<Scalars['String']['input']>;
  hash_gte?: InputMaybe<Scalars['String']['input']>;
  hash_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  hash_lt?: InputMaybe<Scalars['String']['input']>;
  hash_lte?: InputMaybe<Scalars['String']['input']>;
  hash_not?: InputMaybe<Scalars['String']['input']>;
  hash_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  number?: InputMaybe<Scalars['BigInt']['input']>;
  number_gt?: InputMaybe<Scalars['BigInt']['input']>;
  number_gte?: InputMaybe<Scalars['BigInt']['input']>;
  number_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  number_lt?: InputMaybe<Scalars['BigInt']['input']>;
  number_lte?: InputMaybe<Scalars['BigInt']['input']>;
  number_not?: InputMaybe<Scalars['BigInt']['input']>;
  number_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  timestamp?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  timestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
};

export type BlockPage = {
  __typename?: 'BlockPage';
  items: Array<Block>;
  pageInfo: PageInfo;
};

export type Cast = {
  __typename?: 'Cast';
  expired?: Maybe<Expired>;
  expiredId?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  key: Scalars['String']['output'];
  reveal?: Maybe<LinkPage>;
  seed?: Maybe<Scalars['String']['output']>;
  start: Start;
  startId: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};


export type CastRevealArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<LinkFilter>;
};

export type CastFilter = {
  AND?: InputMaybe<Array<InputMaybe<CastFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<CastFilter>>>;
  expiredId?: InputMaybe<Scalars['String']['input']>;
  expiredId_gt?: InputMaybe<Scalars['String']['input']>;
  expiredId_gte?: InputMaybe<Scalars['String']['input']>;
  expiredId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  expiredId_lt?: InputMaybe<Scalars['String']['input']>;
  expiredId_lte?: InputMaybe<Scalars['String']['input']>;
  expiredId_not?: InputMaybe<Scalars['String']['input']>;
  expiredId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  key?: InputMaybe<Scalars['String']['input']>;
  key_gt?: InputMaybe<Scalars['String']['input']>;
  key_gte?: InputMaybe<Scalars['String']['input']>;
  key_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  key_lt?: InputMaybe<Scalars['String']['input']>;
  key_lte?: InputMaybe<Scalars['String']['input']>;
  key_not?: InputMaybe<Scalars['String']['input']>;
  key_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  seed?: InputMaybe<Scalars['String']['input']>;
  seed_gt?: InputMaybe<Scalars['String']['input']>;
  seed_gte?: InputMaybe<Scalars['String']['input']>;
  seed_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  seed_lt?: InputMaybe<Scalars['String']['input']>;
  seed_lte?: InputMaybe<Scalars['String']['input']>;
  seed_not?: InputMaybe<Scalars['String']['input']>;
  seed_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId?: InputMaybe<Scalars['String']['input']>;
  startId_gt?: InputMaybe<Scalars['String']['input']>;
  startId_gte?: InputMaybe<Scalars['String']['input']>;
  startId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId_lt?: InputMaybe<Scalars['String']['input']>;
  startId_lte?: InputMaybe<Scalars['String']['input']>;
  startId_not?: InputMaybe<Scalars['String']['input']>;
  startId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type CastPage = {
  __typename?: 'CastPage';
  items: Array<Cast>;
  pageInfo: PageInfo;
};

export type Chain = {
  __typename?: 'Chain';
  consumerPreimage: ConsumerPreimage;
  consumerPreimageId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  identifier: Scalars['BigInt']['output'];
  owner: Scalars['String']['output'];
  start: Start;
  startId: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
  undermine: Undermine;
  undermineId: Scalars['String']['output'];
};

export type ChainFilter = {
  AND?: InputMaybe<Array<InputMaybe<ChainFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<ChainFilter>>>;
  consumerPreimageId?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_gt?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_gte?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  consumerPreimageId_lt?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_lte?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_not?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  identifier?: InputMaybe<Scalars['BigInt']['input']>;
  identifier_gt?: InputMaybe<Scalars['BigInt']['input']>;
  identifier_gte?: InputMaybe<Scalars['BigInt']['input']>;
  identifier_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  identifier_lt?: InputMaybe<Scalars['BigInt']['input']>;
  identifier_lte?: InputMaybe<Scalars['BigInt']['input']>;
  identifier_not?: InputMaybe<Scalars['BigInt']['input']>;
  identifier_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  owner?: InputMaybe<Scalars['String']['input']>;
  owner_gt?: InputMaybe<Scalars['String']['input']>;
  owner_gte?: InputMaybe<Scalars['String']['input']>;
  owner_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  owner_lt?: InputMaybe<Scalars['String']['input']>;
  owner_lte?: InputMaybe<Scalars['String']['input']>;
  owner_not?: InputMaybe<Scalars['String']['input']>;
  owner_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId?: InputMaybe<Scalars['String']['input']>;
  startId_gt?: InputMaybe<Scalars['String']['input']>;
  startId_gte?: InputMaybe<Scalars['String']['input']>;
  startId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId_lt?: InputMaybe<Scalars['String']['input']>;
  startId_lte?: InputMaybe<Scalars['String']['input']>;
  startId_not?: InputMaybe<Scalars['String']['input']>;
  startId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  undermineId?: InputMaybe<Scalars['String']['input']>;
  undermineId_gt?: InputMaybe<Scalars['String']['input']>;
  undermineId_gte?: InputMaybe<Scalars['String']['input']>;
  undermineId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  undermineId_lt?: InputMaybe<Scalars['String']['input']>;
  undermineId_lte?: InputMaybe<Scalars['String']['input']>;
  undermineId_not?: InputMaybe<Scalars['String']['input']>;
  undermineId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type ChainPage = {
  __typename?: 'ChainPage';
  items: Array<Chain>;
  pageInfo: PageInfo;
};

export type ConsumerPreimage = {
  __typename?: 'ConsumerPreimage';
  chain?: Maybe<Chain>;
  chainId?: Maybe<Scalars['String']['output']>;
  data: Scalars['String']['output'];
  id: Scalars['String']['output'];
  secret?: Maybe<Scalars['String']['output']>;
  undermine?: Maybe<Undermine>;
  undermineId?: Maybe<Scalars['String']['output']>;
  unveil?: Maybe<Unveil>;
  unveilId?: Maybe<Scalars['String']['output']>;
};

export type ConsumerPreimageFilter = {
  AND?: InputMaybe<Array<InputMaybe<ConsumerPreimageFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<ConsumerPreimageFilter>>>;
  chainId?: InputMaybe<Scalars['String']['input']>;
  chainId_gt?: InputMaybe<Scalars['String']['input']>;
  chainId_gte?: InputMaybe<Scalars['String']['input']>;
  chainId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  chainId_lt?: InputMaybe<Scalars['String']['input']>;
  chainId_lte?: InputMaybe<Scalars['String']['input']>;
  chainId_not?: InputMaybe<Scalars['String']['input']>;
  chainId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  data?: InputMaybe<Scalars['String']['input']>;
  data_gt?: InputMaybe<Scalars['String']['input']>;
  data_gte?: InputMaybe<Scalars['String']['input']>;
  data_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  data_lt?: InputMaybe<Scalars['String']['input']>;
  data_lte?: InputMaybe<Scalars['String']['input']>;
  data_not?: InputMaybe<Scalars['String']['input']>;
  data_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  secret?: InputMaybe<Scalars['String']['input']>;
  secret_gt?: InputMaybe<Scalars['String']['input']>;
  secret_gte?: InputMaybe<Scalars['String']['input']>;
  secret_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  secret_lt?: InputMaybe<Scalars['String']['input']>;
  secret_lte?: InputMaybe<Scalars['String']['input']>;
  secret_not?: InputMaybe<Scalars['String']['input']>;
  secret_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  undermineId?: InputMaybe<Scalars['String']['input']>;
  undermineId_gt?: InputMaybe<Scalars['String']['input']>;
  undermineId_gte?: InputMaybe<Scalars['String']['input']>;
  undermineId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  undermineId_lt?: InputMaybe<Scalars['String']['input']>;
  undermineId_lte?: InputMaybe<Scalars['String']['input']>;
  undermineId_not?: InputMaybe<Scalars['String']['input']>;
  undermineId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  unveilId?: InputMaybe<Scalars['String']['input']>;
  unveilId_gt?: InputMaybe<Scalars['String']['input']>;
  unveilId_gte?: InputMaybe<Scalars['String']['input']>;
  unveilId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  unveilId_lt?: InputMaybe<Scalars['String']['input']>;
  unveilId_lte?: InputMaybe<Scalars['String']['input']>;
  unveilId_not?: InputMaybe<Scalars['String']['input']>;
  unveilId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type ConsumerPreimagePage = {
  __typename?: 'ConsumerPreimagePage';
  items: Array<ConsumerPreimage>;
  pageInfo: PageInfo;
};

export type Expired = {
  __typename?: 'Expired';
  cast: Cast;
  castId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  start: Start;
  startId: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type ExpiredFilter = {
  AND?: InputMaybe<Array<InputMaybe<ExpiredFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<ExpiredFilter>>>;
  castId?: InputMaybe<Scalars['String']['input']>;
  castId_gt?: InputMaybe<Scalars['String']['input']>;
  castId_gte?: InputMaybe<Scalars['String']['input']>;
  castId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  castId_lt?: InputMaybe<Scalars['String']['input']>;
  castId_lte?: InputMaybe<Scalars['String']['input']>;
  castId_not?: InputMaybe<Scalars['String']['input']>;
  castId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  startId?: InputMaybe<Scalars['String']['input']>;
  startId_gt?: InputMaybe<Scalars['String']['input']>;
  startId_gte?: InputMaybe<Scalars['String']['input']>;
  startId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId_lt?: InputMaybe<Scalars['String']['input']>;
  startId_lte?: InputMaybe<Scalars['String']['input']>;
  startId_not?: InputMaybe<Scalars['String']['input']>;
  startId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type ExpiredPage = {
  __typename?: 'ExpiredPage';
  items: Array<Expired>;
  pageInfo: PageInfo;
};

export type Heat = {
  __typename?: 'Heat';
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  preimage: Preimage;
  preimageId: Scalars['String']['output'];
  start?: Maybe<Start>;
  startId?: Maybe<Scalars['String']['output']>;
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type HeatFilter = {
  AND?: InputMaybe<Array<InputMaybe<HeatFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<HeatFilter>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  preimageId?: InputMaybe<Scalars['String']['input']>;
  preimageId_gt?: InputMaybe<Scalars['String']['input']>;
  preimageId_gte?: InputMaybe<Scalars['String']['input']>;
  preimageId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  preimageId_lt?: InputMaybe<Scalars['String']['input']>;
  preimageId_lte?: InputMaybe<Scalars['String']['input']>;
  preimageId_not?: InputMaybe<Scalars['String']['input']>;
  preimageId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId?: InputMaybe<Scalars['String']['input']>;
  startId_gt?: InputMaybe<Scalars['String']['input']>;
  startId_gte?: InputMaybe<Scalars['String']['input']>;
  startId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId_lt?: InputMaybe<Scalars['String']['input']>;
  startId_lte?: InputMaybe<Scalars['String']['input']>;
  startId_not?: InputMaybe<Scalars['String']['input']>;
  startId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type HeatPage = {
  __typename?: 'HeatPage';
  items: Array<Heat>;
  pageInfo: PageInfo;
};

export type Ink = {
  __typename?: 'Ink';
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  pointer: Pointer;
  pointerId: Scalars['String']['output'];
  section: Scalars['String']['output'];
  sender: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type InkFilter = {
  AND?: InputMaybe<Array<InputMaybe<InkFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<InkFilter>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  pointerId?: InputMaybe<Scalars['String']['input']>;
  pointerId_gt?: InputMaybe<Scalars['String']['input']>;
  pointerId_gte?: InputMaybe<Scalars['String']['input']>;
  pointerId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  pointerId_lt?: InputMaybe<Scalars['String']['input']>;
  pointerId_lte?: InputMaybe<Scalars['String']['input']>;
  pointerId_not?: InputMaybe<Scalars['String']['input']>;
  pointerId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  section?: InputMaybe<Scalars['String']['input']>;
  section_gt?: InputMaybe<Scalars['String']['input']>;
  section_gte?: InputMaybe<Scalars['String']['input']>;
  section_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  section_lt?: InputMaybe<Scalars['String']['input']>;
  section_lte?: InputMaybe<Scalars['String']['input']>;
  section_not?: InputMaybe<Scalars['String']['input']>;
  section_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  sender?: InputMaybe<Scalars['String']['input']>;
  sender_gt?: InputMaybe<Scalars['String']['input']>;
  sender_gte?: InputMaybe<Scalars['String']['input']>;
  sender_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  sender_lt?: InputMaybe<Scalars['String']['input']>;
  sender_lte?: InputMaybe<Scalars['String']['input']>;
  sender_not?: InputMaybe<Scalars['String']['input']>;
  sender_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type InkPage = {
  __typename?: 'InkPage';
  items: Array<Ink>;
  pageInfo: PageInfo;
};

export type Link = {
  __typename?: 'Link';
  cast?: Maybe<Cast>;
  castId?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  preimage: Preimage;
  preimageId: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type LinkFilter = {
  AND?: InputMaybe<Array<InputMaybe<LinkFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<LinkFilter>>>;
  castId?: InputMaybe<Scalars['String']['input']>;
  castId_gt?: InputMaybe<Scalars['String']['input']>;
  castId_gte?: InputMaybe<Scalars['String']['input']>;
  castId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  castId_lt?: InputMaybe<Scalars['String']['input']>;
  castId_lte?: InputMaybe<Scalars['String']['input']>;
  castId_not?: InputMaybe<Scalars['String']['input']>;
  castId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  preimageId?: InputMaybe<Scalars['String']['input']>;
  preimageId_gt?: InputMaybe<Scalars['String']['input']>;
  preimageId_gte?: InputMaybe<Scalars['String']['input']>;
  preimageId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  preimageId_lt?: InputMaybe<Scalars['String']['input']>;
  preimageId_lte?: InputMaybe<Scalars['String']['input']>;
  preimageId_not?: InputMaybe<Scalars['String']['input']>;
  preimageId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type LinkPage = {
  __typename?: 'LinkPage';
  items: Array<Link>;
  pageInfo: PageInfo;
};

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type Pointer = {
  __typename?: 'Pointer';
  address: Scalars['String']['output'];
  bleach?: Maybe<Bleach>;
  bleachId?: Maybe<Scalars['String']['output']>;
  chainId: Scalars['BigInt']['output'];
  count: Scalars['Int']['output'];
  duration: Scalars['BigInt']['output'];
  durationIsTimestamp: Scalars['Boolean']['output'];
  id: Scalars['String']['output'];
  ink: Ink;
  inkId: Scalars['String']['output'];
  lastOkTransaction: Transaction;
  lastOkTransactionId: Scalars['String']['output'];
  offset: Scalars['BigInt']['output'];
  preimages?: Maybe<PreimagePage>;
  price: Scalars['BigInt']['output'];
  provider: Scalars['String']['output'];
  remaining: Scalars['Int']['output'];
  section: Scalars['String']['output'];
  storage: Scalars['String']['output'];
  template: Scalars['String']['output'];
  token: Scalars['String']['output'];
};


export type PointerPreimagesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<PreimageFilter>;
};

export type PointerFilter = {
  AND?: InputMaybe<Array<InputMaybe<PointerFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<PointerFilter>>>;
  address?: InputMaybe<Scalars['String']['input']>;
  address_gt?: InputMaybe<Scalars['String']['input']>;
  address_gte?: InputMaybe<Scalars['String']['input']>;
  address_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  address_lt?: InputMaybe<Scalars['String']['input']>;
  address_lte?: InputMaybe<Scalars['String']['input']>;
  address_not?: InputMaybe<Scalars['String']['input']>;
  address_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  bleachId?: InputMaybe<Scalars['String']['input']>;
  bleachId_gt?: InputMaybe<Scalars['String']['input']>;
  bleachId_gte?: InputMaybe<Scalars['String']['input']>;
  bleachId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  bleachId_lt?: InputMaybe<Scalars['String']['input']>;
  bleachId_lte?: InputMaybe<Scalars['String']['input']>;
  bleachId_not?: InputMaybe<Scalars['String']['input']>;
  bleachId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  chainId?: InputMaybe<Scalars['BigInt']['input']>;
  chainId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  chainId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  chainId_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  chainId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  chainId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  chainId_not?: InputMaybe<Scalars['BigInt']['input']>;
  chainId_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  count?: InputMaybe<Scalars['Int']['input']>;
  count_gt?: InputMaybe<Scalars['Int']['input']>;
  count_gte?: InputMaybe<Scalars['Int']['input']>;
  count_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  count_lt?: InputMaybe<Scalars['Int']['input']>;
  count_lte?: InputMaybe<Scalars['Int']['input']>;
  count_not?: InputMaybe<Scalars['Int']['input']>;
  count_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  duration?: InputMaybe<Scalars['BigInt']['input']>;
  durationIsTimestamp?: InputMaybe<Scalars['Boolean']['input']>;
  durationIsTimestamp_in?: InputMaybe<Array<InputMaybe<Scalars['Boolean']['input']>>>;
  durationIsTimestamp_not?: InputMaybe<Scalars['Boolean']['input']>;
  durationIsTimestamp_not_in?: InputMaybe<Array<InputMaybe<Scalars['Boolean']['input']>>>;
  duration_gt?: InputMaybe<Scalars['BigInt']['input']>;
  duration_gte?: InputMaybe<Scalars['BigInt']['input']>;
  duration_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  duration_lt?: InputMaybe<Scalars['BigInt']['input']>;
  duration_lte?: InputMaybe<Scalars['BigInt']['input']>;
  duration_not?: InputMaybe<Scalars['BigInt']['input']>;
  duration_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  inkId?: InputMaybe<Scalars['String']['input']>;
  inkId_gt?: InputMaybe<Scalars['String']['input']>;
  inkId_gte?: InputMaybe<Scalars['String']['input']>;
  inkId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  inkId_lt?: InputMaybe<Scalars['String']['input']>;
  inkId_lte?: InputMaybe<Scalars['String']['input']>;
  inkId_not?: InputMaybe<Scalars['String']['input']>;
  inkId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  lastOkTransactionId?: InputMaybe<Scalars['String']['input']>;
  lastOkTransactionId_gt?: InputMaybe<Scalars['String']['input']>;
  lastOkTransactionId_gte?: InputMaybe<Scalars['String']['input']>;
  lastOkTransactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  lastOkTransactionId_lt?: InputMaybe<Scalars['String']['input']>;
  lastOkTransactionId_lte?: InputMaybe<Scalars['String']['input']>;
  lastOkTransactionId_not?: InputMaybe<Scalars['String']['input']>;
  lastOkTransactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  offset?: InputMaybe<Scalars['BigInt']['input']>;
  offset_gt?: InputMaybe<Scalars['BigInt']['input']>;
  offset_gte?: InputMaybe<Scalars['BigInt']['input']>;
  offset_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  offset_lt?: InputMaybe<Scalars['BigInt']['input']>;
  offset_lte?: InputMaybe<Scalars['BigInt']['input']>;
  offset_not?: InputMaybe<Scalars['BigInt']['input']>;
  offset_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  price?: InputMaybe<Scalars['BigInt']['input']>;
  price_gt?: InputMaybe<Scalars['BigInt']['input']>;
  price_gte?: InputMaybe<Scalars['BigInt']['input']>;
  price_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  price_lt?: InputMaybe<Scalars['BigInt']['input']>;
  price_lte?: InputMaybe<Scalars['BigInt']['input']>;
  price_not?: InputMaybe<Scalars['BigInt']['input']>;
  price_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  provider?: InputMaybe<Scalars['String']['input']>;
  provider_gt?: InputMaybe<Scalars['String']['input']>;
  provider_gte?: InputMaybe<Scalars['String']['input']>;
  provider_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  provider_lt?: InputMaybe<Scalars['String']['input']>;
  provider_lte?: InputMaybe<Scalars['String']['input']>;
  provider_not?: InputMaybe<Scalars['String']['input']>;
  provider_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  remaining?: InputMaybe<Scalars['Int']['input']>;
  remaining_gt?: InputMaybe<Scalars['Int']['input']>;
  remaining_gte?: InputMaybe<Scalars['Int']['input']>;
  remaining_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  remaining_lt?: InputMaybe<Scalars['Int']['input']>;
  remaining_lte?: InputMaybe<Scalars['Int']['input']>;
  remaining_not?: InputMaybe<Scalars['Int']['input']>;
  remaining_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  section?: InputMaybe<Scalars['String']['input']>;
  section_gt?: InputMaybe<Scalars['String']['input']>;
  section_gte?: InputMaybe<Scalars['String']['input']>;
  section_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  section_lt?: InputMaybe<Scalars['String']['input']>;
  section_lte?: InputMaybe<Scalars['String']['input']>;
  section_not?: InputMaybe<Scalars['String']['input']>;
  section_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  storage?: InputMaybe<Scalars['String']['input']>;
  storage_gt?: InputMaybe<Scalars['String']['input']>;
  storage_gte?: InputMaybe<Scalars['String']['input']>;
  storage_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  storage_lt?: InputMaybe<Scalars['String']['input']>;
  storage_lte?: InputMaybe<Scalars['String']['input']>;
  storage_not?: InputMaybe<Scalars['String']['input']>;
  storage_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  template?: InputMaybe<Scalars['String']['input']>;
  template_gt?: InputMaybe<Scalars['String']['input']>;
  template_gte?: InputMaybe<Scalars['String']['input']>;
  template_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  template_lt?: InputMaybe<Scalars['String']['input']>;
  template_lte?: InputMaybe<Scalars['String']['input']>;
  template_not?: InputMaybe<Scalars['String']['input']>;
  template_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  token?: InputMaybe<Scalars['String']['input']>;
  token_gt?: InputMaybe<Scalars['String']['input']>;
  token_gte?: InputMaybe<Scalars['String']['input']>;
  token_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  token_lt?: InputMaybe<Scalars['String']['input']>;
  token_lte?: InputMaybe<Scalars['String']['input']>;
  token_not?: InputMaybe<Scalars['String']['input']>;
  token_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type PointerPage = {
  __typename?: 'PointerPage';
  items: Array<Pointer>;
  pageInfo: PageInfo;
};

export type Preimage = {
  __typename?: 'Preimage';
  accessed: Scalars['Boolean']['output'];
  cast?: Maybe<Cast>;
  castId?: Maybe<Scalars['String']['output']>;
  data: Scalars['String']['output'];
  heat?: Maybe<Heat>;
  heatId?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  link?: Maybe<Link>;
  linkId?: Maybe<Scalars['String']['output']>;
  pointer: Pointer;
  pointerId: Scalars['String']['output'];
  reveal?: Maybe<Reveal>;
  revealId?: Maybe<Scalars['String']['output']>;
  secret?: Maybe<Scalars['String']['output']>;
  section: Scalars['String']['output'];
  start?: Maybe<Start>;
  startId?: Maybe<Scalars['String']['output']>;
  template: Scalars['String']['output'];
  timestamp?: Maybe<Scalars['BigInt']['output']>;
};

export type PreimageFilter = {
  AND?: InputMaybe<Array<InputMaybe<PreimageFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<PreimageFilter>>>;
  accessed?: InputMaybe<Scalars['Boolean']['input']>;
  accessed_in?: InputMaybe<Array<InputMaybe<Scalars['Boolean']['input']>>>;
  accessed_not?: InputMaybe<Scalars['Boolean']['input']>;
  accessed_not_in?: InputMaybe<Array<InputMaybe<Scalars['Boolean']['input']>>>;
  castId?: InputMaybe<Scalars['String']['input']>;
  castId_gt?: InputMaybe<Scalars['String']['input']>;
  castId_gte?: InputMaybe<Scalars['String']['input']>;
  castId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  castId_lt?: InputMaybe<Scalars['String']['input']>;
  castId_lte?: InputMaybe<Scalars['String']['input']>;
  castId_not?: InputMaybe<Scalars['String']['input']>;
  castId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  data?: InputMaybe<Scalars['String']['input']>;
  data_gt?: InputMaybe<Scalars['String']['input']>;
  data_gte?: InputMaybe<Scalars['String']['input']>;
  data_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  data_lt?: InputMaybe<Scalars['String']['input']>;
  data_lte?: InputMaybe<Scalars['String']['input']>;
  data_not?: InputMaybe<Scalars['String']['input']>;
  data_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  heatId?: InputMaybe<Scalars['String']['input']>;
  heatId_gt?: InputMaybe<Scalars['String']['input']>;
  heatId_gte?: InputMaybe<Scalars['String']['input']>;
  heatId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  heatId_lt?: InputMaybe<Scalars['String']['input']>;
  heatId_lte?: InputMaybe<Scalars['String']['input']>;
  heatId_not?: InputMaybe<Scalars['String']['input']>;
  heatId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  linkId?: InputMaybe<Scalars['String']['input']>;
  linkId_gt?: InputMaybe<Scalars['String']['input']>;
  linkId_gte?: InputMaybe<Scalars['String']['input']>;
  linkId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  linkId_lt?: InputMaybe<Scalars['String']['input']>;
  linkId_lte?: InputMaybe<Scalars['String']['input']>;
  linkId_not?: InputMaybe<Scalars['String']['input']>;
  linkId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  pointerId?: InputMaybe<Scalars['String']['input']>;
  pointerId_gt?: InputMaybe<Scalars['String']['input']>;
  pointerId_gte?: InputMaybe<Scalars['String']['input']>;
  pointerId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  pointerId_lt?: InputMaybe<Scalars['String']['input']>;
  pointerId_lte?: InputMaybe<Scalars['String']['input']>;
  pointerId_not?: InputMaybe<Scalars['String']['input']>;
  pointerId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  revealId?: InputMaybe<Scalars['String']['input']>;
  revealId_gt?: InputMaybe<Scalars['String']['input']>;
  revealId_gte?: InputMaybe<Scalars['String']['input']>;
  revealId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  revealId_lt?: InputMaybe<Scalars['String']['input']>;
  revealId_lte?: InputMaybe<Scalars['String']['input']>;
  revealId_not?: InputMaybe<Scalars['String']['input']>;
  revealId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  secret?: InputMaybe<Scalars['String']['input']>;
  secret_gt?: InputMaybe<Scalars['String']['input']>;
  secret_gte?: InputMaybe<Scalars['String']['input']>;
  secret_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  secret_lt?: InputMaybe<Scalars['String']['input']>;
  secret_lte?: InputMaybe<Scalars['String']['input']>;
  secret_not?: InputMaybe<Scalars['String']['input']>;
  secret_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  section?: InputMaybe<Scalars['String']['input']>;
  section_gt?: InputMaybe<Scalars['String']['input']>;
  section_gte?: InputMaybe<Scalars['String']['input']>;
  section_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  section_lt?: InputMaybe<Scalars['String']['input']>;
  section_lte?: InputMaybe<Scalars['String']['input']>;
  section_not?: InputMaybe<Scalars['String']['input']>;
  section_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId?: InputMaybe<Scalars['String']['input']>;
  startId_gt?: InputMaybe<Scalars['String']['input']>;
  startId_gte?: InputMaybe<Scalars['String']['input']>;
  startId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId_lt?: InputMaybe<Scalars['String']['input']>;
  startId_lte?: InputMaybe<Scalars['String']['input']>;
  startId_not?: InputMaybe<Scalars['String']['input']>;
  startId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  template?: InputMaybe<Scalars['String']['input']>;
  template_gt?: InputMaybe<Scalars['String']['input']>;
  template_gte?: InputMaybe<Scalars['String']['input']>;
  template_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  template_lt?: InputMaybe<Scalars['String']['input']>;
  template_lte?: InputMaybe<Scalars['String']['input']>;
  template_not?: InputMaybe<Scalars['String']['input']>;
  template_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  timestamp?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  timestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
};

export type PreimagePage = {
  __typename?: 'PreimagePage';
  items: Array<Preimage>;
  pageInfo: PageInfo;
};

export type Query = {
  __typename?: 'Query';
  _meta?: Maybe<_Meta>;
  bleach?: Maybe<Bleach>;
  bleachs: BleachPage;
  block?: Maybe<Block>;
  blocks: BlockPage;
  cast?: Maybe<Cast>;
  casts: CastPage;
  chain?: Maybe<Chain>;
  chains: ChainPage;
  consumerPreimage?: Maybe<ConsumerPreimage>;
  consumerPreimages: ConsumerPreimagePage;
  expired?: Maybe<Expired>;
  expireds: ExpiredPage;
  heat?: Maybe<Heat>;
  heats: HeatPage;
  ink?: Maybe<Ink>;
  inks: InkPage;
  link?: Maybe<Link>;
  links: LinkPage;
  pointer?: Maybe<Pointer>;
  pointers: PointerPage;
  preimage?: Maybe<Preimage>;
  preimages: PreimagePage;
  reveal?: Maybe<Reveal>;
  reveals: RevealPage;
  start?: Maybe<Start>;
  starts: StartPage;
  transaction?: Maybe<Transaction>;
  transactions: TransactionPage;
  undermine?: Maybe<Undermine>;
  undermines: UnderminePage;
  unveil?: Maybe<Unveil>;
  unveils: UnveilPage;
};


export type QueryBleachArgs = {
  id: Scalars['String']['input'];
};


export type QueryBleachsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<BleachFilter>;
};


export type QueryBlockArgs = {
  id: Scalars['String']['input'];
};


export type QueryBlocksArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<BlockFilter>;
};


export type QueryCastArgs = {
  id: Scalars['String']['input'];
};


export type QueryCastsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<CastFilter>;
};


export type QueryChainArgs = {
  id: Scalars['String']['input'];
};


export type QueryChainsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<ChainFilter>;
};


export type QueryConsumerPreimageArgs = {
  id: Scalars['String']['input'];
};


export type QueryConsumerPreimagesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<ConsumerPreimageFilter>;
};


export type QueryExpiredArgs = {
  id: Scalars['String']['input'];
};


export type QueryExpiredsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<ExpiredFilter>;
};


export type QueryHeatArgs = {
  id: Scalars['String']['input'];
};


export type QueryHeatsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<HeatFilter>;
};


export type QueryInkArgs = {
  id: Scalars['String']['input'];
};


export type QueryInksArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<InkFilter>;
};


export type QueryLinkArgs = {
  id: Scalars['String']['input'];
};


export type QueryLinksArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<LinkFilter>;
};


export type QueryPointerArgs = {
  id: Scalars['String']['input'];
};


export type QueryPointersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<PointerFilter>;
};


export type QueryPreimageArgs = {
  id: Scalars['String']['input'];
};


export type QueryPreimagesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<PreimageFilter>;
};


export type QueryRevealArgs = {
  id: Scalars['String']['input'];
};


export type QueryRevealsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<RevealFilter>;
};


export type QueryStartArgs = {
  id: Scalars['String']['input'];
};


export type QueryStartsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<StartFilter>;
};


export type QueryTransactionArgs = {
  id: Scalars['String']['input'];
};


export type QueryTransactionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<TransactionFilter>;
};


export type QueryUndermineArgs = {
  id: Scalars['String']['input'];
};


export type QueryUnderminesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<UndermineFilter>;
};


export type QueryUnveilArgs = {
  id: Scalars['String']['input'];
};


export type QueryUnveilsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<UnveilFilter>;
};

export type Reveal = {
  __typename?: 'Reveal';
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  preimage: Preimage;
  preimageId: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type RevealFilter = {
  AND?: InputMaybe<Array<InputMaybe<RevealFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<RevealFilter>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  preimageId?: InputMaybe<Scalars['String']['input']>;
  preimageId_gt?: InputMaybe<Scalars['String']['input']>;
  preimageId_gte?: InputMaybe<Scalars['String']['input']>;
  preimageId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  preimageId_lt?: InputMaybe<Scalars['String']['input']>;
  preimageId_lte?: InputMaybe<Scalars['String']['input']>;
  preimageId_not?: InputMaybe<Scalars['String']['input']>;
  preimageId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type RevealPage = {
  __typename?: 'RevealPage';
  items: Array<Reveal>;
  pageInfo: PageInfo;
};

export type Start = {
  __typename?: 'Start';
  cast?: Maybe<Cast>;
  castId?: Maybe<Scalars['String']['output']>;
  chopped: Scalars['Boolean']['output'];
  expired?: Maybe<Expired>;
  expiredId?: Maybe<Scalars['String']['output']>;
  heat?: Maybe<HeatPage>;
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  key: Scalars['String']['output'];
  owner: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};


export type StartHeatArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<HeatFilter>;
};

export type StartFilter = {
  AND?: InputMaybe<Array<InputMaybe<StartFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<StartFilter>>>;
  castId?: InputMaybe<Scalars['String']['input']>;
  castId_gt?: InputMaybe<Scalars['String']['input']>;
  castId_gte?: InputMaybe<Scalars['String']['input']>;
  castId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  castId_lt?: InputMaybe<Scalars['String']['input']>;
  castId_lte?: InputMaybe<Scalars['String']['input']>;
  castId_not?: InputMaybe<Scalars['String']['input']>;
  castId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  chopped?: InputMaybe<Scalars['Boolean']['input']>;
  chopped_in?: InputMaybe<Array<InputMaybe<Scalars['Boolean']['input']>>>;
  chopped_not?: InputMaybe<Scalars['Boolean']['input']>;
  chopped_not_in?: InputMaybe<Array<InputMaybe<Scalars['Boolean']['input']>>>;
  expiredId?: InputMaybe<Scalars['String']['input']>;
  expiredId_gt?: InputMaybe<Scalars['String']['input']>;
  expiredId_gte?: InputMaybe<Scalars['String']['input']>;
  expiredId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  expiredId_lt?: InputMaybe<Scalars['String']['input']>;
  expiredId_lte?: InputMaybe<Scalars['String']['input']>;
  expiredId_not?: InputMaybe<Scalars['String']['input']>;
  expiredId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  key?: InputMaybe<Scalars['String']['input']>;
  key_gt?: InputMaybe<Scalars['String']['input']>;
  key_gte?: InputMaybe<Scalars['String']['input']>;
  key_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  key_lt?: InputMaybe<Scalars['String']['input']>;
  key_lte?: InputMaybe<Scalars['String']['input']>;
  key_not?: InputMaybe<Scalars['String']['input']>;
  key_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  owner?: InputMaybe<Scalars['String']['input']>;
  owner_gt?: InputMaybe<Scalars['String']['input']>;
  owner_gte?: InputMaybe<Scalars['String']['input']>;
  owner_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  owner_lt?: InputMaybe<Scalars['String']['input']>;
  owner_lte?: InputMaybe<Scalars['String']['input']>;
  owner_not?: InputMaybe<Scalars['String']['input']>;
  owner_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type StartPage = {
  __typename?: 'StartPage';
  items: Array<Start>;
  pageInfo: PageInfo;
};

export type Transaction = {
  __typename?: 'Transaction';
  block: Block;
  blockId: Scalars['String']['output'];
  hash: Scalars['String']['output'];
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
};

export type TransactionFilter = {
  AND?: InputMaybe<Array<InputMaybe<TransactionFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<TransactionFilter>>>;
  blockId?: InputMaybe<Scalars['String']['input']>;
  blockId_gt?: InputMaybe<Scalars['String']['input']>;
  blockId_gte?: InputMaybe<Scalars['String']['input']>;
  blockId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  blockId_lt?: InputMaybe<Scalars['String']['input']>;
  blockId_lte?: InputMaybe<Scalars['String']['input']>;
  blockId_not?: InputMaybe<Scalars['String']['input']>;
  blockId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  hash?: InputMaybe<Scalars['String']['input']>;
  hash_gt?: InputMaybe<Scalars['String']['input']>;
  hash_gte?: InputMaybe<Scalars['String']['input']>;
  hash_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  hash_lt?: InputMaybe<Scalars['String']['input']>;
  hash_lte?: InputMaybe<Scalars['String']['input']>;
  hash_not?: InputMaybe<Scalars['String']['input']>;
  hash_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
};

export type TransactionPage = {
  __typename?: 'TransactionPage';
  items: Array<Transaction>;
  pageInfo: PageInfo;
};

export type Undermine = {
  __typename?: 'Undermine';
  chain: Chain;
  chainId: Scalars['String']['output'];
  consumerPreimage: ConsumerPreimage;
  consumerPreimageId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  owner: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type UndermineFilter = {
  AND?: InputMaybe<Array<InputMaybe<UndermineFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<UndermineFilter>>>;
  chainId?: InputMaybe<Scalars['String']['input']>;
  chainId_gt?: InputMaybe<Scalars['String']['input']>;
  chainId_gte?: InputMaybe<Scalars['String']['input']>;
  chainId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  chainId_lt?: InputMaybe<Scalars['String']['input']>;
  chainId_lte?: InputMaybe<Scalars['String']['input']>;
  chainId_not?: InputMaybe<Scalars['String']['input']>;
  chainId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  consumerPreimageId?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_gt?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_gte?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  consumerPreimageId_lt?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_lte?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_not?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  owner?: InputMaybe<Scalars['String']['input']>;
  owner_gt?: InputMaybe<Scalars['String']['input']>;
  owner_gte?: InputMaybe<Scalars['String']['input']>;
  owner_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  owner_lt?: InputMaybe<Scalars['String']['input']>;
  owner_lte?: InputMaybe<Scalars['String']['input']>;
  owner_not?: InputMaybe<Scalars['String']['input']>;
  owner_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type UnderminePage = {
  __typename?: 'UnderminePage';
  items: Array<Undermine>;
  pageInfo: PageInfo;
};

export type Unveil = {
  __typename?: 'Unveil';
  consumerPreimage: ConsumerPreimage;
  consumerPreimageId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type UnveilFilter = {
  AND?: InputMaybe<Array<InputMaybe<UnveilFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<UnveilFilter>>>;
  consumerPreimageId?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_gt?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_gte?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  consumerPreimageId_lt?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_lte?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_not?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type UnveilPage = {
  __typename?: 'UnveilPage';
  items: Array<Unveil>;
  pageInfo: PageInfo;
};

export type _Meta = {
  __typename?: '_meta';
  status?: Maybe<Scalars['JSON']['output']>;
};

/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  BigInt: { input: any; output: any; }
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSON: { input: any; output: any; }
};

export type Bleach = {
  __typename?: 'Bleach';
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  pointer: Pointer;
  pointerId: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type BleachFilter = {
  AND?: InputMaybe<Array<InputMaybe<BleachFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<BleachFilter>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  pointerId?: InputMaybe<Scalars['String']['input']>;
  pointerId_gt?: InputMaybe<Scalars['String']['input']>;
  pointerId_gte?: InputMaybe<Scalars['String']['input']>;
  pointerId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  pointerId_lt?: InputMaybe<Scalars['String']['input']>;
  pointerId_lte?: InputMaybe<Scalars['String']['input']>;
  pointerId_not?: InputMaybe<Scalars['String']['input']>;
  pointerId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type BleachPage = {
  __typename?: 'BleachPage';
  items: Array<Bleach>;
  pageInfo: PageInfo;
};

export type Block = {
  __typename?: 'Block';
  hash: Scalars['String']['output'];
  id: Scalars['String']['output'];
  number: Scalars['BigInt']['output'];
  timestamp: Scalars['BigInt']['output'];
};

export type BlockFilter = {
  AND?: InputMaybe<Array<InputMaybe<BlockFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<BlockFilter>>>;
  hash?: InputMaybe<Scalars['String']['input']>;
  hash_gt?: InputMaybe<Scalars['String']['input']>;
  hash_gte?: InputMaybe<Scalars['String']['input']>;
  hash_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  hash_lt?: InputMaybe<Scalars['String']['input']>;
  hash_lte?: InputMaybe<Scalars['String']['input']>;
  hash_not?: InputMaybe<Scalars['String']['input']>;
  hash_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  number?: InputMaybe<Scalars['BigInt']['input']>;
  number_gt?: InputMaybe<Scalars['BigInt']['input']>;
  number_gte?: InputMaybe<Scalars['BigInt']['input']>;
  number_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  number_lt?: InputMaybe<Scalars['BigInt']['input']>;
  number_lte?: InputMaybe<Scalars['BigInt']['input']>;
  number_not?: InputMaybe<Scalars['BigInt']['input']>;
  number_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  timestamp?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  timestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
};

export type BlockPage = {
  __typename?: 'BlockPage';
  items: Array<Block>;
  pageInfo: PageInfo;
};

export type Cast = {
  __typename?: 'Cast';
  expired?: Maybe<Expired>;
  expiredId?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  key: Scalars['String']['output'];
  reveal?: Maybe<LinkPage>;
  seed?: Maybe<Scalars['String']['output']>;
  start: Start;
  startId: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};


export type CastRevealArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<LinkFilter>;
};

export type CastFilter = {
  AND?: InputMaybe<Array<InputMaybe<CastFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<CastFilter>>>;
  expiredId?: InputMaybe<Scalars['String']['input']>;
  expiredId_gt?: InputMaybe<Scalars['String']['input']>;
  expiredId_gte?: InputMaybe<Scalars['String']['input']>;
  expiredId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  expiredId_lt?: InputMaybe<Scalars['String']['input']>;
  expiredId_lte?: InputMaybe<Scalars['String']['input']>;
  expiredId_not?: InputMaybe<Scalars['String']['input']>;
  expiredId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  key?: InputMaybe<Scalars['String']['input']>;
  key_gt?: InputMaybe<Scalars['String']['input']>;
  key_gte?: InputMaybe<Scalars['String']['input']>;
  key_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  key_lt?: InputMaybe<Scalars['String']['input']>;
  key_lte?: InputMaybe<Scalars['String']['input']>;
  key_not?: InputMaybe<Scalars['String']['input']>;
  key_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  seed?: InputMaybe<Scalars['String']['input']>;
  seed_gt?: InputMaybe<Scalars['String']['input']>;
  seed_gte?: InputMaybe<Scalars['String']['input']>;
  seed_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  seed_lt?: InputMaybe<Scalars['String']['input']>;
  seed_lte?: InputMaybe<Scalars['String']['input']>;
  seed_not?: InputMaybe<Scalars['String']['input']>;
  seed_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId?: InputMaybe<Scalars['String']['input']>;
  startId_gt?: InputMaybe<Scalars['String']['input']>;
  startId_gte?: InputMaybe<Scalars['String']['input']>;
  startId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId_lt?: InputMaybe<Scalars['String']['input']>;
  startId_lte?: InputMaybe<Scalars['String']['input']>;
  startId_not?: InputMaybe<Scalars['String']['input']>;
  startId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type CastPage = {
  __typename?: 'CastPage';
  items: Array<Cast>;
  pageInfo: PageInfo;
};

export type Chain = {
  __typename?: 'Chain';
  consumerPreimage: ConsumerPreimage;
  consumerPreimageId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  identifier: Scalars['BigInt']['output'];
  owner: Scalars['String']['output'];
  start: Start;
  startId: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
  undermine: Undermine;
  undermineId: Scalars['String']['output'];
};

export type ChainFilter = {
  AND?: InputMaybe<Array<InputMaybe<ChainFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<ChainFilter>>>;
  consumerPreimageId?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_gt?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_gte?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  consumerPreimageId_lt?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_lte?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_not?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  identifier?: InputMaybe<Scalars['BigInt']['input']>;
  identifier_gt?: InputMaybe<Scalars['BigInt']['input']>;
  identifier_gte?: InputMaybe<Scalars['BigInt']['input']>;
  identifier_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  identifier_lt?: InputMaybe<Scalars['BigInt']['input']>;
  identifier_lte?: InputMaybe<Scalars['BigInt']['input']>;
  identifier_not?: InputMaybe<Scalars['BigInt']['input']>;
  identifier_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  owner?: InputMaybe<Scalars['String']['input']>;
  owner_gt?: InputMaybe<Scalars['String']['input']>;
  owner_gte?: InputMaybe<Scalars['String']['input']>;
  owner_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  owner_lt?: InputMaybe<Scalars['String']['input']>;
  owner_lte?: InputMaybe<Scalars['String']['input']>;
  owner_not?: InputMaybe<Scalars['String']['input']>;
  owner_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId?: InputMaybe<Scalars['String']['input']>;
  startId_gt?: InputMaybe<Scalars['String']['input']>;
  startId_gte?: InputMaybe<Scalars['String']['input']>;
  startId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId_lt?: InputMaybe<Scalars['String']['input']>;
  startId_lte?: InputMaybe<Scalars['String']['input']>;
  startId_not?: InputMaybe<Scalars['String']['input']>;
  startId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  undermineId?: InputMaybe<Scalars['String']['input']>;
  undermineId_gt?: InputMaybe<Scalars['String']['input']>;
  undermineId_gte?: InputMaybe<Scalars['String']['input']>;
  undermineId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  undermineId_lt?: InputMaybe<Scalars['String']['input']>;
  undermineId_lte?: InputMaybe<Scalars['String']['input']>;
  undermineId_not?: InputMaybe<Scalars['String']['input']>;
  undermineId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type ChainPage = {
  __typename?: 'ChainPage';
  items: Array<Chain>;
  pageInfo: PageInfo;
};

export type ConsumerPreimage = {
  __typename?: 'ConsumerPreimage';
  chain?: Maybe<Chain>;
  chainId?: Maybe<Scalars['String']['output']>;
  data: Scalars['String']['output'];
  id: Scalars['String']['output'];
  secret?: Maybe<Scalars['String']['output']>;
  undermine?: Maybe<Undermine>;
  undermineId?: Maybe<Scalars['String']['output']>;
  unveil?: Maybe<Unveil>;
  unveilId?: Maybe<Scalars['String']['output']>;
};

export type ConsumerPreimageFilter = {
  AND?: InputMaybe<Array<InputMaybe<ConsumerPreimageFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<ConsumerPreimageFilter>>>;
  chainId?: InputMaybe<Scalars['String']['input']>;
  chainId_gt?: InputMaybe<Scalars['String']['input']>;
  chainId_gte?: InputMaybe<Scalars['String']['input']>;
  chainId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  chainId_lt?: InputMaybe<Scalars['String']['input']>;
  chainId_lte?: InputMaybe<Scalars['String']['input']>;
  chainId_not?: InputMaybe<Scalars['String']['input']>;
  chainId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  data?: InputMaybe<Scalars['String']['input']>;
  data_gt?: InputMaybe<Scalars['String']['input']>;
  data_gte?: InputMaybe<Scalars['String']['input']>;
  data_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  data_lt?: InputMaybe<Scalars['String']['input']>;
  data_lte?: InputMaybe<Scalars['String']['input']>;
  data_not?: InputMaybe<Scalars['String']['input']>;
  data_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  secret?: InputMaybe<Scalars['String']['input']>;
  secret_gt?: InputMaybe<Scalars['String']['input']>;
  secret_gte?: InputMaybe<Scalars['String']['input']>;
  secret_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  secret_lt?: InputMaybe<Scalars['String']['input']>;
  secret_lte?: InputMaybe<Scalars['String']['input']>;
  secret_not?: InputMaybe<Scalars['String']['input']>;
  secret_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  undermineId?: InputMaybe<Scalars['String']['input']>;
  undermineId_gt?: InputMaybe<Scalars['String']['input']>;
  undermineId_gte?: InputMaybe<Scalars['String']['input']>;
  undermineId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  undermineId_lt?: InputMaybe<Scalars['String']['input']>;
  undermineId_lte?: InputMaybe<Scalars['String']['input']>;
  undermineId_not?: InputMaybe<Scalars['String']['input']>;
  undermineId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  unveilId?: InputMaybe<Scalars['String']['input']>;
  unveilId_gt?: InputMaybe<Scalars['String']['input']>;
  unveilId_gte?: InputMaybe<Scalars['String']['input']>;
  unveilId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  unveilId_lt?: InputMaybe<Scalars['String']['input']>;
  unveilId_lte?: InputMaybe<Scalars['String']['input']>;
  unveilId_not?: InputMaybe<Scalars['String']['input']>;
  unveilId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type ConsumerPreimagePage = {
  __typename?: 'ConsumerPreimagePage';
  items: Array<ConsumerPreimage>;
  pageInfo: PageInfo;
};

export type Expired = {
  __typename?: 'Expired';
  cast: Cast;
  castId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  start: Start;
  startId: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type ExpiredFilter = {
  AND?: InputMaybe<Array<InputMaybe<ExpiredFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<ExpiredFilter>>>;
  castId?: InputMaybe<Scalars['String']['input']>;
  castId_gt?: InputMaybe<Scalars['String']['input']>;
  castId_gte?: InputMaybe<Scalars['String']['input']>;
  castId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  castId_lt?: InputMaybe<Scalars['String']['input']>;
  castId_lte?: InputMaybe<Scalars['String']['input']>;
  castId_not?: InputMaybe<Scalars['String']['input']>;
  castId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  startId?: InputMaybe<Scalars['String']['input']>;
  startId_gt?: InputMaybe<Scalars['String']['input']>;
  startId_gte?: InputMaybe<Scalars['String']['input']>;
  startId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId_lt?: InputMaybe<Scalars['String']['input']>;
  startId_lte?: InputMaybe<Scalars['String']['input']>;
  startId_not?: InputMaybe<Scalars['String']['input']>;
  startId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type ExpiredPage = {
  __typename?: 'ExpiredPage';
  items: Array<Expired>;
  pageInfo: PageInfo;
};

export type Heat = {
  __typename?: 'Heat';
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  preimage: Preimage;
  preimageId: Scalars['String']['output'];
  start?: Maybe<Start>;
  startId?: Maybe<Scalars['String']['output']>;
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type HeatFilter = {
  AND?: InputMaybe<Array<InputMaybe<HeatFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<HeatFilter>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  preimageId?: InputMaybe<Scalars['String']['input']>;
  preimageId_gt?: InputMaybe<Scalars['String']['input']>;
  preimageId_gte?: InputMaybe<Scalars['String']['input']>;
  preimageId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  preimageId_lt?: InputMaybe<Scalars['String']['input']>;
  preimageId_lte?: InputMaybe<Scalars['String']['input']>;
  preimageId_not?: InputMaybe<Scalars['String']['input']>;
  preimageId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId?: InputMaybe<Scalars['String']['input']>;
  startId_gt?: InputMaybe<Scalars['String']['input']>;
  startId_gte?: InputMaybe<Scalars['String']['input']>;
  startId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId_lt?: InputMaybe<Scalars['String']['input']>;
  startId_lte?: InputMaybe<Scalars['String']['input']>;
  startId_not?: InputMaybe<Scalars['String']['input']>;
  startId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type HeatPage = {
  __typename?: 'HeatPage';
  items: Array<Heat>;
  pageInfo: PageInfo;
};

export type Ink = {
  __typename?: 'Ink';
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  pointer: Pointer;
  pointerId: Scalars['String']['output'];
  section: Scalars['String']['output'];
  sender: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type InkFilter = {
  AND?: InputMaybe<Array<InputMaybe<InkFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<InkFilter>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  pointerId?: InputMaybe<Scalars['String']['input']>;
  pointerId_gt?: InputMaybe<Scalars['String']['input']>;
  pointerId_gte?: InputMaybe<Scalars['String']['input']>;
  pointerId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  pointerId_lt?: InputMaybe<Scalars['String']['input']>;
  pointerId_lte?: InputMaybe<Scalars['String']['input']>;
  pointerId_not?: InputMaybe<Scalars['String']['input']>;
  pointerId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  section?: InputMaybe<Scalars['String']['input']>;
  section_gt?: InputMaybe<Scalars['String']['input']>;
  section_gte?: InputMaybe<Scalars['String']['input']>;
  section_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  section_lt?: InputMaybe<Scalars['String']['input']>;
  section_lte?: InputMaybe<Scalars['String']['input']>;
  section_not?: InputMaybe<Scalars['String']['input']>;
  section_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  sender?: InputMaybe<Scalars['String']['input']>;
  sender_gt?: InputMaybe<Scalars['String']['input']>;
  sender_gte?: InputMaybe<Scalars['String']['input']>;
  sender_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  sender_lt?: InputMaybe<Scalars['String']['input']>;
  sender_lte?: InputMaybe<Scalars['String']['input']>;
  sender_not?: InputMaybe<Scalars['String']['input']>;
  sender_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type InkPage = {
  __typename?: 'InkPage';
  items: Array<Ink>;
  pageInfo: PageInfo;
};

export type Link = {
  __typename?: 'Link';
  cast?: Maybe<Cast>;
  castId?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  preimage: Preimage;
  preimageId: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type LinkFilter = {
  AND?: InputMaybe<Array<InputMaybe<LinkFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<LinkFilter>>>;
  castId?: InputMaybe<Scalars['String']['input']>;
  castId_gt?: InputMaybe<Scalars['String']['input']>;
  castId_gte?: InputMaybe<Scalars['String']['input']>;
  castId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  castId_lt?: InputMaybe<Scalars['String']['input']>;
  castId_lte?: InputMaybe<Scalars['String']['input']>;
  castId_not?: InputMaybe<Scalars['String']['input']>;
  castId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  preimageId?: InputMaybe<Scalars['String']['input']>;
  preimageId_gt?: InputMaybe<Scalars['String']['input']>;
  preimageId_gte?: InputMaybe<Scalars['String']['input']>;
  preimageId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  preimageId_lt?: InputMaybe<Scalars['String']['input']>;
  preimageId_lte?: InputMaybe<Scalars['String']['input']>;
  preimageId_not?: InputMaybe<Scalars['String']['input']>;
  preimageId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type LinkPage = {
  __typename?: 'LinkPage';
  items: Array<Link>;
  pageInfo: PageInfo;
};

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type Pointer = {
  __typename?: 'Pointer';
  address: Scalars['String']['output'];
  bleach?: Maybe<Bleach>;
  bleachId?: Maybe<Scalars['String']['output']>;
  chainId: Scalars['BigInt']['output'];
  count: Scalars['Int']['output'];
  duration: Scalars['BigInt']['output'];
  durationIsTimestamp: Scalars['Boolean']['output'];
  id: Scalars['String']['output'];
  ink: Ink;
  inkId: Scalars['String']['output'];
  lastOkTransaction: Transaction;
  lastOkTransactionId: Scalars['String']['output'];
  offset: Scalars['BigInt']['output'];
  preimages?: Maybe<PreimagePage>;
  price: Scalars['BigInt']['output'];
  provider: Scalars['String']['output'];
  remaining: Scalars['Int']['output'];
  section: Scalars['String']['output'];
  storage: Scalars['String']['output'];
  template: Scalars['String']['output'];
  token: Scalars['String']['output'];
};


export type PointerPreimagesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<PreimageFilter>;
};

export type PointerFilter = {
  AND?: InputMaybe<Array<InputMaybe<PointerFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<PointerFilter>>>;
  address?: InputMaybe<Scalars['String']['input']>;
  address_gt?: InputMaybe<Scalars['String']['input']>;
  address_gte?: InputMaybe<Scalars['String']['input']>;
  address_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  address_lt?: InputMaybe<Scalars['String']['input']>;
  address_lte?: InputMaybe<Scalars['String']['input']>;
  address_not?: InputMaybe<Scalars['String']['input']>;
  address_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  bleachId?: InputMaybe<Scalars['String']['input']>;
  bleachId_gt?: InputMaybe<Scalars['String']['input']>;
  bleachId_gte?: InputMaybe<Scalars['String']['input']>;
  bleachId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  bleachId_lt?: InputMaybe<Scalars['String']['input']>;
  bleachId_lte?: InputMaybe<Scalars['String']['input']>;
  bleachId_not?: InputMaybe<Scalars['String']['input']>;
  bleachId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  chainId?: InputMaybe<Scalars['BigInt']['input']>;
  chainId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  chainId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  chainId_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  chainId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  chainId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  chainId_not?: InputMaybe<Scalars['BigInt']['input']>;
  chainId_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  count?: InputMaybe<Scalars['Int']['input']>;
  count_gt?: InputMaybe<Scalars['Int']['input']>;
  count_gte?: InputMaybe<Scalars['Int']['input']>;
  count_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  count_lt?: InputMaybe<Scalars['Int']['input']>;
  count_lte?: InputMaybe<Scalars['Int']['input']>;
  count_not?: InputMaybe<Scalars['Int']['input']>;
  count_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  duration?: InputMaybe<Scalars['BigInt']['input']>;
  durationIsTimestamp?: InputMaybe<Scalars['Boolean']['input']>;
  durationIsTimestamp_in?: InputMaybe<Array<InputMaybe<Scalars['Boolean']['input']>>>;
  durationIsTimestamp_not?: InputMaybe<Scalars['Boolean']['input']>;
  durationIsTimestamp_not_in?: InputMaybe<Array<InputMaybe<Scalars['Boolean']['input']>>>;
  duration_gt?: InputMaybe<Scalars['BigInt']['input']>;
  duration_gte?: InputMaybe<Scalars['BigInt']['input']>;
  duration_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  duration_lt?: InputMaybe<Scalars['BigInt']['input']>;
  duration_lte?: InputMaybe<Scalars['BigInt']['input']>;
  duration_not?: InputMaybe<Scalars['BigInt']['input']>;
  duration_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  inkId?: InputMaybe<Scalars['String']['input']>;
  inkId_gt?: InputMaybe<Scalars['String']['input']>;
  inkId_gte?: InputMaybe<Scalars['String']['input']>;
  inkId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  inkId_lt?: InputMaybe<Scalars['String']['input']>;
  inkId_lte?: InputMaybe<Scalars['String']['input']>;
  inkId_not?: InputMaybe<Scalars['String']['input']>;
  inkId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  lastOkTransactionId?: InputMaybe<Scalars['String']['input']>;
  lastOkTransactionId_gt?: InputMaybe<Scalars['String']['input']>;
  lastOkTransactionId_gte?: InputMaybe<Scalars['String']['input']>;
  lastOkTransactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  lastOkTransactionId_lt?: InputMaybe<Scalars['String']['input']>;
  lastOkTransactionId_lte?: InputMaybe<Scalars['String']['input']>;
  lastOkTransactionId_not?: InputMaybe<Scalars['String']['input']>;
  lastOkTransactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  offset?: InputMaybe<Scalars['BigInt']['input']>;
  offset_gt?: InputMaybe<Scalars['BigInt']['input']>;
  offset_gte?: InputMaybe<Scalars['BigInt']['input']>;
  offset_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  offset_lt?: InputMaybe<Scalars['BigInt']['input']>;
  offset_lte?: InputMaybe<Scalars['BigInt']['input']>;
  offset_not?: InputMaybe<Scalars['BigInt']['input']>;
  offset_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  price?: InputMaybe<Scalars['BigInt']['input']>;
  price_gt?: InputMaybe<Scalars['BigInt']['input']>;
  price_gte?: InputMaybe<Scalars['BigInt']['input']>;
  price_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  price_lt?: InputMaybe<Scalars['BigInt']['input']>;
  price_lte?: InputMaybe<Scalars['BigInt']['input']>;
  price_not?: InputMaybe<Scalars['BigInt']['input']>;
  price_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  provider?: InputMaybe<Scalars['String']['input']>;
  provider_gt?: InputMaybe<Scalars['String']['input']>;
  provider_gte?: InputMaybe<Scalars['String']['input']>;
  provider_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  provider_lt?: InputMaybe<Scalars['String']['input']>;
  provider_lte?: InputMaybe<Scalars['String']['input']>;
  provider_not?: InputMaybe<Scalars['String']['input']>;
  provider_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  remaining?: InputMaybe<Scalars['Int']['input']>;
  remaining_gt?: InputMaybe<Scalars['Int']['input']>;
  remaining_gte?: InputMaybe<Scalars['Int']['input']>;
  remaining_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  remaining_lt?: InputMaybe<Scalars['Int']['input']>;
  remaining_lte?: InputMaybe<Scalars['Int']['input']>;
  remaining_not?: InputMaybe<Scalars['Int']['input']>;
  remaining_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  section?: InputMaybe<Scalars['String']['input']>;
  section_gt?: InputMaybe<Scalars['String']['input']>;
  section_gte?: InputMaybe<Scalars['String']['input']>;
  section_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  section_lt?: InputMaybe<Scalars['String']['input']>;
  section_lte?: InputMaybe<Scalars['String']['input']>;
  section_not?: InputMaybe<Scalars['String']['input']>;
  section_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  storage?: InputMaybe<Scalars['String']['input']>;
  storage_gt?: InputMaybe<Scalars['String']['input']>;
  storage_gte?: InputMaybe<Scalars['String']['input']>;
  storage_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  storage_lt?: InputMaybe<Scalars['String']['input']>;
  storage_lte?: InputMaybe<Scalars['String']['input']>;
  storage_not?: InputMaybe<Scalars['String']['input']>;
  storage_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  template?: InputMaybe<Scalars['String']['input']>;
  template_gt?: InputMaybe<Scalars['String']['input']>;
  template_gte?: InputMaybe<Scalars['String']['input']>;
  template_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  template_lt?: InputMaybe<Scalars['String']['input']>;
  template_lte?: InputMaybe<Scalars['String']['input']>;
  template_not?: InputMaybe<Scalars['String']['input']>;
  template_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  token?: InputMaybe<Scalars['String']['input']>;
  token_gt?: InputMaybe<Scalars['String']['input']>;
  token_gte?: InputMaybe<Scalars['String']['input']>;
  token_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  token_lt?: InputMaybe<Scalars['String']['input']>;
  token_lte?: InputMaybe<Scalars['String']['input']>;
  token_not?: InputMaybe<Scalars['String']['input']>;
  token_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type PointerPage = {
  __typename?: 'PointerPage';
  items: Array<Pointer>;
  pageInfo: PageInfo;
};

export type Preimage = {
  __typename?: 'Preimage';
  accessed: Scalars['Boolean']['output'];
  cast?: Maybe<Cast>;
  castId?: Maybe<Scalars['String']['output']>;
  data: Scalars['String']['output'];
  heat?: Maybe<Heat>;
  heatId?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  link?: Maybe<Link>;
  linkId?: Maybe<Scalars['String']['output']>;
  pointer: Pointer;
  pointerId: Scalars['String']['output'];
  reveal?: Maybe<Reveal>;
  revealId?: Maybe<Scalars['String']['output']>;
  secret?: Maybe<Scalars['String']['output']>;
  section: Scalars['String']['output'];
  start?: Maybe<Start>;
  startId?: Maybe<Scalars['String']['output']>;
  template: Scalars['String']['output'];
  timestamp?: Maybe<Scalars['BigInt']['output']>;
};

export type PreimageFilter = {
  AND?: InputMaybe<Array<InputMaybe<PreimageFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<PreimageFilter>>>;
  accessed?: InputMaybe<Scalars['Boolean']['input']>;
  accessed_in?: InputMaybe<Array<InputMaybe<Scalars['Boolean']['input']>>>;
  accessed_not?: InputMaybe<Scalars['Boolean']['input']>;
  accessed_not_in?: InputMaybe<Array<InputMaybe<Scalars['Boolean']['input']>>>;
  castId?: InputMaybe<Scalars['String']['input']>;
  castId_gt?: InputMaybe<Scalars['String']['input']>;
  castId_gte?: InputMaybe<Scalars['String']['input']>;
  castId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  castId_lt?: InputMaybe<Scalars['String']['input']>;
  castId_lte?: InputMaybe<Scalars['String']['input']>;
  castId_not?: InputMaybe<Scalars['String']['input']>;
  castId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  data?: InputMaybe<Scalars['String']['input']>;
  data_gt?: InputMaybe<Scalars['String']['input']>;
  data_gte?: InputMaybe<Scalars['String']['input']>;
  data_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  data_lt?: InputMaybe<Scalars['String']['input']>;
  data_lte?: InputMaybe<Scalars['String']['input']>;
  data_not?: InputMaybe<Scalars['String']['input']>;
  data_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  heatId?: InputMaybe<Scalars['String']['input']>;
  heatId_gt?: InputMaybe<Scalars['String']['input']>;
  heatId_gte?: InputMaybe<Scalars['String']['input']>;
  heatId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  heatId_lt?: InputMaybe<Scalars['String']['input']>;
  heatId_lte?: InputMaybe<Scalars['String']['input']>;
  heatId_not?: InputMaybe<Scalars['String']['input']>;
  heatId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  linkId?: InputMaybe<Scalars['String']['input']>;
  linkId_gt?: InputMaybe<Scalars['String']['input']>;
  linkId_gte?: InputMaybe<Scalars['String']['input']>;
  linkId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  linkId_lt?: InputMaybe<Scalars['String']['input']>;
  linkId_lte?: InputMaybe<Scalars['String']['input']>;
  linkId_not?: InputMaybe<Scalars['String']['input']>;
  linkId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  pointerId?: InputMaybe<Scalars['String']['input']>;
  pointerId_gt?: InputMaybe<Scalars['String']['input']>;
  pointerId_gte?: InputMaybe<Scalars['String']['input']>;
  pointerId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  pointerId_lt?: InputMaybe<Scalars['String']['input']>;
  pointerId_lte?: InputMaybe<Scalars['String']['input']>;
  pointerId_not?: InputMaybe<Scalars['String']['input']>;
  pointerId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  revealId?: InputMaybe<Scalars['String']['input']>;
  revealId_gt?: InputMaybe<Scalars['String']['input']>;
  revealId_gte?: InputMaybe<Scalars['String']['input']>;
  revealId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  revealId_lt?: InputMaybe<Scalars['String']['input']>;
  revealId_lte?: InputMaybe<Scalars['String']['input']>;
  revealId_not?: InputMaybe<Scalars['String']['input']>;
  revealId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  secret?: InputMaybe<Scalars['String']['input']>;
  secret_gt?: InputMaybe<Scalars['String']['input']>;
  secret_gte?: InputMaybe<Scalars['String']['input']>;
  secret_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  secret_lt?: InputMaybe<Scalars['String']['input']>;
  secret_lte?: InputMaybe<Scalars['String']['input']>;
  secret_not?: InputMaybe<Scalars['String']['input']>;
  secret_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  section?: InputMaybe<Scalars['String']['input']>;
  section_gt?: InputMaybe<Scalars['String']['input']>;
  section_gte?: InputMaybe<Scalars['String']['input']>;
  section_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  section_lt?: InputMaybe<Scalars['String']['input']>;
  section_lte?: InputMaybe<Scalars['String']['input']>;
  section_not?: InputMaybe<Scalars['String']['input']>;
  section_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId?: InputMaybe<Scalars['String']['input']>;
  startId_gt?: InputMaybe<Scalars['String']['input']>;
  startId_gte?: InputMaybe<Scalars['String']['input']>;
  startId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  startId_lt?: InputMaybe<Scalars['String']['input']>;
  startId_lte?: InputMaybe<Scalars['String']['input']>;
  startId_not?: InputMaybe<Scalars['String']['input']>;
  startId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  template?: InputMaybe<Scalars['String']['input']>;
  template_gt?: InputMaybe<Scalars['String']['input']>;
  template_gte?: InputMaybe<Scalars['String']['input']>;
  template_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  template_lt?: InputMaybe<Scalars['String']['input']>;
  template_lte?: InputMaybe<Scalars['String']['input']>;
  template_not?: InputMaybe<Scalars['String']['input']>;
  template_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  timestamp?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
  timestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_not_in?: InputMaybe<Array<InputMaybe<Scalars['BigInt']['input']>>>;
};

export type PreimagePage = {
  __typename?: 'PreimagePage';
  items: Array<Preimage>;
  pageInfo: PageInfo;
};

export type Query = {
  __typename?: 'Query';
  _meta?: Maybe<_Meta>;
  bleach?: Maybe<Bleach>;
  bleachs: BleachPage;
  block?: Maybe<Block>;
  blocks: BlockPage;
  cast?: Maybe<Cast>;
  casts: CastPage;
  chain?: Maybe<Chain>;
  chains: ChainPage;
  consumerPreimage?: Maybe<ConsumerPreimage>;
  consumerPreimages: ConsumerPreimagePage;
  expired?: Maybe<Expired>;
  expireds: ExpiredPage;
  heat?: Maybe<Heat>;
  heats: HeatPage;
  ink?: Maybe<Ink>;
  inks: InkPage;
  link?: Maybe<Link>;
  links: LinkPage;
  pointer?: Maybe<Pointer>;
  pointers: PointerPage;
  preimage?: Maybe<Preimage>;
  preimages: PreimagePage;
  reveal?: Maybe<Reveal>;
  reveals: RevealPage;
  start?: Maybe<Start>;
  starts: StartPage;
  transaction?: Maybe<Transaction>;
  transactions: TransactionPage;
  undermine?: Maybe<Undermine>;
  undermines: UnderminePage;
  unveil?: Maybe<Unveil>;
  unveils: UnveilPage;
};


export type QueryBleachArgs = {
  id: Scalars['String']['input'];
};


export type QueryBleachsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<BleachFilter>;
};


export type QueryBlockArgs = {
  id: Scalars['String']['input'];
};


export type QueryBlocksArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<BlockFilter>;
};


export type QueryCastArgs = {
  id: Scalars['String']['input'];
};


export type QueryCastsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<CastFilter>;
};


export type QueryChainArgs = {
  id: Scalars['String']['input'];
};


export type QueryChainsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<ChainFilter>;
};


export type QueryConsumerPreimageArgs = {
  id: Scalars['String']['input'];
};


export type QueryConsumerPreimagesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<ConsumerPreimageFilter>;
};


export type QueryExpiredArgs = {
  id: Scalars['String']['input'];
};


export type QueryExpiredsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<ExpiredFilter>;
};


export type QueryHeatArgs = {
  id: Scalars['String']['input'];
};


export type QueryHeatsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<HeatFilter>;
};


export type QueryInkArgs = {
  id: Scalars['String']['input'];
};


export type QueryInksArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<InkFilter>;
};


export type QueryLinkArgs = {
  id: Scalars['String']['input'];
};


export type QueryLinksArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<LinkFilter>;
};


export type QueryPointerArgs = {
  id: Scalars['String']['input'];
};


export type QueryPointersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<PointerFilter>;
};


export type QueryPreimageArgs = {
  id: Scalars['String']['input'];
};


export type QueryPreimagesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<PreimageFilter>;
};


export type QueryRevealArgs = {
  id: Scalars['String']['input'];
};


export type QueryRevealsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<RevealFilter>;
};


export type QueryStartArgs = {
  id: Scalars['String']['input'];
};


export type QueryStartsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<StartFilter>;
};


export type QueryTransactionArgs = {
  id: Scalars['String']['input'];
};


export type QueryTransactionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<TransactionFilter>;
};


export type QueryUndermineArgs = {
  id: Scalars['String']['input'];
};


export type QueryUnderminesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<UndermineFilter>;
};


export type QueryUnveilArgs = {
  id: Scalars['String']['input'];
};


export type QueryUnveilsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<UnveilFilter>;
};

export type Reveal = {
  __typename?: 'Reveal';
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  preimage: Preimage;
  preimageId: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type RevealFilter = {
  AND?: InputMaybe<Array<InputMaybe<RevealFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<RevealFilter>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  preimageId?: InputMaybe<Scalars['String']['input']>;
  preimageId_gt?: InputMaybe<Scalars['String']['input']>;
  preimageId_gte?: InputMaybe<Scalars['String']['input']>;
  preimageId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  preimageId_lt?: InputMaybe<Scalars['String']['input']>;
  preimageId_lte?: InputMaybe<Scalars['String']['input']>;
  preimageId_not?: InputMaybe<Scalars['String']['input']>;
  preimageId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type RevealPage = {
  __typename?: 'RevealPage';
  items: Array<Reveal>;
  pageInfo: PageInfo;
};

export type Start = {
  __typename?: 'Start';
  cast?: Maybe<Cast>;
  castId?: Maybe<Scalars['String']['output']>;
  chopped: Scalars['Boolean']['output'];
  expired?: Maybe<Expired>;
  expiredId?: Maybe<Scalars['String']['output']>;
  heat?: Maybe<HeatPage>;
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  key: Scalars['String']['output'];
  owner: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};


export type StartHeatArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<HeatFilter>;
};

export type StartFilter = {
  AND?: InputMaybe<Array<InputMaybe<StartFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<StartFilter>>>;
  castId?: InputMaybe<Scalars['String']['input']>;
  castId_gt?: InputMaybe<Scalars['String']['input']>;
  castId_gte?: InputMaybe<Scalars['String']['input']>;
  castId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  castId_lt?: InputMaybe<Scalars['String']['input']>;
  castId_lte?: InputMaybe<Scalars['String']['input']>;
  castId_not?: InputMaybe<Scalars['String']['input']>;
  castId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  chopped?: InputMaybe<Scalars['Boolean']['input']>;
  chopped_in?: InputMaybe<Array<InputMaybe<Scalars['Boolean']['input']>>>;
  chopped_not?: InputMaybe<Scalars['Boolean']['input']>;
  chopped_not_in?: InputMaybe<Array<InputMaybe<Scalars['Boolean']['input']>>>;
  expiredId?: InputMaybe<Scalars['String']['input']>;
  expiredId_gt?: InputMaybe<Scalars['String']['input']>;
  expiredId_gte?: InputMaybe<Scalars['String']['input']>;
  expiredId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  expiredId_lt?: InputMaybe<Scalars['String']['input']>;
  expiredId_lte?: InputMaybe<Scalars['String']['input']>;
  expiredId_not?: InputMaybe<Scalars['String']['input']>;
  expiredId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  key?: InputMaybe<Scalars['String']['input']>;
  key_gt?: InputMaybe<Scalars['String']['input']>;
  key_gte?: InputMaybe<Scalars['String']['input']>;
  key_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  key_lt?: InputMaybe<Scalars['String']['input']>;
  key_lte?: InputMaybe<Scalars['String']['input']>;
  key_not?: InputMaybe<Scalars['String']['input']>;
  key_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  owner?: InputMaybe<Scalars['String']['input']>;
  owner_gt?: InputMaybe<Scalars['String']['input']>;
  owner_gte?: InputMaybe<Scalars['String']['input']>;
  owner_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  owner_lt?: InputMaybe<Scalars['String']['input']>;
  owner_lte?: InputMaybe<Scalars['String']['input']>;
  owner_not?: InputMaybe<Scalars['String']['input']>;
  owner_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type StartPage = {
  __typename?: 'StartPage';
  items: Array<Start>;
  pageInfo: PageInfo;
};

export type Transaction = {
  __typename?: 'Transaction';
  block: Block;
  blockId: Scalars['String']['output'];
  hash: Scalars['String']['output'];
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
};

export type TransactionFilter = {
  AND?: InputMaybe<Array<InputMaybe<TransactionFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<TransactionFilter>>>;
  blockId?: InputMaybe<Scalars['String']['input']>;
  blockId_gt?: InputMaybe<Scalars['String']['input']>;
  blockId_gte?: InputMaybe<Scalars['String']['input']>;
  blockId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  blockId_lt?: InputMaybe<Scalars['String']['input']>;
  blockId_lte?: InputMaybe<Scalars['String']['input']>;
  blockId_not?: InputMaybe<Scalars['String']['input']>;
  blockId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  hash?: InputMaybe<Scalars['String']['input']>;
  hash_gt?: InputMaybe<Scalars['String']['input']>;
  hash_gte?: InputMaybe<Scalars['String']['input']>;
  hash_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  hash_lt?: InputMaybe<Scalars['String']['input']>;
  hash_lte?: InputMaybe<Scalars['String']['input']>;
  hash_not?: InputMaybe<Scalars['String']['input']>;
  hash_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
};

export type TransactionPage = {
  __typename?: 'TransactionPage';
  items: Array<Transaction>;
  pageInfo: PageInfo;
};

export type Undermine = {
  __typename?: 'Undermine';
  chain: Chain;
  chainId: Scalars['String']['output'];
  consumerPreimage: ConsumerPreimage;
  consumerPreimageId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  owner: Scalars['String']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type UndermineFilter = {
  AND?: InputMaybe<Array<InputMaybe<UndermineFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<UndermineFilter>>>;
  chainId?: InputMaybe<Scalars['String']['input']>;
  chainId_gt?: InputMaybe<Scalars['String']['input']>;
  chainId_gte?: InputMaybe<Scalars['String']['input']>;
  chainId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  chainId_lt?: InputMaybe<Scalars['String']['input']>;
  chainId_lte?: InputMaybe<Scalars['String']['input']>;
  chainId_not?: InputMaybe<Scalars['String']['input']>;
  chainId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  consumerPreimageId?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_gt?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_gte?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  consumerPreimageId_lt?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_lte?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_not?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  owner?: InputMaybe<Scalars['String']['input']>;
  owner_gt?: InputMaybe<Scalars['String']['input']>;
  owner_gte?: InputMaybe<Scalars['String']['input']>;
  owner_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  owner_lt?: InputMaybe<Scalars['String']['input']>;
  owner_lte?: InputMaybe<Scalars['String']['input']>;
  owner_not?: InputMaybe<Scalars['String']['input']>;
  owner_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type UnderminePage = {
  __typename?: 'UnderminePage';
  items: Array<Undermine>;
  pageInfo: PageInfo;
};

export type Unveil = {
  __typename?: 'Unveil';
  consumerPreimage: ConsumerPreimage;
  consumerPreimageId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  transaction: Transaction;
  transactionId: Scalars['String']['output'];
};

export type UnveilFilter = {
  AND?: InputMaybe<Array<InputMaybe<UnveilFilter>>>;
  OR?: InputMaybe<Array<InputMaybe<UnveilFilter>>>;
  consumerPreimageId?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_gt?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_gte?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  consumerPreimageId_lt?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_lte?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_not?: InputMaybe<Scalars['String']['input']>;
  consumerPreimageId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  index?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  transactionId?: InputMaybe<Scalars['String']['input']>;
  transactionId_gt?: InputMaybe<Scalars['String']['input']>;
  transactionId_gte?: InputMaybe<Scalars['String']['input']>;
  transactionId_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  transactionId_lt?: InputMaybe<Scalars['String']['input']>;
  transactionId_lte?: InputMaybe<Scalars['String']['input']>;
  transactionId_not?: InputMaybe<Scalars['String']['input']>;
  transactionId_not_in?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type UnveilPage = {
  __typename?: 'UnveilPage';
  items: Array<Unveil>;
  pageInfo: PageInfo;
};

export type _Meta = {
  __typename?: '_meta';
  status?: Maybe<Scalars['JSON']['output']>;
};
