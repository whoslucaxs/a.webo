class BrowserPcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.framesPerPacket = Math.round(sampleRate / 50)
    this.samples = new Int16Array(this.framesPerPacket * 2)
    this.offset = 0
    this.sequence = 0
  }

  process(inputs) {
    const channels = inputs[0]
    if (!channels?.length) return true
    for (let frame = 0; frame < channels[0].length; frame++) {
      for (let channel = 0; channel < 2; channel++) {
        const value = Math.max(-1, Math.min(1, channels[channel]?.[frame] ?? channels[0][frame]))
        this.samples[this.offset * 2 + channel] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767)
      }
      if (++this.offset === this.framesPerPacket) {
        const packet = new ArrayBuffer(8 + this.samples.byteLength)
        const header = new DataView(packet)
        header.setUint32(0, this.sequence++, true)
        header.setUint32(4, sampleRate, true)
        new Int16Array(packet, 8).set(this.samples)
        this.port.postMessage(packet, [packet])
        this.offset = 0
      }
    }
    return true
  }
}

registerProcessor('browser-pcm-capture', BrowserPcmCapture)
