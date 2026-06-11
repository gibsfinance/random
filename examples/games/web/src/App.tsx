import { useState } from 'react'
import * as viem from 'viem'
import { deployments } from './config'
import { useWallet } from './hooks/useWallet'
import { useChainData } from './hooks/useChainData'
import { TrustBanner, isTrustAcknowledged } from './components/TrustBanner'
import { CoinFlipScreen } from './components/CoinFlipScreen'
import { RaffleScreen } from './components/RaffleScreen'
import { Menu } from './components/Menu'

const short = (a?: viem.Hex) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

export const App = () => {
  const [deploymentIndex, setDeploymentIndex] = useState(0)
  const [tab, setTab] = useState<'coinflip' | 'raffle'>('coinflip')
  const deployment = deployments[deploymentIndex]
  const wallet = useWallet(deployment?.chainId ?? 31337)
  const data = useChainData(deployment ?? null, wallet.address)
  const [trustAcknowledged, setTrustAcknowledged] = useState(() =>
    deployment ? isTrustAcknowledged(deployment.chainId) : false,
  )

  if (!deployment) {
    return (
      <div>
        <h1>MsgBoard Games</h1>
        <div className="banner">
          No deployment configured. For local play run <span className="mono">pnpm dev:seed</span> with anvil up,
          then reload. For PulseChain testnet v4, fill <span className="mono">src/config.ts</span> from the parity
          gate's run log.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="marquee">
        <div>
          <h1>
            MsgBoard <span className="gold">Games</span>
          </h1>
          <div className="strapline">the back room where the books stay open</div>
        </div>
        <div className="row">
          <Menu
            label="chain"
            options={deployments.map((d) => d.label)}
            value={deploymentIndex}
            onChange={setDeploymentIndex}
          />
          {wallet.address ? (
            <>
              <span className="tag mono">{short(wallet.address)}</span>
              <button className="secondary" onClick={wallet.disconnect}>
                Disconnect
              </button>
            </>
          ) : (
            <button onClick={() => void wallet.connect()} disabled={wallet.connecting}>
              {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
            </button>
          )}
        </div>
      </div>
      <p className="hero-pitch">
        Coin flips and a numbers game where <strong>nobody can cook the draw</strong> — not the house, not the
        player across the table, not even{' '}
        <a href="https://msgboard.xyz" target="_blank" rel="noreferrer">
          MsgBoard
        </a>
        , the platform this venue runs on. Every result comes from validator secrets locked in before you play, and
        your own browser re-runs the count on every settled game. A trust-me casino asks you to believe the odds;
        this table hands you the books.
      </p>
      <div className="howit">
        <div className="howit-step">
          <span className="howit-num">1</span>
          <strong>Secrets go in before the action.</strong> Validators ink hashed secrets on chain ahead of every
          game, and your entry pins that exact set — no late swaps, no reshuffles.
        </div>
        <div className="howit-step">
          <span className="howit-num">2</span>
          <strong>The reveal is the draw.</strong> The seed is the hash of all the validators' revealed secrets
          together. If even one of them is honest, no cartel — house included — can steer the result.
        </div>
        <div className="howit-step">
          <span className="howit-num">3</span>
          <strong>You keep the books.</strong> Your browser recomputes every outcome from the seed and stamps the
          slip <em>on the level</em> — or calls it crooked. Don't trust the table; audit it.
        </div>
      </div>
      {wallet.error && <div className="banner bad">{wallet.error}</div>}
      {data.error && <div className="banner bad">chain read failed: {data.error}</div>}
      <div className="tabs">
        <button className={tab === 'coinflip' ? 'tab active' : 'tab'} onClick={() => setTab('coinflip')}>
          <span className="coin" /> Coin Flip
        </button>
        <button className={tab === 'raffle' ? 'tab active' : 'tab'} onClick={() => setTab('raffle')}>
          🎟 The Numbers
        </button>
        <span className="blockline">block {data.blockNumber.toString()}</span>
      </div>
      <TrustBanner deployment={deployment} onAcknowledged={() => setTrustAcknowledged(true)} />
      {tab === 'coinflip' ? (
        <CoinFlipScreen
          deployment={deployment}
          data={data}
          walletClient={wallet.walletClient}
          trustAcknowledged={trustAcknowledged}
        />
      ) : (
        <RaffleScreen
          deployment={deployment}
          data={data}
          walletClient={wallet.walletClient}
          trustAcknowledged={trustAcknowledged}
        />
      )}
      <div className="colophon">
        <span>
          a{' '}
          <a href="https://msgboard.xyz" target="_blank" rel="noreferrer">
            MsgBoard
          </a>{' '}
          venue · run by valve
        </span>
        <span>
          randomness contracts by{' '}
          <a href="https://github.com/gibsfinance/random" target="_blank" rel="noreferrer">
            gibs.finance
          </a>
        </span>
      </div>
    </div>
  )
}
