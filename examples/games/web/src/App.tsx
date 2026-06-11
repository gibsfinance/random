import { useState } from 'react'
import * as viem from 'viem'
import { deployments } from './config'
import { useWallet } from './hooks/useWallet'
import { useChainData } from './hooks/useChainData'
import { TrustBanner, isTrustAcknowledged } from './components/TrustBanner'
import { CoinFlipScreen } from './components/CoinFlipScreen'
import { RaffleScreen } from './components/RaffleScreen'

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
        <h1>Gibs Games</h1>
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
            Gibs <span className="gold">Games</span>
          </h1>
          <div className="strapline">provably fair · verify every draw</div>
        </div>
        <div className="row">
          <select value={deploymentIndex} onChange={(e) => setDeploymentIndex(Number(e.target.value))}>
            {deployments.map((d, i) => (
              <option key={d.chainId} value={i}>
                {d.label}
              </option>
            ))}
          </select>
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
      {wallet.error && <div className="banner bad">{wallet.error}</div>}
      {data.error && <div className="banner bad">chain read failed: {data.error}</div>}
      <div className="tabs">
        <button className={tab === 'coinflip' ? 'tab active' : 'tab'} onClick={() => setTab('coinflip')}>
          <span className="coin" /> Coin Flip
        </button>
        <button className={tab === 'raffle' ? 'tab active' : 'tab'} onClick={() => setTab('raffle')}>
          🎟 Raffle
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
    </div>
  )
}
