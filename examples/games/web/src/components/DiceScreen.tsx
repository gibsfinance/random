import { useState } from 'react'
import * as viem from 'viem'
import { dice, diceMultiplierX100, type DiceParams } from '@gibs/msgboard-games'
import type { GameDeployment } from '../config'
import { useSession, type RoundRecord } from '../hooks/useSession'
import { StakeInput, parseStake } from './StakeInput'
import { TurnTiming } from './TurnTiming'

const HUNDREDTHS = 100n

/** target is a roll-under win chance in percent (the dice module's targetX100 is hundredths-of-a-percent). */
const MIN_TARGET_PCT = 0.01
const MAX_TARGET_PCT = 98.99

const pctToTargetX100 = (pct: number): bigint => BigInt(Math.round(pct * 100))
const fmtMult = (x100: bigint): string => `${(Number(x100) / 100).toFixed(2)}x`

/**
 * Reference OFF-CHAIN session-game screen (Dice). The template the other session games follow:
 *   1. `useSession({ game, walletClient, chainId })` drives the HouseSession.
 *   2. a params UI (here: target/win-chance) → `session.play(stake, params)`.
 *   3. a result/receipt + history list in the CoinFlip/Raffle visual style.
 * Swapping `dice` for `limbo`/`plinko`/`keno` + their params UI is the whole job for the next four.
 */
const RoundReceipt = ({ record }: { record: RoundRecord }) => (
  <div className="card">
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span>
        <span className="tag">round {record.round}</span>
        {viem.formatEther(record.stake)} staked
        {record.win ? (
          <span className="tag ok">won {fmtMult(record.multiplierX100)}</span>
        ) : (
          <span className="tag">lost</span>
        )}
      </span>
      <span className={record.playerDelta >= 0n ? 'ok' : 'bad'}>
        {record.playerDelta >= 0n ? '+' : ''}
        {viem.formatEther(record.playerDelta)}
      </span>
    </div>
    <p className="card-meta muted">
      balance {viem.formatEther(record.balancePlayer)} · co-signed by both parties
    </p>
    {record.timing && (
      <p className="card-meta muted">
        <TurnTiming timing={record.timing} />
      </p>
    )}
  </div>
)

export const DiceScreen = ({
  deployment,
  walletClient,
  trustAcknowledged,
  myAddress,
}: {
  deployment: GameDeployment
  walletClient?: viem.WalletClient
  trustAcknowledged: boolean
  myAddress?: viem.Hex
}) => {
  const [amount, setAmount] = useState('0.1')
  const [targetPct, setTargetPct] = useState('50')

  const session = useSession<DiceParams>({ game: dice, walletClient, chainId: deployment.chainId })

  const stake = parseStake(amount)
  const pct = Number(targetPct)
  const targetOk = Number.isFinite(pct) && pct >= MIN_TARGET_PCT && pct <= MAX_TARGET_PCT
  const targetX100 = targetOk ? pctToTargetX100(pct) : undefined
  const multiplierX100 = targetX100 !== undefined ? diceMultiplierX100(targetX100) : undefined
  const potentialWin =
    stake !== undefined && multiplierX100 !== undefined
      ? (stake * multiplierX100) / HUNDREDTHS - stake
      : undefined

  const busy = session.status === 'opening' || session.status === 'playing'
  const canOpen = walletClient !== undefined && trustAcknowledged && !busy
  const canRoll = session.ready && !busy && stake !== undefined && targetX100 !== undefined

  const roll = () => {
    if (stake === undefined || targetX100 === undefined) return
    void session.play(stake, { targetX100 })
  }

  const wins = session.history.filter((r) => r.win).length
  const taken = session.history.reduce((sum, r) => sum + r.playerDelta, 0n)

  return (
    <div>
      <div className="card">
        <h3>Roll under</h3>
        <div className="row">
          <StakeInput value={amount} onChange={setAmount} />
          <label className="threshold-label">
            win chance %
            <input
              type="number"
              min={MIN_TARGET_PCT}
              max={MAX_TARGET_PCT}
              step={0.5}
              value={targetPct}
              onChange={(e) => setTargetPct(e.target.value)}
              style={{ width: '5.5rem' }}
              aria-label="win chance percent"
            />
          </label>
          {session.ready ? (
            <button onClick={roll} disabled={!canRoll}>
              {session.status === 'playing' ? 'Rolling…' : 'Roll'}
            </button>
          ) : (
            <button onClick={() => void session.start()} disabled={!canOpen}>
              {session.status === 'opening' ? 'Opening…' : 'Open table'}
            </button>
          )}
          {!walletClient && <span className="muted">connect a wallet to play</span>}
          {walletClient && !trustAcknowledged && (
            <span className="muted">acknowledge the house rules above first</span>
          )}
        </div>
        <p className="muted">
          {amount !== '' && stake === undefined && <span className="bad">enter a positive amount · </span>}
          {targetPct !== '' && !targetOk && (
            <span className="bad">win chance must be between {MIN_TARGET_PCT}% and {MAX_TARGET_PCT}% · </span>
          )}
          roll under your number to win
          {multiplierX100 !== undefined && (
            <span className="ok"> · pays {fmtMult(multiplierX100)}</span>
          )}
          {potentialWin !== undefined && potentialWin > 0n && (
            <span className="muted"> (+{viem.formatEther(potentialWin)} on a win)</span>
          )}
          . Every round is co-signed off-chain by you and the house over MsgBoard — no gas per roll,
          and the server seed was committed before you opened the table.
        </p>
        {session.commit && (
          <p className="card-meta muted">
            server-seed commit <span className="mono">{session.commit.slice(0, 10)}…</span>
            {session.balances && (
              <>
                {' · '}your balance {viem.formatEther(session.balances.player)} · {session.roundsLeft} rolls left
              </>
            )}
          </p>
        )}
        {session.error && <p className="bad">{session.error}</p>}
      </div>

      <h2>This table</h2>
      {!session.ready && session.history.length === 0 && (
        <p className="muted">No table open — set your stake and odds, then open one to start rolling.</p>
      )}
      {[...session.history].reverse().map((record) => (
        <RoundReceipt key={record.round} record={record} />
      ))}

      {myAddress && session.history.length > 0 && (
        <>
          <h2>Your book</h2>
          <details className="history" open>
            <summary>
              {session.history.length} roll{session.history.length === 1 ? '' : 's'}
              <span className="muted">
                {' '}
                · {wins}/{session.history.length} won · {viem.formatEther(taken)} net
              </span>
            </summary>
            {[...session.history].reverse().map((record) => (
              <RoundReceipt key={record.round} record={record} />
            ))}
          </details>
        </>
      )}
    </div>
  )
}
