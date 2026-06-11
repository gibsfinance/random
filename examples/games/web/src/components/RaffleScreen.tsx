import { useState } from 'react'
import * as viem from 'viem'
import { raffleAbi, randomAbi } from '@gibs/games-core'
import { CANONICAL_PERIOD, CANONICAL_THRESHOLD } from '@gibs/raffle'
import type { GameDeployment } from '../config'
import type { ChainData } from '../hooks/useChainData'
import type { RaffleRoundView } from '../model/raffle-rounds'
import { saveSalt, loadSalt, exportBackup, importBackup } from '../model/salts'
import { sendGameTx, nextHeatLocations } from '../tx'
import { publicClientFor } from '../wallet'
import { RaffleVerifyPanel } from './VerifyPanel'
import { AddressLink, Provenance, SourceNote, explorerUrl, formatWhen } from './Meta'
import { StakeInput, parseStake } from './StakeInput'

const commitmentFor = (guess: bigint, salt: viem.Hex, player: viem.Hex): viem.Hex =>
  viem.keccak256(
    viem.encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes32' }, { type: 'address' }], [guess, salt, player]),
  )

const ACTIVE_PHASES = new Set(['filling', 'drawing', 'claiming'])

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
  const [amount, setAmount] = useState('0.1')
  const [threshold, setThreshold] = useState(CANONICAL_THRESHOLD.toString())
  const [guess, setGuess] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [backupShown, setBackupShown] = useState<string>()
  const [importText, setImportText] = useState('')
  const [seeds, setSeeds] = useState<Record<string, viem.Hex>>({})

  const stake = parseStake(amount)
  const thresholdN = /^\d+$/.test(threshold.trim()) ? BigInt(threshold.trim()) : undefined
  const paramsOk = stake !== undefined && thresholdN !== undefined && thresholdN >= 2n
  const canPlay = walletClient !== undefined && trustAcknowledged && !busy

  // a filling round with the same stake+threshold — your ticket would join its pot
  const joinsRound = data.rounds.find(
    (r) => r.phase === 'filling' && r.stake === stake && r.threshold === thresholdN,
  )

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
      if (!paramsOk) throw new Error('set a positive stake and a player threshold of at least 2')
      const g = BigInt(guess)
      if (g < 1n || g > 256n) throw new Error('guess must be between 1 and 256')
      const salt = viem.bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
      const player = walletClient!.account!.address
      const receipt = await sendGameTx(deployment, walletClient!, {
        address: deployment.raffle,
        abi: raffleAbi,
        functionName: 'commit',
        args: [stake!, thresholdN!, CANONICAL_PERIOD, deployment.canonicalSubset, commitmentFor(g, salt, player)],
        value: stake!,
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
      const randomness = (await publicClientFor(deployment.chainId, deployment.rpc).readContract({
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

  const RoundCard = ({ round }: { round: RaffleRoundView }) => (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>
          <span className="tag">{phaseTag(round)}</span>
          {viem.formatEther(round.stake)} per ticket · {round.threshold.toString()} players ·{' '}
          pot {viem.formatEther(round.stake * round.commitCount)}
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
          winner <AddressLink deployment={deployment} address={round.winner!} /> took{' '}
          {viem.formatEther(round.payout!)}
        </p>
      )}
      <Provenance
        deployment={deployment}
        timestamps={data.timestamps}
        items={[
          { label: 'opened', block: round.openedAtBlock },
          { label: 'armed', block: round.armedAtBlock, tx: round.armTx },
          { label: 'drawn', block: round.drawnAtBlock, tx: round.drawTx },
          { label: 'paid', block: round.finalisedAtBlock, tx: round.finaliseTx },
        ]}
      />
      <table>
        <tbody>
          {round.tickets.map((ticket) => {
            const commitWhen = formatWhen(data.timestamps[ticket.committedAtBlock.toString()])
            const commitUrl = ticket.commitTx ? explorerUrl(deployment, 'tx', ticket.commitTx) : undefined
            const revealUrl = ticket.revealTx ? explorerUrl(deployment, 'tx', ticket.revealTx) : undefined
            return (
              <tr key={ticket.ticketId.toString()}>
                <td>#{ticket.ticketId.toString()}</td>
                <td>
                  <AddressLink deployment={deployment} address={ticket.player} />
                  {ticket.mine && <span className="tag ok">you</span>}
                </td>
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
                <td className="card-meta">
                  {commitWhen && <span title={`committed at block ${ticket.committedAtBlock}`}>{commitWhen}</span>}
                  {commitUrl && (
                    <span>
                      {' · '}
                      <a href={commitUrl} target="_blank" rel="noreferrer">
                        commit ↗
                      </a>
                    </span>
                  )}
                  {revealUrl && (
                    <span>
                      {' · '}
                      <a href={revealUrl} target="_blank" rel="noreferrer">
                        reveal ↗
                      </a>
                    </span>
                  )}
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
            )
          })}
        </tbody>
      </table>
      <RaffleVerifyPanel round={round} seed={seeds[round.roundId]} deployment={deployment} />
    </div>
  )

  const liveRounds = data.rounds.filter((r) => ACTIVE_PHASES.has(r.phase))
  const doneRounds = data.rounds.filter((r) => !ACTIVE_PHASES.has(r.phase))
  const paidOut = doneRounds.reduce((sum, r) => sum + (r.payout ?? 0n), 0n)
  const lastDone = doneRounds.at(-1)
  const lastDoneWhen =
    lastDone?.finalisedAtBlock !== undefined
      ? formatWhen(data.timestamps[lastDone.finalisedAtBlock.toString()])
      : undefined

  return (
    <div>
      <div className="card">
        <h3>Play a number</h3>
        <div className="row">
          <StakeInput value={amount} onChange={setAmount} placeholder="ticket price" />
          <label className="threshold-label">
            players
            <input
              type="number"
              min={2}
              max={256}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              style={{ width: '4.2rem' }}
              aria-label="player threshold"
            />
          </label>
          <input
            type="number"
            min={1}
            max={256}
            placeholder="your number 1–256"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            style={{ width: '9rem' }}
          />
          <button onClick={() => void commit()} disabled={!canPlay || guess === '' || !paramsOk}>
            {busy ? 'Sending…' : 'Commit'}
          </button>
          {!walletClient && <span className="muted">connect a wallet to play</span>}
          {walletClient && !trustAcknowledged && <span className="muted">acknowledge the house rules above first</span>}
        </div>
        <p className="muted">
          {amount !== '' && stake === undefined && <span className="bad">enter a positive ticket price · </span>}
          {threshold !== '' && (thresholdN === undefined || thresholdN < 2n) && (
            <span className="bad">threshold must be at least 2 players · </span>
          )}
          tickets with the same price and player count pool into the same round
          {joinsRound && (
            <span className="ok">
              {' '}
              · joins the round filling now ({joinsRound.commitCount.toString()}/{joinsRound.threshold.toString()})
            </span>
          )}
          . The draw fires once the round has its players. Your number stays hidden until you reveal —
          the salt proving it lives in THIS browser; lose it before revealing and the stake is forfeit.
          Keep the backup string safe.
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

      <h2>
        Open rounds
        <SourceNote deployment={deployment} contract={deployment.raffle} contractLabel="Raffle" />
      </h2>
      {liveRounds.length === 0 && <p className="muted">No round on the table — play a number to open one.</p>}
      {[...liveRounds].reverse().map((round) => (
        <RoundCard key={round.roundId} round={round} />
      ))}

      <h2>
        The record
        <SourceNote deployment={deployment} contract={deployment.raffle} contractLabel="Raffle" />
      </h2>
      {doneRounds.length === 0 && <p className="muted">No finished rounds yet.</p>}
      {doneRounds.length > 0 && (
        <details className="history">
          <summary>
            {doneRounds.length} finished round{doneRounds.length === 1 ? '' : 's'} · {viem.formatEther(paidOut)} paid
            out
            {lastDoneWhen && <span className="muted"> · last {lastDoneWhen}</span>}
            <span className="muted history-hint">every one verifiable — open the book</span>
          </summary>
          {[...doneRounds].reverse().map((round) => (
            <RoundCard key={round.roundId} round={round} />
          ))}
        </details>
      )}
    </div>
  )
}
