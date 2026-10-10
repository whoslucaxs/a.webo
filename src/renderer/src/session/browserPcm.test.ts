import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserPcmPlayer } from './browserPcm'

afterEach(() => vi.unstubAllGlobals())

describe('browser PCM audio', () => {
  it('sends uncompressed 48 kHz stereo samples', () => {
    const packets: ArrayBuffer[] = []
    let Processor: new () => { process: (inputs: Float32Array[][]) => boolean }
    const source = readFileSync(new URL('../../worklets/browserPcmWorklet.js', import.meta.url), 'utf8')
    runInNewContext(source, {
      AudioWorkletProcessor: class {
        port = { postMessage: (packet: ArrayBuffer) => packets.push(packet) }
      },
      registerProcessor: (_name: string, ctor: typeof Processor) => { Processor = ctor },
      sampleRate: 48_000,
      Int16Array, ArrayBuffer, DataView, Math,
    })
    const processor = new Processor!()
    for (let i = 0; i < 8; i++) {
      processor.process([[new Float32Array(128).fill(0.5), new Float32Array(128).fill(-0.5)]])
    }
    expect(packets).toHaveLength(1)
    const packet = new DataView(packets[0])
    expect(packet.byteLength).toBe(8 + 960 * 2 * 2)
    expect(packet.getUint32(4, true)).toBe(48_000)
    expect(packet.getInt16(8, true)).toBe(16_384)
    expect(packet.getInt16(10, true)).toBe(-16_384)
  })

  it('plays PCM samples without an audio codec', () => {
    const channels = [new Float32Array(2), new Float32Array(2)]
    const start = vi.fn()
    const close = vi.fn(async () => undefined)
    vi.stubGlobal('AudioContext', class {
      state = 'running'
      currentTime = 1
      destination = {}
      resume = vi.fn(async () => undefined)
      close = close
      createBuffer = vi.fn(() => ({ duration: 2 / 48_000, getChannelData: (index: number) => channels[index] }))
      createBufferSource = vi.fn(() => ({ connect: vi.fn(), start }))
    })
    const player = new BrowserPcmPlayer()
    const packet = new ArrayBuffer(16)
    const view = new DataView(packet)
    view.setUint32(4, 48_000, true)
    view.setInt16(8, 16_384, true)
    view.setInt16(10, -16_384, true)
    player.play(packet)
    expect(channels[0][0]).toBe(0.5)
    expect(channels[1][0]).toBe(-0.5)
    expect(start).toHaveBeenCalledOnce()
    player.stop()
    expect(close).toHaveBeenCalledOnce()
  })
})
