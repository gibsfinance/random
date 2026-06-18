import { useState } from 'react'
import type { GameDeployment } from '../config'
import { InfoDot } from './Meta'

const ackKey = (chainId: number) => `msgboard-games:${chainId}:trust-acknowledged`

export const isTrustAcknowledged = (chainId: number) => localStorage.getItem(ackKey(chainId)) === 'true'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/**
 * The disclosed trust assumption, compacted to a single "provably fair" strip: the load-bearing
 * sentence is always visible; the full explanation + the validator set (shortened, linked) live
 * behind the info dot so they don't stack a wall of text above the table. Entering a game stays
 * disabled until the player taps "Got it" (the spec's open item: the assumption must be surfaced).
 */
export const TrustBanner = ({
  deployment,
  onAcknowledged,
}: {
  deployment: GameDeployment
  onAcknowledged: () => void
}) => {
  const [acknowledged, setAcknowledged] = useState(() => isTrustAcknowledged(deployment.chainId))
  const n = deployment.canonicalSubset.length

  const acknowledge = () => {
    localStorage.setItem(ackKey(deployment.chainId), 'true')
    setAcknowledged(true)
    onAcknowledged()
  }

  return (
    <div className="trust-strip">
      <span className="trust-seal" aria-hidden>
        ✦
      </span>
      <span className="trust-line">
        Provably fair — a draw is safe as long as <strong>one</strong> of the {n} validators is honest
        <InfoDot label="how the fairness works">
          <p>
            Every draw is decided by secrets held by the validators below — never by the house, the other
            player, or this website. <strong>One honest validator beats any cartel.</strong> The contracts pin
            the validator set when you enter, so it can't be swapped afterwards, and every settled round below
            comes with a receipt you can verify yourself. Don't trust this set? Anyone can ink secrets and
            contribute randomness — even you — and if the honest one is <em>you</em>, the draw is safe for you
            by construction.
          </p>
          <p className="trust-validators">
            Validators:{' '}
            {deployment.canonicalSubset.map((v, i) => (
              <span key={v}>
                {i > 0 && ' · '}
                {deployment.explorer ? (
                  <a className="mono" href={`${deployment.explorer}/address/${v}`} target="_blank" rel="noreferrer">
                    {short(v)}
                  </a>
                ) : (
                  <span className="mono">{short(v)}</span>
                )}
              </span>
            ))}
          </p>
        </InfoDot>
      </span>
      {acknowledged ? (
        <span className="rules-ack">✓ understood</span>
      ) : (
        <button className="secondary trust-ack" onClick={acknowledge}>
          Got it
        </button>
      )}
    </div>
  )
}
