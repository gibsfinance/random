import { useState } from 'react'
import * as viem from 'viem'
import { deployments } from './config'
import { useWallet } from './hooks/useWallet'
import { useChainData } from './hooks/useChainData'

const short = (a?: viem.Hex) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

export const App = () => {
  const [deploymentIndex, setDeploymentIndex] = useState(0)
  const [tab, setTab] = useState<'coinflip' | 'raffle'>('coinflip')
  const deployment = deployments[deploymentIndex]
  const wallet = useWallet(deployment?.chainId ?? 31337)
  const data = useChainData(deployment ?? null, wallet.address)

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
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Gibs Games</h1>
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
      <div className="row">
        <button className={tab === 'coinflip' ? '' : 'secondary'} onClick={() => setTab('coinflip')}>
          Coin Flip
        </button>
        <button className={tab === 'raffle' ? '' : 'secondary'} onClick={() => setTab('raffle')}>
          Raffle
        </button>
        <span className="muted">block {data.blockNumber.toString()}</span>
      </div>
      <div className="card muted">
        {tab === 'coinflip' ? 'Coin flip screen lands in the next commit.' : 'Raffle screen lands in the next commit.'}
      </div>
    </div>
  )
}
