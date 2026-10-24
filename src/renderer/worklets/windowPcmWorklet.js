class WindowPcmPlayback extends AudioWorkletProcessor {
  constructor() {
    super()
    this.chunks = []
    this.offset = 0
    this.port.onmessage = ({ data }) => {
      this.chunks.push(new Int16Array(data))
      if (this.chunks.length > 20) {
        this.chunks.shift()
        this.offset = 0
      }
    }
  }

  process(_inputs, outputs) {
    const [left, right] = outputs[0]
    for (let frame = 0; frame < left.length; frame++) {
      const chunk = this.chunks[0]
      if (!chunk) break
      left[frame] = chunk[this.offset++] / 32768
      right[frame] = chunk[this.offset++] / 32768
      if (this.offset >= chunk.length) {
        this.chunks.shift()
        this.offset = 0
      }
    }
    return true
  }
}

registerProcessor('window-pcm-playback', WindowPcmPlayback)
