import { keccak256, type Hex } from 'viem'
import {
  type SessionState, type GameDomain, type StateSigner,
  signSessionState, verifySessionStateSig,
} from './sessionState'
import { buildSeedChain, verifyReveal, roundRandom, type SeedChain } from './rng'
import { Transcript, makeEnvelope, type EnvelopeSigner } from './transcript'
import type { Game } from './game'

const ZERO32 = `0x${'00'.repeat(32)}` as Hex

export interface Signer extends StateSigner, EnvelopeSigner {}

export interface SessionConfig<TParams> {
  domain: GameDomain
  tableId: Hex
  game: Game<TParams>
  player: Signer
  house: Signer
  seedTip: Hex
  chainLength: number
  openBalances: { player: bigint; house: bigint }
  settlementMode: number
}

export interface PlayInput<TParams> {
  stake: bigint
  params: TParams
  clientSeed: Hex
}

interface SigPair { player: Hex; house: Hex }

/** Drives a player↔house session in-process (both signers local). A real deployment
 *  splits player and house across machines over a Transport; the co-sign logic is identical. */
export class HouseSession<TParams> {
  state!: SessionState
  readonly chain: SeedChain
  readonly transcript: Transcript
  private sigs = new Map<bigint, SigPair>()

  constructor(private cfg: SessionConfig<TParams>) {
    this.chain = buildSeedChain(cfg.seedTip, cfg.chainLength)
    this.transcript = new Transcript(cfg.tableId)
  }

  async bothSigned(s: SessionState): Promise<boolean> {
    const pair = this.sigs.get(s.nonce)
    if (!pair) return false
    return (
      (await verifySessionStateSig(this.cfg.player.address, this.cfg.domain, s, pair.player)) &&
      (await verifySessionStateSig(this.cfg.house.address, this.cfg.domain, s, pair.house))
    )
  }

  private async coSign(s: SessionState): Promise<SigPair> {
    const player = await signSessionState(this.cfg.player, this.cfg.domain, s)
    const house = await signSessionState(this.cfg.house, this.cfg.domain, s)
    const pair: SigPair = { player, house }
    this.sigs.set(s.nonce, pair)
    return pair
  }

  async open(): Promise<void> {
    this.state = {
      tableId: this.cfg.tableId,
      nonce: 0n,
      balancePlayer: this.cfg.openBalances.player,
      balanceHouse: this.cfg.openBalances.house,
      settlementMode: this.cfg.settlementMode,
      gameId: this.cfg.game.gameId,
      gameStateHash: ZERO32,
      rngCommit: this.chain.commit,
    }
    const sigs = await this.coSign(this.state)
    const env = await makeEnvelope(this.cfg.house, this.cfg.tableId, 0, this.transcript.head, 'OPEN', {
      rngCommit: this.chain.commit,
      settlementMode: this.state.settlementMode,
      gameId: this.state.gameId,
      balances: { player: this.state.balancePlayer.toString(), house: this.state.balanceHouse.toString() },
      sigs,
    })
    this.transcript.append(env)
  }

  async playRound(input: PlayInput<TParams>): Promise<void> {
    const roundIndex = this.state.nonce + 1n // 1-indexed into the seed chain
    const serverSeed = this.chain.seeds[Number(roundIndex)]
    if (!serverSeed) throw new Error('session: seed chain exhausted')
    const priorLink = this.chain.seeds[Number(roundIndex) - 1]!
    if (!verifyReveal(priorLink, serverSeed)) throw new Error('session: bad seed reveal')

    const raw = roundRandom(serverSeed, input.clientSeed, roundIndex)
    const outcome = this.cfg.game.settleRound(input.stake, input.params, raw)
    const gameStateHash = keccak256(this.cfg.game.encodeRound(input.stake, input.params, raw))

    const next: SessionState = {
      ...this.state,
      nonce: roundIndex,
      balancePlayer: this.state.balancePlayer + outcome.playerDelta,
      balanceHouse: this.state.balanceHouse - outcome.playerDelta,
      gameStateHash,
    }
    if (next.balancePlayer < 0n || next.balanceHouse < 0n) throw new Error('session: balance underflow')

    const sigs = await this.coSign(next)
    const env = await makeEnvelope(this.cfg.player, this.cfg.tableId, this.transcript.entries.length, this.transcript.head, 'ROUND', {
      round: Number(roundIndex),
      stake: input.stake.toString(),
      clientSeed: input.clientSeed,
      serverSeed,
      params: serializeParams(input.params),
      outcome: { win: outcome.win, playerDelta: outcome.playerDelta.toString(), multiplierX100: outcome.multiplierX100.toString() },
      sigs,
    })
    this.transcript.append(env)
    this.state = next
  }
}

