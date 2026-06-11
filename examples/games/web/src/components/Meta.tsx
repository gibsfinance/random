import type { ReactNode } from 'react'
import type * as viem from 'viem'
import type { GameDeployment } from '../config'

/** Where the "check it yourself" playbook lives today — the venue's docs on MsgBoard. */
export const MSGBOARD_GAMES_DOCS = 'https://msgboard.xyz/#/games'

export const explorerUrl = (
  deployment: GameDeployment,
  kind: 'tx' | 'address' | 'block',
  value: string,
): string | undefined => (deployment.explorer ? `${deployment.explorer}/${kind}/${value}` : undefined)

/** "Jun 11, 14:32 UTC" — short enough for a card line, full ISO in the title for the pedants. */
export const formatWhen = (unixSeconds?: number): string | undefined => {
  if (unixSeconds === undefined) return undefined
  const d = new Date(unixSeconds * 1000)
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${month} ${d.getUTCDate()}, ${hh}:${mm} UTC`
}

const ExternalLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
)

export type ProvenanceItem = {
  label: string
  block?: bigint
  tx?: viem.Hex
}

/**
 * The receipts-not-promises line under a card: when each step happened (real block
 * timestamps) and the tx + block links that let a player confirm it without trusting us.
 */
export const Provenance = ({
  deployment,
  timestamps,
  items,
}: {
  deployment: GameDeployment
  timestamps: Record<string, number>
  items: ProvenanceItem[]
}) => {
  const shown = items.filter((i) => i.block !== undefined || i.tx !== undefined)
  if (shown.length === 0) return null
  return (
    <div className="card-meta">
      {shown.map((item) => {
        const when = item.block !== undefined ? formatWhen(timestamps[item.block.toString()]) : undefined
        const blockUrl = item.block !== undefined ? explorerUrl(deployment, 'block', item.block.toString()) : undefined
        const txUrl = item.tx ? explorerUrl(deployment, 'tx', item.tx) : undefined
        const iso =
          item.block !== undefined && timestamps[item.block.toString()] !== undefined
            ? new Date(timestamps[item.block.toString()]! * 1000).toISOString()
            : undefined
        return (
          <span key={item.label} className="card-meta-item" title={iso}>
            <span className="card-meta-label">{item.label}</span>
            {when && <span> {when}</span>}
            {item.block !== undefined && (
              <span>
                {' · '}
                {blockUrl ? <ExternalLink href={blockUrl}>block {item.block.toString()}</ExternalLink> : `block ${item.block.toString()}`}
              </span>
            )}
            {item.tx && (
              <span>
                {' · '}
                {txUrl ? <ExternalLink href={txUrl}>tx ↗</ExternalLink> : 'tx'}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

export const AddressLink = ({ deployment, address }: { deployment: GameDeployment; address: viem.Hex }) => {
  const url = explorerUrl(deployment, 'address', address)
  const shortened = `${address.slice(0, 6)}…${address.slice(-4)}`
  return url ? (
    <ExternalLink href={url}>
      <span className="mono">{shortened}</span>
    </ExternalLink>
  ) : (
    <span className="mono">{shortened}</span>
  )
}

/** A small ⓘ that opens a hover/focus popover — for "where does this info come from?". */
export const InfoDot = ({ children }: { children: ReactNode }) => (
  <span className="info-dot">
    <button type="button" className="info-trigger" aria-label="where this information comes from">
      i
    </button>
    <span className="info-pop" role="tooltip">
      {children}
    </span>
  </span>
)

/** The standard provenance note: facts come off the chain, the playbook lives on MsgBoard. */
export const SourceNote = ({
  deployment,
  contract,
  contractLabel,
}: {
  deployment: GameDeployment
  contract: viem.Hex
  contractLabel: string
}) => {
  const url = explorerUrl(deployment, 'address', contract)
  return (
    <InfoDot>
      <strong>Don't take our word for any of this.</strong> Every fact on this card is read live from the{' '}
      {url ? <ExternalLink href={url}>{contractLabel} contract</ExternalLink> : `${contractLabel} contract`} on{' '}
      {deployment.label} — this site adds nothing you can't check. The timestamps and tx links point at the public
      explorer; the how-to for checking a draw yourself is written up{' '}
      <ExternalLink href={MSGBOARD_GAMES_DOCS}>on MsgBoard</ExternalLink> (and the data itself already lives on
      chain).
    </InfoDot>
  )
}
