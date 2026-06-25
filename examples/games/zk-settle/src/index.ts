// @gibs/zk-settle — Track 2 ZK privacy (Noir) off-chain prove/verify.
// Public API filled out incrementally per task (final surface in Task 6).
export const PACKAGE = '@gibs/zk-settle'

export { compileCircuit, type Compiled } from './compile'
export { prove, type Proof } from './prove'
export { verify } from './verify'
export { execute, type AbiValue } from './execute'
export { roundRandomPreimage } from './abiEncode'
export { GAME_DICE, GAME_LIMBO } from './gameId'
export { pedersenCommit, type PedersenPoint } from './pedersen'
export {
  diceOutcome,
  diceSettleCommitments,
  commitmentsToPublicInputs,
  diceSettleInputs,
  type DiceSettleAmounts,
  type DiceSettleBlindings,
  type DiceSettleWitness,
  type DiceSettleCommitments,
} from './diceSettle'
