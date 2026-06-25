import * as viem from 'viem'
import { expect } from 'chai'
import hre from 'hardhat'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { AttestedElGamalDeck } from '@gibs/zk-cards-core'
import { runHand, makeDomainN, type SeatScript, type SessionSeat } from '@gibs/holdem'

/// Task 8 — END-TO-END on-chain settle. Runs the full off-chain @gibs/holdem session
/// (deck → deal → betting → showdown → N-of-N co-signed SETTLED ChannelStateN) and submits
/// the co-signed final state to an anvil-deployed HoldemTableN.settle, asserting it is ACCEPTED:
/// each seat's wallet balance changes by its payout, the rake reaches the treasury, the table
/// reaches Settled and holds zero residue. Template: MsgBoardSettleE2E.test.ts.
describe('Holdem on-chain settle E2E (HoldemTableN.settle accepts the co-signed final state)', () => {
  // Build a player wallet for a non-hardhat key: viem signs locally and submits via the node.
  async function fundWallet(account: ReturnType<typeof privateKeyToAccount>) {
    const publicClient = await hre.viem.getPublicClient()
    await hre.network.provider.request({
      method: 'hardhat_setBalance',
      params: [account.address, viem.numberToHex(10n ** 20n)],
    })
    return viem.createWalletClient({
      account,
      chain: publicClient.chain,
      transport: viem.custom(hre.network.provider),
    })
  }

  // Make N seats: each has a deck keypair, a wallet (escrows + receives payout), and a channel
  // key (co-signs ChannelStateN). Here wallet == channel key for simplicity.
  async function makeSeats(p: AttestedElGamalDeck, n: number) {
    const seats: (SessionSeat & {
      wallet: ReturnType<typeof privateKeyToAccount>
      walletClient: Awaited<ReturnType<typeof fundWallet>>
    })[] = []
    for (let i = 0; i < n; i++) {
      const k = await p.keygen()
      const acct = privateKeyToAccount(generatePrivateKey())
      const walletClient = await fundWallet(acct)
      seats.push({
        ...k,
        addr: acct.address,
        signer: acct,
        channel: acct,
        wallet: acct,
        walletClient,
      })
    }
    return seats
  }

  // Submit settle from seat `submitter` (a seat must submit — _seatOf gates msg.sender) and
  // return the gas cost the submitter paid, so payout assertions can add it back.
  async function settleAs(
    zk: any,
    publicClient: any,
    submitter: Awaited<ReturnType<typeof makeSeats>>[number],
    tableId: viem.Hex,
    state: any,
    sigs: viem.Hex[],
  ): Promise<bigint> {
    const hash = await submitter.walletClient.writeContract({
      address: zk.address,
      abi: zk.abi,
      functionName: 'settle',
      args: [tableId, state, sigs],
    })
    const receipt = await publicClient.getTransactionReceipt({ hash })
    return receipt.gasUsed * receipt.effectiveGasPrice
  }

  async function deploy(treasury: viem.Hex) {
    const zk = await hre.viem.deployContract('HoldemTableN', [treasury])
    const rules = await hre.viem.deployContract('HoldemRules', [])
    const publicClient = await hre.viem.getPublicClient()
    const chainId = await publicClient.getChainId()
    const domain = makeDomainN(chainId, zk.address)
    return { zk, rules, publicClient, chainId, domain }
  }

  async function createJoinStart(
    zk: any,
    rules: any,
    seats: Awaited<ReturnType<typeof makeSeats>>,
    tableId: viem.Hex,
    buyIn: bigint,
    rakeBps: number,
    rakeCap: bigint,
  ) {
    const n = seats.length
    const CLOCK = 30n
    // seat 0 creates (escrows buyIn), declaring its channel key.
    await seats[0].walletClient.writeContract({
      address: zk.address,
      abi: zk.abi,
      functionName: 'create',
      args: [rules.address, buyIn, BigInt(n), rakeBps, rakeCap, CLOCK, seats[0].channel.address],
      value: buyIn,
    })
    // resolve the tableId the contract derived: it emits TableCreated(tableId,...). Recompute it
    // by reading from the create receipt is fiddly; instead the contract derives tableId from
    // (creator, block, nonce-ish). Simpler: the contract returns it — fetch via the event.
    // We pass the same tableId by reading the single TableCreated log.
    const pub = await hre.viem.getPublicClient()
    const logs = await pub.getContractEvents({ address: zk.address, abi: zk.abi, eventName: 'TableCreated' })
    const realTableId = logs[logs.length - 1].args.tableId as viem.Hex
    for (let i = 1; i < n; i++) {
      await seats[i].walletClient.writeContract({
        address: zk.address,
        abi: zk.abi,
        functionName: 'join',
        args: [realTableId, seats[i].channel.address],
        value: buyIn,
      })
    }
    await seats[0].walletClient.writeContract({
      address: zk.address,
      abi: zk.abi,
      functionName: 'start',
      args: [realTableId],
    })
    return realTableId
  }

  it('N=2 contested: full session → settle pays the evaluator winner; table Settled, zero residue', async () => {
    const treasury = viem.getAddress('0x000000000000000000000000000000000000bEEF')
    const { zk, rules, publicClient, domain } = await deploy(treasury)
    const p = new AttestedElGamalDeck()
    const seats = await makeSeats(p, 2)
    const buyIn = viem.parseEther('1')

    // create/join/start with the ON-CHAIN-derived tableId, then co-sign with that domain.
    const tableId = await createJoinStart(zk, rules, seats, '0x' as viem.Hex, buyIn, 0, 0n)

    const scripts: SeatScript[] = [
      { preflop: ['CALL'], flop: ['CHECK'], turn: ['CHECK'], river: ['CHECK'] },
      { preflop: ['CHECK'], flop: ['CHECK'], turn: ['CHECK'], river: ['CHECK'] },
    ]
    const res = await runHand({
      provider: p,
      seats,
      tableId,
      buyIn,
      button: 0,
      sb: viem.parseEther('0.01'),
      bb: viem.parseEther('0.02'),
      rakeBps: 0,
      rakeCap: 0n,
      scripts,
      domain,
    })

    const before = await Promise.all(seats.map((s) => publicClient.getBalance({ address: s.wallet.address })))
    const zkBefore = await publicClient.getBalance({ address: zk.address })

    // Submit the co-signed SETTLED state from seat 0 (a seat must submit). Capture its gas so
    // the payout assertion can add it back.
    const gas = await settleAs(zk, publicClient, seats[0], tableId, res.settleState, res.settleSigs as viem.Hex[])

    // table Settled, zero residue
    const status = await zk.read.status([tableId])
    expect(Number(status)).to.equal(4) // Status.Settled
    expect(await publicClient.getBalance({ address: zk.address })).to.equal(0n)

    // each seat's wallet changed by exactly its co-signed balance (the payout vector); seat 0
    // additionally paid the settle gas.
    const after = await Promise.all(seats.map((s) => publicClient.getBalance({ address: s.wallet.address })))
    for (let i = 0; i < seats.length; i++) {
      const gasAdj = i === 0 ? gas : 0n
      expect(after[i] - before[i] + gasAdj, `seat ${i} payout`).to.equal(res.settleState.balances[i])
    }
    // exactly Σ escrow left the contract
    expect(zkBefore).to.equal(buyIn * 2n)
  })

  it('N=3 contested with rake: settle pays winners + rake to treasury; conserves Σ escrow', async () => {
    const treasury = viem.getAddress('0x000000000000000000000000000000000000cAfe')
    const { zk, rules, publicClient, domain } = await deploy(treasury)
    const p = new AttestedElGamalDeck()
    const seats = await makeSeats(p, 3)
    const buyIn = viem.parseEther('1')
    const rakeBps = 250 // 2.5%
    const rakeCap = viem.parseEther('0.1')

    const tableId = await createJoinStart(zk, rules, seats, '0x' as viem.Hex, buyIn, rakeBps, rakeCap)

    // Everyone calls/checks to a 3-way showdown so the evaluator + rake fire. Use ether-scale
    // blinds so the pot is large enough for a non-zero rake (2.5% of ~0.06 ETH).
    const scripts: SeatScript[] = [
      { preflop: ['CALL'], flop: ['CHECK'], turn: ['CHECK'], river: ['CHECK'] },
      { preflop: ['CALL'], flop: ['CHECK'], turn: ['CHECK'], river: ['CHECK'] },
      { preflop: ['CHECK'], flop: ['CHECK'], turn: ['CHECK'], river: ['CHECK'] },
    ]
    const res = await runHand({
      provider: p,
      seats,
      tableId,
      buyIn,
      button: 0,
      sb: viem.parseEther('0.01'),
      bb: viem.parseEther('0.02'),
      rakeBps,
      rakeCap,
      scripts,
      domain,
    })

    // rake must be non-zero for this test to exercise the rake path.
    expect(res.settleState.rakeAccrued > 0n, 'rake accrued > 0').to.equal(true)

    const before = await Promise.all(seats.map((s) => publicClient.getBalance({ address: s.wallet.address })))
    const treasuryBefore = await publicClient.getBalance({ address: treasury })

    // settle must be submitted BY a seat (the contract gates on _seatOf(msg.sender)).
    const gas = await settleAs(zk, publicClient, seats[0], tableId, res.settleState, res.settleSigs as viem.Hex[])

    expect(Number(await zk.read.status([tableId]))).to.equal(4) // Settled
    expect(await publicClient.getBalance({ address: zk.address })).to.equal(0n)

    const after = await Promise.all(seats.map((s) => publicClient.getBalance({ address: s.wallet.address })))
    for (let i = 0; i < seats.length; i++) {
      const gasAdj = i === 0 ? gas : 0n
      expect(after[i] - before[i] + gasAdj, `seat ${i} payout`).to.equal(res.settleState.balances[i])
    }
    const treasuryAfter = await publicClient.getBalance({ address: treasury })
    expect(treasuryAfter - treasuryBefore, 'rake to treasury').to.equal(res.settleState.rakeAccrued)

    // whole-table conservation: Σ payouts + rake == Σ escrow
    const sumPayouts = res.settleState.balances.reduce((a, b) => a + b, 0n)
    expect(sumPayouts + res.settleState.rakeAccrued).to.equal(buyIn * 3n)
  })

  it('N=3 uncontested sweep: everyone folds to one seat; settle pays the last seat, conserves', async () => {
    const treasury = viem.getAddress('0x000000000000000000000000000000000000dEaD')
    const { zk, rules, publicClient, domain } = await deploy(treasury)
    const p = new AttestedElGamalDeck()
    const seats = await makeSeats(p, 3)
    const buyIn = viem.parseEther('1')

    const tableId = await createJoinStart(zk, rules, seats, '0x' as viem.Hex, buyIn, 0, 0n)

    const scripts: SeatScript[] = [
      { preflop: ['FOLD'] },
      { preflop: ['FOLD'] },
      { preflop: [] },
    ]
    const res = await runHand({
      provider: p,
      seats,
      tableId,
      buyIn,
      button: 0,
      sb: viem.parseEther('0.01'),
      bb: viem.parseEther('0.02'),
      rakeBps: 0,
      rakeCap: 0n,
      scripts,
      domain,
    })
    expect(res.final.stubWinner).to.equal(2)

    const before = await Promise.all(seats.map((s) => publicClient.getBalance({ address: s.wallet.address })))
    // settle must be submitted BY a seat (the contract gates on _seatOf(msg.sender)).
    const gas = await settleAs(zk, publicClient, seats[0], tableId, res.settleState, res.settleSigs as viem.Hex[])

    expect(Number(await zk.read.status([tableId]))).to.equal(4)
    expect(await publicClient.getBalance({ address: zk.address })).to.equal(0n)
    const after = await Promise.all(seats.map((s) => publicClient.getBalance({ address: s.wallet.address })))
    for (let i = 0; i < seats.length; i++) {
      const gasAdj = i === 0 ? gas : 0n
      expect(after[i] - before[i] + gasAdj, `seat ${i} payout`).to.equal(res.settleState.balances[i])
    }
    const sumPayouts = res.settleState.balances.reduce((a, b) => a + b, 0n)
    expect(sumPayouts + res.settleState.rakeAccrued).to.equal(buyIn * 3n)
  })
})
