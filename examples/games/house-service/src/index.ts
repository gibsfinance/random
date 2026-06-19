/**
 * @gibs/games-house-service — public surface.
 *
 * Re-exports the public API: startHouse, handleOpenRequest, handleRoundRequest (pure units),
 * faucetMint, and relevant types.
 */
export {
  handleOpenRequest,
  handleRoundRequest,
  startHouse,
  type OpenRequest,
  type Limits,
  type OpenCtx,
  type GrantEnvelope,
  type OpenGrantEnvelope,
  type OpenDeclineEnvelope,
  type RoundReq,
  type RoundCtx,
  type RoundResult,
  type HouseCfg,
} from './houseLoop'

export { faucetMint, type FaucetWalletClient } from './faucet'
