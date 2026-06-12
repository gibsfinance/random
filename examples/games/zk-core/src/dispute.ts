import type { CoSignedState } from './channel'
import type { ChannelState } from './stateSig'
import type { Envelope, Transcript } from './transcript'

export interface Demand {
  from: 'A' | 'B'
  kind: string
  detail: string
}

export interface DisputeEvidence {
  state: ChannelState
  sigA: string
  sigB: string
  messages: Envelope[]  // signed protocol messages after the co-signed state
  demand: Demand        // what the counterparty owes next (drives the chess clock)
  serialized: string    // JSON for transport/mirroring (bigints as strings)
}

export function buildEvidence(args: {
  coSigned: CoSignedState
  transcript: Transcript
  sinceSeq: number
  demand: Demand
}): DisputeEvidence {
  const { coSigned, transcript, sinceSeq, demand } = args
  if (!coSigned.sigA || !coSigned.sigB)
    throw new Error('dispute: latest state must be fully co-signed')
  const messages = transcript.entries.filter((e) => e.seq >= sinceSeq)
  const body = {
    state: coSigned.state,
    sigA: coSigned.sigA,
    sigB: coSigned.sigB,
    messages,
    demand,
  }
  return {
    state: coSigned.state,
    sigA: coSigned.sigA,
    sigB: coSigned.sigB,
    messages,
    demand,
    serialized: JSON.stringify(body, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
  }
}
