export class BrowserPcmSender {
  private context = new AudioContext({ sampleRate: 48_000 })
  private source: MediaStreamAudioSourceNode | null = null
  private processor: AudioWorkletNode | null = null

  constructor() {
    void this.context.resume().catch(() => undefined)
  }

  async start(stream: MediaStream, onPacket: (packet: ArrayBuffer) => void): Promise<void> {
    await this.context.audioWorklet.addModule(new URL('../../worklets/browserPcmWorklet.js', import.meta.url).href)
    if (this.context.state === 'closed') return
    this.source = this.context.createMediaStreamSource(stream)
    this.processor = new AudioWorkletNode(this.context, 'browser-pcm-capture')
    this.processor.port.onmessage = (event: MessageEvent<ArrayBuffer>): void => onPacket(event.data)
    this.source.connect(this.processor)
    this.processor.connect(this.context.destination)
    await this.context.resume()
  }

  stop(): void {
    if (this.processor) this.processor.port.onmessage = null
    this.source?.disconnect()
    this.processor?.disconnect()
    void this.context.close().catch(() => undefined)
  }
}

export class BrowserPcmPlayer {
  private context = new AudioContext()
  private nextTime = 0
  private lastSequence = -1

  constructor() {
    void this.context.resume().catch(() => undefined)
  }

  play(packet: ArrayBuffer): void {
    if (this.context.state === 'closed' || packet.byteLength < 12 || (packet.byteLength - 8) % 4) return
    const view = new DataView(packet)
    const sequence = view.getUint32(0, true)
    const sampleRate = view.getUint32(4, true)
    const frames = (packet.byteLength - 8) / 4
    if (sequence <= this.lastSequence || sampleRate < 8_000 || sampleRate > 192_000 || frames > 4_096) return
    this.lastSequence = sequence
    if (this.context.state !== 'running') void this.context.resume().catch(() => undefined)
    const audio = this.context.createBuffer(2, frames, sampleRate)
    const left = audio.getChannelData(0)
    const right = audio.getChannelData(1)
    for (let frame = 0; frame < frames; frame++) {
      left[frame] = view.getInt16(8 + frame * 4, true) / 32768
      right[frame] = view.getInt16(10 + frame * 4, true) / 32768
    }
    const now = this.context.currentTime
    if (this.nextTime < now + 0.04 || this.nextTime > now + 0.3) this.nextTime = now + 0.08
    const source = this.context.createBufferSource()
    source.buffer = audio
    source.connect(this.context.destination)
    source.start(this.nextTime)
    this.nextTime += audio.duration
  }

  stop(): void {
    void this.context.close().catch(() => undefined)
  }
}
