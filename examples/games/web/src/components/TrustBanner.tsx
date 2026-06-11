import { useState } from 'react'
import type { GameDeployment } from '../config'

const ackKey = (chainId: number) => `msgboard-games:${chainId}:trust-acknowledged`

export const isTrustAcknowledged = (chainId: number) => localStorage.getItem(ackKey(chainId)) === 'true'

/**
 * The disclosed trust assumption as "House Rules" — a collapsible section, open by default
 * until acknowledged and re-revealable forever after (the spec's open item: any real
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
  const [open, setOpen] = useState(() => !isTrustAcknowledged(deployment.chainId))

  return (
    <details className="house-rules" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        House rules — who do you have to trust?
        {acknowledged && <span className="rules-ack">✓ acknowledged</span>}
      </summary>
      <div className="body">
        <p>
          Every draw is decided by secrets held by the validators below — never by the house, the other
          player, or this website. <strong>A draw is safe as long as at least one of the chosen validators
          is honest.</strong> If every validator colluded, they could grind the result; if even one is
          honest, nobody can. The contracts pin the validator set when you enter, so it cannot be swapped
          afterwards — and every settled round below comes with a receipt you can verify yourself. Don't
          trust this set? Anyone can ink secrets and contribute randomness — a player, or even the house —
          and if the honest one is <em>you</em>, the draw is safe for you by construction.
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
        {!acknowledged && (
          <button
            onClick={() => {
              localStorage.setItem(ackKey(deployment.chainId), 'true')
              setAcknowledged(true)
              setOpen(false)
              onAcknowledged()
            }}
          >
            I understand the trust assumption
          </button>
        )}
      </div>
    </details>
  )
}
