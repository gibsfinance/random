import { useState } from 'react'
import * as viem from 'viem'
import { raffleAbi, randomAbi } from '@gibs/games-core'
import { makePresets } from '@gibs/raffle'
import type { GameDeployment } from '../config'
import type { ChainData } from '../hooks/useChainData'
import type { RaffleRoundView } from '../model/raffle-rounds'
import { saveSalt, loadSalt, exportBackup, importBackup } from '../model/salts'
import { sendGameTx, nextHeatLocations } from '../tx'
import { publicClientFor } from '../wallet'
import { RaffleVerifyPanel } from './VerifyPanel'

const short = (a: viem.Hex) => `${a.slice(0, 6)}…${a.slice(-4)}`

const commitmentFor = (guess: bigint, salt: viem.Hex, player: viem.Hex): viem.Hex =>
  viem.keccak256(
    viem.encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes32' }, { type: 'address' }], [guess, salt, player]),
  )

export const RaffleScreen = ({
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
  const [guess, setGuess] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [backupShown, setBackupShown] = useState<string>()
  const [importText, setImportText] = useState('')
  const [seeds, setSeeds] = useState<Record<string, viem.Hex>>({})
  const preset = presets[presetIndex]!
  const canPlay = walletClient !== undefined && trustAcknowledged && !busy

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await work()
      data.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const commit = () =>
    run(async () => {
      const g = BigInt(guess)
      if (g < 1n || g > 256n) throw new Error('guess must be between 1 and 256')
      const salt = viem.bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
      const player = walletClient!.account!.address
      const receipt = await sendGameTx(deployment, walletClient!, {
        address: deployment.raffle,
        abi: raffleAbi,
        functionName: 'commit',
        args: [preset.params.stake, preset.params.threshold, preset.params.period, deployment.canonicalSubset, commitmentFor(g, salt, player)],
        value: preset.params.stake,
      })
      const committed = viem.parseEventLogs({ abi: raffleAbi, eventName: 'Committed', logs: receipt.logs })[0]
        ?.args as { ticketId?: bigint } | undefined
      if (committed?.ticketId === undefined) throw new Error('no Committed event in the receipt')
      saveSalt(localStorage, deployment.chainId, deployment.raffle, committed.ticketId, { guess: g, salt })
      setBackupShown(exportBackup(localStorage, deployment.chainId, deployment.raffle))
      setGuess('')
    })

  const arm = (round: RaffleRoundView) =>
    run(async () => {
      await sendGameTx(deployment, walletClient!, {
        address: deployment.raffle,
        abi: raffleAbi,
        functionName: 'arm',
        args: [round.roundId, nextHeatLocations(deployment, data.lobby, data.rounds)],
      })
    })

  const reveal = (ticketId: bigint) =>
    run(async () => {
      const record = loadSalt(localStorage, deployment.chainId, deployment.raffle, ticketId)
      if (!record) throw new Error(`no stored salt for ticket ${ticketId} — paste your backup below`)
      await sendGameTx(deployment, walletClient!, {
        address: deployment.raffle,
        abi: raffleAbi,
        functionName: 'reveal',
        args: [ticketId, record.guess, record.salt],
      })
    })

  const finalise = (round: RaffleRoundView) =>
    run(async () => {
      await sendGameTx(deployment, walletClient!, {
        address: deployment.raffle,
        abi: raffleAbi,
        functionName: 'finalise',
        args: [round.roundId],
      })
    })

  const refund = (ticketId: bigint) =>
    run(async () => {
      await sendGameTx(deployment, walletClient!, {
        address: deployment.raffle,
        abi: raffleAbi,
        functionName: 'refundTicket',
        args: [ticketId],
      })
    })

  const loadSeed = (round: RaffleRoundView) =>
    run(async () => {
      if (!round.key) throw new Error('round has no request key yet')
      const randomness = (await publicClientFor(deployment.chainId).readContract({
        address: deployment.random,
        abi: randomAbi,
        functionName: 'randomness',
        args: [round.key],
      })) as { seed: viem.Hex }
      if (randomness.seed === viem.padHex('0x0', { size: 32 })) throw new Error('seed not finalized yet')
      setSeeds((s) => ({ ...s, [round.roundId]: randomness.seed }))
    })

  const phaseTag = (round: RaffleRoundView) => {
    switch (round.phase) {
      case 'filling':
        return `filling ${round.commitCount}/${round.threshold}`
      case 'drawing':
        return round.staleRefundCandidate ? 'stale — refunds open' : 'waiting for the cast'
      case 'claiming':
        return round.revealOpen ? `revealing — ${round.blocksUntilClose} blocks left` : 'reveal closed — finalise'
      case 'paid':
        return 'paid'
      case 'no-contest':
        return 'no contest — pot to validators'
    }
  }

  return (
    <div>
      <div className="card">
        <h3>Commit a hidden guess</h3>
        <div className="row">
          <select value={presetIndex} onChange={(e) => setPresetIndex(Number(e.target.value))}>
            {presets.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={256}
            placeholder="guess 1–256"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            style={{ width: '8rem' }}
          />
          <button onClick={() => void commit()} disabled={!canPlay || guess === ''}>
            {busy ? 'Sending…' : 'Commit'}
          </button>
          {!walletClient && <span className="muted">connect a wallet to play</span>}
          {walletClient && !trustAcknowledged && <span className="muted">acknowledge the trust note above first</span>}
        </div>
        <p className="muted">
          Your guess stays hidden until you reveal it. The salt that proves your guess is stored in THIS
          browser — if you lose it before revealing, your stake is forfeited to the pot. Keep the backup
          string safe.
        </p>
        {backupShown && (
          <div className="banner">
            <strong>Backup your salts now:</strong>
            <p className="mono">{backupShown}</p>
            <button className="secondary" onClick={() => void navigator.clipboard.writeText(backupShown)}>
              Copy backup
            </button>
          </div>
        )}
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <input
            placeholder="paste a backup string to restore salts"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="secondary"
            disabled={importText === ''}
            onClick={() => {
              try {
                const count = importBackup(localStorage, importText.trim())
                setError(undefined)
                setImportText('')
                setBackupShown(undefined)
                alert(`${count} ticket salt(s) restored`)
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            Import backup
          </button>
        </div>
        {error && <p className="bad">{error}</p>}
      </div>

      <h2>Rounds</h2>
      {data.rounds.length === 0 && <p className="muted">No rounds yet — commit a guess to open one.</p>}
      {[...data.rounds].reverse().map((round) => (
        <div key={round.roundId} className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              <span className="tag">{phaseTag(round)}</span>
              {viem.formatEther(round.stake)} per ticket · pot {viem.formatEther(round.stake * round.commitCount)}
              {round.draw !== undefined && <span className="tag">draw: {round.draw.toString()}</span>}
            </span>
            <span className="row">
              {round.phase === 'filling' && round.commitCount >= round.threshold && (
                <button className="secondary" onClick={() => void arm(round)} disabled={!canPlay}>
                  Arm (heat the validators)
                </button>
              )}
              {round.phase === 'claiming' && round.finaliseOpen && (
                <button onClick={() => void finalise(round)} disabled={!canPlay}>
                  Finalise
                </button>
              )}
              {round.phase === 'claiming' && !seeds[round.roundId] && (
                <button className="secondary" onClick={() => void loadSeed(round)} disabled={busy}>
                  Load seed to verify
                </button>
              )}
            </span>
          </div>
          {round.phase === 'paid' && (
            <p className="ok">
              winner {short(round.winner!)} took {viem.formatEther(round.payout!)}
            </p>
          )}
          <table>
            <tbody>
              {round.tickets.map((ticket) => (
                <tr key={ticket.ticketId.toString()}>
                  <td>#{ticket.ticketId.toString()}</td>
                  <td className="mono">{short(ticket.player)}</td>
                  <td>
                    {ticket.cancelled && <span className="muted">cancelled</span>}
                    {ticket.refunded && <span className="muted">refunded</span>}
                    {ticket.revealed && (
                      <span>
                        guess {ticket.guess!.toString()} (distance {ticket.distance!.toString()})
                        {ticket.leading && <span className="tag ok">leading</span>}
                      </span>
                    )}
                    {!ticket.revealed && !ticket.cancelled && !ticket.refunded && <span className="muted">hidden</span>}
                  </td>
                  <td>
                    {ticket.mine && round.phase === 'claiming' && round.revealOpen && !ticket.revealed && (
                      <button onClick={() => void reveal(ticket.ticketId)} disabled={!canPlay}>
                        Reveal
                      </button>
                    )}
                    {ticket.mine && round.staleRefundCandidate && !ticket.refunded && (
                      <button className="danger" onClick={() => void refund(ticket.ticketId)} disabled={!canPlay}>
                        Refund stake
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <RaffleVerifyPanel round={round} seed={seeds[round.roundId]} />
        </div>
      ))}
    </div>
  )
}
