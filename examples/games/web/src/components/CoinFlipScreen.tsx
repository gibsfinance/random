import { useState } from 'react'
import * as viem from 'viem'
import { coinFlipAbi } from '@gibs/games-core'
import type { GameDeployment } from '../config'
import type { ChainData } from '../hooks/useChainData'
import type { FlipView } from '../model/coinflip-lobby'
import { sendGameTx, nextHeatLocations } from '../tx'
import { CoinFlipVerifyPanel } from './VerifyPanel'
import { AddressLink, Provenance, SourceNote, formatWhen } from './Meta'
import { StakeInput, parseStake } from './StakeInput'

export const CoinFlipScreen = ({
  deployment,
  data,
  walletClient,
  trustAcknowledged,
}: {
  deployment: GameDeployment
  data: ChainData
  walletClient?: viem.WalletClient
  trustAcknowledged: boolean
}) => {
  const [amount, setAmount] = useState('0.1')
  const [side, setSide] = useState<0 | 1>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const stake = parseStake(amount)

  const canPlay = walletClient !== undefined && trustAcknowledged && !busy && stake !== undefined

  const enter = async () => {
    if (!walletClient || stake === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      // pair when an opposite-side entry waits at this exact stake (supply heat locations), else queue
      const oppositeWaiting = data.lobby.openEntries.some(
        (e) => e.stake === stake && e.side === (side === 0 ? 'tails' : 'heads'),
      )
      const locations = oppositeWaiting ? nextHeatLocations(deployment, data.lobby, data.rounds) : []
      await sendGameTx(deployment, walletClient, {
        address: deployment.coinFlip,
        abi: coinFlipAbi,
        functionName: 'enterAndMatch',
        args: [side, deployment.canonicalSubset, locations],
        value: stake,
      })
      data.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (id: bigint) => {
    if (!walletClient) return
    setBusy(true)
    setError(undefined)
    try {
      await sendGameTx(deployment, walletClient, {
        address: deployment.coinFlip,
        abi: coinFlipAbi,
        functionName: 'cancel',
        args: [id],
      })
      data.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const matchableNow =
    stake !== undefined &&
    data.lobby.openEntries.some((e) => e.stake === stake && e.side === (side === 0 ? 'tails' : 'heads'))

  const FlipCard = ({ flip }: { flip: FlipView }) => (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>
          <span className="tag">heads</span>
          <AddressLink deployment={deployment} address={flip.heads} />
          <span className="muted"> vs </span>
          <span className="tag">tails</span>
          <AddressLink deployment={deployment} address={flip.tails} />
          {flip.mine && <span className="tag ok">you</span>}
        </span>
        <span>
          {flip.status === 'pending' ? (
            <span className="muted flipping"><span className="coin" />waiting for the validators' cast…</span>
          ) : (
            <span className="ok">
              {flip.winningSide} wins — <AddressLink deployment={deployment} address={flip.winner!} /> takes{' '}
              {viem.formatEther(flip.stake * 2n)}
            </span>
          )}
        </span>
      </div>
      <Provenance
        deployment={deployment}
        timestamps={data.timestamps}
        items={[
          { label: 'paired', block: flip.pairedAtBlock, tx: flip.pairTx },
          { label: 'settled', block: flip.settledAtBlock, tx: flip.settleTx },
        ]}
      />
      <CoinFlipVerifyPanel flip={flip} deployment={deployment} />
    </div>
  )

  const pending = data.lobby.flips.filter((f) => f.status === 'pending')
  const settled = data.lobby.flips.filter((f) => f.status === 'settled')
  const settledPot = settled.reduce((sum, f) => sum + f.stake * 2n, 0n)
  const lastSettled = settled.at(-1)
  const lastSettledWhen =
    lastSettled?.settledAtBlock !== undefined
      ? formatWhen(data.timestamps[lastSettled.settledAtBlock.toString()])
      : undefined

  return (
    <div>
      <div className="card">
        <h3>Call it in the air</h3>
        <div className="row">
          <StakeInput value={amount} onChange={setAmount} />
          <span className="side-picker">
            <button type="button" className={side === 0 ? 'sel-heads' : ''} onClick={() => setSide(0)}>
              heads
            </button>
            <button type="button" className={side === 1 ? 'sel-tails' : ''} onClick={() => setSide(1)}>
              tails
            </button>
          </span>
          <button onClick={() => void enter()} disabled={!canPlay}>
            {busy ? 'Sending…' : `Enter ${side === 0 ? 'heads' : 'tails'}`}
          </button>
          {!walletClient && <span className="muted">connect a wallet to play</span>}
          {walletClient && !trustAcknowledged && <span className="muted">acknowledge the house rules above first</span>}
        </div>
        <p className="muted">
          {amount !== '' && stake === undefined && <span className="bad">enter a positive amount · </span>}
          flips pair at the <em>exact same</em> stake — match a waiting entry to flip instantly
          {matchableNow && <span className="ok"> · an opponent is waiting at this stake right now</span>}
        </p>
        {error && <p className="bad">{error}</p>}
      </div>

      <h2>
        Open action
        <SourceNote deployment={deployment} contract={deployment.coinFlip} contractLabel="CoinFlip" />
      </h2>
      {data.lobby.openEntries.length === 0 && pending.length === 0 && (
        <p className="muted">Nobody's at the table — your entry opens the action.</p>
      )}
      {data.lobby.openEntries.map((entry) => (
        <div key={entry.id.toString()} className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              <span className="tag">{entry.side}</span>
              <AddressLink deployment={deployment} address={entry.player} />
              {entry.mine && <span className="tag ok">you</span>}
            </span>
            <span className="row">
              <span>{viem.formatEther(entry.stake)} staked</span>
              {entry.mine && (
                <button className="danger" onClick={() => void cancel(entry.id)} disabled={busy}>
                  Cancel
                </button>
              )}
            </span>
          </div>
          <Provenance
            deployment={deployment}
            timestamps={data.timestamps}
            items={[{ label: 'entered', block: entry.enteredAtBlock, tx: entry.enterTx }]}
          />
        </div>
      ))}
      {[...pending].reverse().map((flip) => (
        <FlipCard key={flip.flipId} flip={flip} />
      ))}

      <h2>
        The record
        <SourceNote deployment={deployment} contract={deployment.coinFlip} contractLabel="CoinFlip" />
      </h2>
      {settled.length === 0 && <p className="muted">No settled flips yet.</p>}
      {settled.length > 0 && (
        <details className="history">
          <summary>
            {settled.length} settled flip{settled.length === 1 ? '' : 's'} · {viem.formatEther(settledPot)} paid out
            {lastSettledWhen && <span className="muted"> · last {lastSettledWhen}</span>}
            <span className="muted history-hint">every one verifiable — open the book</span>
          </summary>
          {[...settled].reverse().map((flip) => (
            <FlipCard key={flip.flipId} flip={flip} />
          ))}
        </details>
      )}
    </div>
  )
}
