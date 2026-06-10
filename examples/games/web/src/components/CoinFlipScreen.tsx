import { useState } from 'react'
import * as viem from 'viem'
import { coinFlipAbi } from '@gibs/games-core'
import { makePresets } from '@gibs/coinflip'
import type { GameDeployment } from '../config'
import type { ChainData } from '../hooks/useChainData'
import { sendGameTx, nextHeatLocations } from '../tx'
import { CoinFlipVerifyPanel } from './VerifyPanel'

const short = (a: viem.Hex) => `${a.slice(0, 6)}…${a.slice(-4)}`

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
        <h3>Enter a flip</h3>
        <div className="row">
          <select value={presetIndex} onChange={(e) => setPresetIndex(Number(e.target.value))}>
            {presets.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
          <select value={side} onChange={(e) => setSide(Number(e.target.value) as 0 | 1)}>
            <option value={0}>heads</option>
            <option value={1}>tails</option>
          </select>
          <button onClick={() => void enter()} disabled={!canPlay}>
            {busy ? 'Sending…' : `Enter ${side === 0 ? 'heads' : 'tails'}`}
          </button>
          {!walletClient && <span className="muted">connect a wallet to play</span>}
          {walletClient && !trustAcknowledged && <span className="muted">acknowledge the trust note above first</span>}
        </div>
        {error && <p className="bad">{error}</p>}
      </div>

      <h2>Waiting entries</h2>
      {data.lobby.openEntries.length === 0 && <p className="muted">Nobody is waiting — enter and you'll queue.</p>}
      {data.lobby.openEntries.map((entry) => (
        <div key={entry.id.toString()} className="card row" style={{ justifyContent: 'space-between' }}>
          <span>
            <span className="tag">{entry.side}</span>
            <span className="mono">{short(entry.player)}</span>
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
      ))}

      <h2>Flips</h2>
      {data.lobby.flips.length === 0 && <p className="muted">No flips yet.</p>}
      {[...data.lobby.flips].reverse().map((flip) => (
        <div key={flip.flipId} className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              <span className="tag">heads</span>
              <span className="mono">{short(flip.heads)}</span>
              <span className="muted"> vs </span>
              <span className="tag">tails</span>
              <span className="mono">{short(flip.tails)}</span>
              {flip.mine && <span className="tag ok">you</span>}
            </span>
            <span>
              {flip.status === 'pending' ? (
                <span className="muted">waiting for the validators' cast (12-block window)…</span>
              ) : (
                <span className="ok">
                  {flip.winningSide} wins — {short(flip.winner!)} takes {viem.formatEther(flip.stake * 2n)}
                </span>
              )}
            </span>
          </div>
          <CoinFlipVerifyPanel flip={flip} />
        </div>
      ))}
    </div>
  )
}
