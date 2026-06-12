export type MessageHandler = (msg: unknown) => void

export interface Transport {
  send(msg: unknown): Promise<void>
  onMessage(handler: MessageHandler): void
}

/** In-process pair with injectable faults, for engine tests. */
export class LocalTransport implements Transport {
  private handler: MessageHandler = () => {}
  private peer!: LocalTransport
  private drops = 0
  delayMs = 0

  static pair(): [LocalTransport, LocalTransport] {
    const a = new LocalTransport()
    const b = new LocalTransport()
    a.peer = b
    b.peer = a
    return [a, b]
  }

  dropNext(n = 1): void {
    this.drops += n
  }

  async send(msg: unknown): Promise<void> {
    if (this.drops > 0) {
      this.drops--
      return
    }
    const deliver = () => this.peer.handler(structuredClone(msg))
    if (this.delayMs > 0) setTimeout(deliver, this.delayMs)
    else queueMicrotask(deliver)
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler
  }
}
