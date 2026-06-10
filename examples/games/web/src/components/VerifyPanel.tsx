import * as viem from 'viem'
import { verifyCoinFlip, verifyRaffle } from '../model/verify'
import type { FlipView } from '../model/coinflip-lobby'
import type { RaffleRoundView } from '../model/raffle-rounds'

/**
 * The product centerpiece: the cross-layer parity assertion as UI. The off-chain settle —
 * the exact code the e2e suite proved equals the contract — recomputes the winner from the
 * seed and entries, and the panel says MATCHES or MISMATCH. A player never has to take the
 * contract's word for it.
 */

const Badge = ({ matches }: { matches: boolean }) =>
  matches ? <span className="ok">✓ MATCHES the on-chain result</span> : <span className="bad">✗ MISMATCH — do not trust this round</span>

export const CoinFlipVerifyPanel = ({ flip }: { flip: FlipView }) => {
  if (flip.status !== 'settled' || !flip.seed || !flip.winner) return null
  const verification = verifyCoinFlip({
    seed: flip.seed,
    heads: flip.heads,
    tails: flip.tails,
    onChainWinner: flip.winner,
  })
  return (
    <div className="card">
      <h3>Verify this draw yourself</h3>
      <table>
        <tbody>
          <tr>
            <td className="muted">seed (keccak of the validators' secrets)</td>
            <td className="mono">{flip.seed}</td>
          </tr>
          <tr>
            <td className="muted">off-chain: seed is {verification.winningSide === 'heads' ? 'even' : 'odd'} →</td>
            <td className="mono">
              {verification.winningSide} — {verification.offChainWinner}
            </td>
          </tr>
          <tr>
            <td className="muted">on-chain winner</td>
            <td className="mono">{flip.winner}</td>
          </tr>
        </tbody>
      </table>
      <Badge matches={verification.matches} />
    </div>
  )
}

export const RaffleVerifyPanel = ({ round, seed }: { round: RaffleRoundView; seed?: viem.Hex }) => {
  if (!seed || round.draw === undefined) return null
  const entries = round.tickets
    .filter((t) => !t.cancelled)
    .map((t) => ({
      ticketId: t.ticketId,
      player: t.player,
      guess: t.guess ?? 0n,
      committedAtBlock: t.committedAtBlock,
      revealed: t.revealed,
    }))
  const onChainBest = round.tickets.find((t) => t.leading)?.ticketId ?? 0n
  const verification = verifyRaffle({ seed, entries, onChainBestTicket: onChainBest })
  return (
    <div className="card">
      <h3>Verify this draw yourself</h3>
      <table>
        <tbody>
          <tr>
            <td className="muted">seed</td>
            <td className="mono">{seed}</td>
          </tr>
          <tr>
            <td className="muted">off-chain draw: 1 + (seed mod 256)</td>
            <td>{verification.draw.toString()}</td>
          </tr>
          <tr>
            <td className="muted">off-chain winning ticket (closest revealed guess)</td>
            <td>{verification.offChainTicket?.toString() ?? 'none revealed yet'}</td>
          </tr>
          <tr>
            <td className="muted">on-chain leading ticket</td>
            <td>{onChainBest === 0n ? 'none yet' : onChainBest.toString()}</td>
          </tr>
        </tbody>
      </table>
      <Badge matches={verification.matches} />
    </div>
  )
}
