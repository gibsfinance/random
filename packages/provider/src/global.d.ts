import { TableNames, tableNames } from "./db/tables";

declare module 'knex/types/tables' {
  interface Seed {
    seedId: viem.Hex;
  }
  interface Secret {
    seedId: viem.Hex;
    preimage: viem.Hex;
    index: string;
    inkTransactionHash: viem.Hex;
    inkIndexed: boolean;
    exposed: boolean;
    section: viem.Hex | null;
    template: viem.Hex | null;
    random: viem.Hex;
    chainId: string;
  }
  interface InsertableSecret extends Omit<Secret, 'inkIndexed' | 'exposed' | 'section'> { }
  interface Tables {
    [tableNames.seed]: Seed;
    [tableNames.secret]: Secret;
  }
}
