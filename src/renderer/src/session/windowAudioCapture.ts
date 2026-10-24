export class WindowAudioCapture {
  private context = new AudioContext({ sampleRate: 48_000 })
  private destination = this.context.createMediaStreamDestination()
  private processor: AudioWorkletNode | null = null
  private captureId = 0
  private unlisten: (() => void) | null = null

  async start(): Promise<MediaStreamTrack | null> {
    try {
      await this.context.audioWorklet.addModule(new URL('../../worklets/windowPcmWorklet.js', import.meta.url).href)
      this.processor = new AudioWorkletNode(this.context, 'window-pcm-playback', { outputChannelCount: [2] })
      this.processor.connect(this.destination)
      this.unlisten = window.KiwiApi.onWindowAudioPacket((captureId, chunk) => {
        if (captureId !== this.captureId) return
        const bytes = new Uint8Array(chunk)
        this.processor?.port.postMessage(bytes.buffer, [bytes.buffer])
      })
      this.captureId = await window.KiwiApi.startWindowAudio()
      if (!this.captureId) {
        this.stop()
        return null
      }
      await this.context.resume()
      return this.destination.stream.getAudioTracks()[0]
    } catch (error) {
      this.stop()
      throw error
    }
  }

  stop(): void {
    this.unlisten?.()
    this.unlisten = null
    if (this.captureId) void window.KiwiApi.stopWindowAudio(this.captureId)
    this.captureId = 0
    this.processor?.disconnect()
    this.processor = null
    for (const track of this.destination.stream.getTracks()) track.stop()
    void this.context.close().catch(() => undefined)
  }
}
