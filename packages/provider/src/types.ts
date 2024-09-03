import * as viem from 'viem'

export type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T;

export type StreamConfig = {
  /**
   * the index of the provider in the mnemonic
   */
  provider: number;
  consumer: number;
  /** find a funder with adequate deposits to run transaction */
  funder: number[];
  /**
   * the number of preimages that should be cool at any given time. if this number is
   * ever greater than the number of cooled images, then immediately ink more
   */
  minCoolPreimages: number;
  /** purchase preimage storage space while under gas threshold until this point */
  maxCoolPreimages: number;
  /**
   * the cost per preimage that you wish to tolerate. above this cost,
   * you will not buy more. below, you will buy to your max
   * the number is a decimal in native token terms
   */
  perPreimageCostThreshold: string;
  /** the number of preimages that you expect to ink each time space is purchased. use zero (default) for the max */
  preimagesPerInk: string;
  // decide to fund the ink jit or not
  jitSendValue: boolean;
  info: {
    /**
     * the token that you wish to be paid in
     */
    token: viem.Hex
    /** the price of providing randomenss as a decimal - also what you will be required to stake */
    price: string;
    /** the minimum duration that you are willing to consent to (default 12) */
    duration: number;
    /** whether or not the duration above should be read as a timestamp (true) or a block delta (false) */
    durationIsTimestamp: boolean;
  }
}

export type DBConfig = {
  url: string;
  ssl: boolean;
  schema: string;
  name: string;
}

export type IndexerConfig = {
  url: string;
}

export type RandomnessConfig = {
  addresses: {
    random: viem.Hex;
    reader: viem.Hex;
  };
  streams: StreamConfig[]
}

export type Config = {
  chainId: number;
  indexer: IndexerConfig;
  randomness: Map<number, RandomnessConfig>;
  database: DBConfig;
}
