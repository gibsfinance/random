import { useState } from 'react'
import * as viem from 'viem'
import { deployments } from './config'
import { useWallet } from './hooks/useWallet'
import { useChainData } from './hooks/useChainData'
import { TrustBanner, isTrustAcknowledged } from './components/TrustBanner'
import { CoinFlipScreen } from './components/CoinFlipScreen'
import { RaffleScreen } from './components/RaffleScreen'
import { DiceScreen } from './components/DiceScreen'
import { LimboScreen } from './components/LimboScreen'
import { PlinkoScreen } from './components/PlinkoScreen'
import { KenoScreen } from './components/KenoScreen'
import { MinesScreen } from './components/MinesScreen'
import { HiLoWarScreen } from './components/HiLoWarScreen'
import { LiveFeed } from './components/LiveFeed'
import { Menu } from './components/Menu'

const short = (a?: viem.Hex) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

const PITCH_KEY = 'msgboard-games:pitch-collapsed'

const chainIcon = (chainId: number): string | undefined =>
  chainId === 31337 ? undefined : `https://gib.show/image/${chainId}?w=32&h=32&format=webp`

export const App = () => {
  const [deploymentIndex, setDeploymentIndex] = useState(0)
  const [tab, setTab] = useState<
    'coinflip' | 'raffle' | 'dice' | 'limbo' | 'plinko' | 'keno' | 'mines' | 'hilo' | 'live'
  >('coinflip')
  const deployment = deployments[deploymentIndex]
  const wallet = useWallet(deployment?.chainId ?? 31337)
  const data = useChainData(deployment ?? null, wallet.address)
  const [trustAcknowledged, setTrustAcknowledged] = useState(() =>
    deployment ? isTrustAcknowledged(deployment.chainId) : false,
  )
  const [pitchOpen, setPitchOpen] = useState(() => localStorage.getItem(PITCH_KEY) !== 'true')

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
            options={deployments.map((d) => ({ label: d.label, icon: chainIcon(d.chainId) }))}
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
      <details
        className="pitch"
        open={pitchOpen}
        onToggle={(e) => {
          const isOpen = (e.target as HTMLDetailsElement).open
          setPitchOpen(isOpen)
          localStorage.setItem(PITCH_KEY, isOpen ? 'false' : 'true')
        }}
      >
        <summary>How the back room stays honest — and cheap</summary>
        <div className="pitch-body">
          <p className="hero-pitch">
            Coin flips and a numbers game where <strong>nobody can cook the draw</strong> — not the house, not the
            player across the table, not even{' '}
            <a href="https://msgboard.xyz" target="_blank" rel="noreferrer">
              MsgBoard
            </a>
            . Every result comes from validator secrets locked in before you play, and your own browser re-runs the
            count on every settled game. A trust-me casino asks you to believe the odds; this table hands you the
            books.
          </p>
          <div className="howit">
            <div className="howit-step">
              <span className="howit-num">1</span>
              <strong>Secrets go in before the action.</strong> Validators ink hashed secrets on chain ahead of every
              game, and your entry pins that exact set — no late swaps. Don't trust the set? Anyone can ink and
              join it — you or the house included.
            </div>
            <div className="howit-step">
              <span className="howit-num">2</span>
              <strong>The reveal is the draw.</strong> The seed is the hash of all the validators' revealed secrets
              together — one honest validator beats any cartel, and the outcome is pure math on the seed.
            </div>
            <div className="howit-step">
              <span className="howit-num">3</span>
              <strong>You keep the books.</strong> Your browser recomputes every outcome and stamps the slip{' '}
              <em>on the level</em> — or calls it crooked. Don't trust the table; audit it.
            </div>
          </div>
          <p className="howit-footer">
            <strong>Supercharged by MsgBoard:</strong> the validators coordinate with proof-of-work stamps instead
            of gas, so fees never bleed the odds — every settlement leaves a notice on the board (follow the
            msgboard trail from <em>The record</em>). And if a chain's vault ever runs dry, the tables simply
            pause; nothing breaks, and play resumes the moment it's refilled.
          </p>
        </div>
      </details>
      {wallet.error && <div className="banner bad">{wallet.error}</div>}
      {data.error && <div className="banner bad">chain read failed: {data.error}</div>}
      <div className="tabs">
        <button className={tab === 'coinflip' ? 'tab active' : 'tab'} onClick={() => setTab('coinflip')}>
          <span className="coin" /> Coin Flip
        </button>
        <button className={tab === 'raffle' ? 'tab active' : 'tab'} onClick={() => setTab('raffle')}>
          🎟 The Numbers
        </button>
        <button className={tab === 'dice' ? 'tab active' : 'tab'} onClick={() => setTab('dice')}>
          🎲 Dice
        </button>
        <button className={tab === 'limbo' ? 'tab active' : 'tab'} onClick={() => setTab('limbo')}>
          🚀 Limbo
        </button>
        <button className={tab === 'plinko' ? 'tab active' : 'tab'} onClick={() => setTab('plinko')}>
          🪙 Plinko
        </button>
        <button className={tab === 'keno' ? 'tab active' : 'tab'} onClick={() => setTab('keno')}>
          🔢 Keno
        </button>
        <button className={tab === 'mines' ? 'tab active' : 'tab'} onClick={() => setTab('mines')}>
          💣 Mines
        </button>
        <button className={tab === 'hilo' ? 'tab active' : 'tab'} onClick={() => setTab('hilo')}>
          ⚔️ Hi-Lo War
        </button>
        <button className={tab === 'live' ? 'tab active' : 'tab'} onClick={() => setTab('live')}>
          🟢 Live
        </button>
        <span className="blockline">block {data.blockNumber.toString()}</span>
      </div>
      <TrustBanner deployment={deployment} onAcknowledged={() => setTrustAcknowledged(true)} />
      {tab === 'coinflip' && (
        <CoinFlipScreen
          deployment={deployment}
          data={data}
          walletClient={wallet.walletClient}
          trustAcknowledged={trustAcknowledged}
          myAddress={wallet.address}
        />
      )}
      {tab === 'raffle' && (
        <RaffleScreen
          deployment={deployment}
          data={data}
          walletClient={wallet.walletClient}
          trustAcknowledged={trustAcknowledged}
          myAddress={wallet.address}
        />
      )}
      {tab === 'dice' && (
        <DiceScreen
          deployment={deployment}
          walletClient={wallet.walletClient}
          trustAcknowledged={trustAcknowledged}
          myAddress={wallet.address}
        />
      )}
      {tab === 'limbo' && (
        <LimboScreen
          deployment={deployment}
          walletClient={wallet.walletClient}
          trustAcknowledged={trustAcknowledged}
          myAddress={wallet.address}
        />
      )}
      {tab === 'plinko' && (
        <PlinkoScreen
          deployment={deployment}
          walletClient={wallet.walletClient}
          trustAcknowledged={trustAcknowledged}
          myAddress={wallet.address}
        />
      )}
      {tab === 'keno' && (
        <KenoScreen
          deployment={deployment}
          walletClient={wallet.walletClient}
          trustAcknowledged={trustAcknowledged}
          myAddress={wallet.address}
        />
      )}
      {tab === 'mines' && (
        <MinesScreen
          deployment={deployment}
          walletClient={wallet.walletClient}
          trustAcknowledged={trustAcknowledged}
          myAddress={wallet.address}
        />
      )}
      {tab === 'hilo' && (
        <HiLoWarScreen
          deployment={deployment}
          walletClient={wallet.walletClient}
          trustAcknowledged={trustAcknowledged}
          myAddress={wallet.address}
        />
      )}
      {tab === 'live' && <LiveFeed deployment={deployment} />}
      <div className="colophon">
        <span>
          a{' '}
          <a href="https://msgboard.xyz" target="_blank" rel="noreferrer">
            MsgBoard
          </a>{' '}
          venue · run by valve
        </span>
        <span>
          <a href="https://github.com/gibsfinance/random" target="_blank" rel="noreferrer">
            contracts
          </a>
          {' · '}
          <a href="https://github.com/valve-tech/msgboard" target="_blank" rel="noreferrer">
            msgboard
          </a>
        </span>
      </div>
    </div>
  )
}