/** Assumes all TParams fields are bigint — revisit if a game gains non-bigint params. */
function serializeParams(p: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) out[k] = String(v)
  return out
}

/** Inverse of serializeParams. Assumes all fields are bigint. */
function deserializeParams<TParams>(raw: Record<string, string>): TParams {
  const out: Record<string, bigint> = {}
  for (const [k, v] of Object.entries(raw)) out[k] = BigInt(v)
  return out as unknown as TParams
}

export interface VerifyContext<TParams> {
  parties: { player: Hex; house: Hex }
  commit: Hex
  game: Game<TParams>
  domain: GameDomain
}

async function verifyStatePair<TParams>(state: SessionState, sigs: unknown, ctx: VerifyContext<TParams>): Promise<boolean> {
  const pair = sigs as Partial<SigPair> | undefined
  if (!pair || typeof pair.player !== 'string' || typeof pair.house !== 'string') return false
  return (
    (await verifySessionStateSig(ctx.parties.player, ctx.domain, state, pair.player)) &&
    (await verifySessionStateSig(ctx.parties.house, ctx.domain, state, pair.house))
  )
}

/** Re-verify a finished session from the retained transcript ALONE (spec §2): transcript chain
 *  links + envelope signatures (Transcript.verify), the committed server-seed chain, every recorded
 *  outcome recomputed from (serverSeed, clientSeed, round), AND both parties' EIP-712 co-signatures
 *  on every reconstructed SessionState. Returns false on any mismatch. */
export async function verifyFinishedSession<TParams>(transcriptJson: string, ctx: VerifyContext<TParams>): Promise<boolean> {
  const t = Transcript.fromJSON(transcriptJson)
  if (!(await t.verify(ctx.parties))) return false

  const open = t.entries.find((e) => e.kind === 'OPEN')
  if (!open) return false
  const ob = open.body as {
    rngCommit?: Hex; settlementMode?: number; gameId?: number
    balances?: { player?: string; house?: string }; sigs?: unknown
  }
  if (ob.rngCommit !== ctx.commit) return false
  if (!ob.balances || ob.balances.player === undefined || ob.balances.house === undefined) return false

  let state: SessionState = {
    tableId: t.tableId,
    nonce: 0n,
    balancePlayer: BigInt(ob.balances.player),
    balanceHouse: BigInt(ob.balances.house),
    settlementMode: Number(ob.settlementMode ?? 0),
    gameId: ctx.game.gameId,
    gameStateHash: ZERO32,
    rngCommit: ctx.commit,
  }
  if (!(await verifyStatePair(state, ob.sigs, ctx))) return false

  let priorLink: Hex = ctx.commit
  for (const e of t.entries) {
    if (e.kind !== 'ROUND') continue
    const b = e.body as {
      round: number; stake: string; clientSeed: Hex; serverSeed: Hex
      params: Record<string, string>
      outcome: { win: boolean; playerDelta: string; multiplierX100: string }
      sigs?: unknown
    }
    if (!verifyReveal(priorLink, b.serverSeed)) return false
    priorLink = b.serverSeed
    const raw = roundRandom(b.serverSeed, b.clientSeed, BigInt(b.round))
    const params = deserializeParams<TParams>(b.params)
    const outcome = ctx.game.settleRound(BigInt(b.stake), params, raw)
    if (
      outcome.win !== b.outcome.win ||
      outcome.playerDelta.toString() !== b.outcome.playerDelta ||
      outcome.multiplierX100.toString() !== b.outcome.multiplierX100
    ) return false
    state = {
      ...state,
      nonce: BigInt(b.round),
      balancePlayer: state.balancePlayer + outcome.playerDelta,
      balanceHouse: state.balanceHouse - outcome.playerDelta,
      gameStateHash: keccak256(ctx.game.encodeRound(BigInt(b.stake), params, raw)),
    }
    if (!(await verifyStatePair(state, b.sigs, ctx))) return false
  }
  return true
}
