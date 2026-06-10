import { useState } from 'react'
import type { GameDeployment } from '../config'

const ackKey = (chainId: number) => `gibs-games:${chainId}:trust-acknowledged`

export const isTrustAcknowledged = (chainId: number) => localStorage.getItem(ackKey(chainId)) === 'true'

/**
 * The disclosed trust assumption, acknowledge-to-play (the spec's open item: any real
 * player-facing surface must show it). Entering either game stays disabled until acknowledged.
 */
export const TrustBanner = ({
  deployment,
  onAcknowledged,
}: {
  deployment: GameDeployment
  onAcknowledged: () => void
}) => {
  const [acknowledged, setAcknowledged] = useState(() => isTrustAcknowledged(deployment.chainId))
  if (acknowledged) return null
  return (
    <div className="banner">
      <h3>Before you play: who do you have to trust?</h3>
      <p>
        Every draw on this platform is decided by secrets held by the validators below — never by the
        house, the other player, or this website. <strong>A draw is safe as long as at least one of the
        chosen validators is honest.</strong> If every validator colluded, they could grind the result;
        if even one is honest, nobody can. The contracts pin the validator set when you enter, so it
        cannot be swapped afterwards.
      </p>
      <ul>
        {deployment.canonicalSubset.map((v) => (
          <li key={v} className="mono">
            {deployment.explorer ? (
              <a href={`${deployment.explorer}/address/${v}`} target="_blank" rel="noreferrer">
                {v}
              </a>
            ) : (
              v
            )}
          </li>
        ))}
      </ul>
      <button
        onClick={() => {
          localStorage.setItem(ackKey(deployment.chainId), 'true')
          setAcknowledged(true)
          onAcknowledged()
        }}
      >
        I understand the trust assumption
      </button>
    </div>
  )
}
