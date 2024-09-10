import * as viem from 'viem'
import { TableNames, tableNames } from "./db/tables";

declare module 'knex/types/tables' {
  interface Seed {
    seedId: viem.Hex;
  }
  interface Secret {
    seedId: viem.Hex;
    preimage: viem.Hex;
    index: string;
    // inkIndexed: boolean;
    exposed: boolean;
    section: viem.Hex | null;
    template: viem.Hex | null;
    randomContractAddress: viem.Hex;
    chainId: string;
    inkTransactionId: string;
    revealTransactionId: string;
  }
  interface InsertableSecret extends Omit<Secret, 'inkIndexed' | 'exposed' | 'section'> { }
  interface Transaction {
    transactionId: string;
    hash: viem.Hex;
    chainId: string;
    from: viem.Hex;
    to: viem.Hex;
    blockNumber: string;
    transactionIndex: number;
  }
  interface InsertableTransaction extends Omit<Transaction, 'transactionId' | 'blockNumber' | 'transactionIndex'> { }
  interface TransactionAction {
    actionId: string;
    type: string;
    detail: string;
    transactionId: string;
  }
  interface InsertableTransactionAction extends Omit<TransactionAction, 'actionId'> { }
  interface Tables {
    [tableNames.seed]: Seed;
    [tableNames.secret]: Secret;
    [tableNames.transaction]: Transaction;
    [tableNames.transactionAction]: TransactionAction;
  }
}
