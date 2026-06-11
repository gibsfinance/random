import { useState } from 'react'
import * as viem from 'viem'
import { coinFlipAbi } from '@gibs/games-core'
import { makePresets } from '@gibs/coinflip'
import type { GameDeployment } from '../config'
import type { ChainData } from '../hooks/useChainData'
import { sendGameTx, nextHeatLocations } from '../tx'
import { CoinFlipVerifyPanel } from './VerifyPanel'
import { Menu } from './Menu'
import { AddressLink, Provenance, SourceNote } from './Meta'

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
  const presets = makePresets(deployment.canonicalSubset)
  const [presetIndex, setPresetIndex] = useState(0)
  const [side, setSide] = useState<0 | 1>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const preset = presets[presetIndex]!

  const canPlay = walletClient !== undefined && trustAcknowledged && !busy

  const enter = async () => {
    if (!walletClient) return
    setBusy(true)
    setError(undefined)
    try {
      // pair when an opposite-side entry waits at this stake (supply heat locations), else queue
      const oppositeWaiting = data.lobby.openEntries.some(
        (e) => e.stake === preset.params.stake && e.side === (side === 0 ? 'tails' : 'heads'),
      )
      const locations = oppositeWaiting ? nextHeatLocations(deployment, data.lobby, data.rounds) : []
      await sendGameTx(deployment, walletClient, {
        address: deployment.coinFlip,
        abi: coinFlipAbi,
        functionName: 'enterAndMatch',
        args: [side, deployment.canonicalSubset, locations],
        value: preset.params.stake,
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

  return (
    <div>
      <div className="card">
        <h3>Call it in the air</h3>
        <div className="row">
          <Menu
            label="stake"
            options={presets.map((p) => p.label)}
            value={presetIndex}
            onChange={setPresetIndex}
          />
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
        {error && <p className="bad">{error}</p>}
      </div>

      <h2>
        Open action
        <SourceNote deployment={deployment} contract={deployment.coinFlip} contractLabel="CoinFlip" />
      </h2>
      {data.lobby.openEntries.length === 0 && (
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

      <h2>
        Flips
        <SourceNote deployment={deployment} contract={deployment.coinFlip} contractLabel="CoinFlip" />
      </h2>
      {data.lobby.flips.length === 0 && <p className="muted">No flips yet.</p>}
      {[...data.lobby.flips].reverse().map((flip) => (
        <div key={flip.flipId} className="card">
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
      ))}
    </div>
  )
}
