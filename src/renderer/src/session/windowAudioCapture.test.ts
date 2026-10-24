import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

it('plays only the captured application PCM in stereo across chunk boundaries', () => {
  const source = readFileSync(new URL('../../worklets/windowPcmWorklet.js', import.meta.url), 'utf8')
  let Processor: new () => { port: { onmessage: (event: { data: ArrayBuffer }) => void }; process: (inputs: unknown[], outputs: Float32Array[][]) => boolean }
  runInNewContext(source, {
    AudioWorkletProcessor: class { port = { onmessage: (_event: { data: ArrayBuffer }) => {} } },
    registerProcessor: (_name: string, constructor: typeof Processor) => { Processor = constructor },
  })
  const processor = new Processor!()
  processor.port.onmessage({ data: Int16Array.from([32767, -32768, 0, 16384]).buffer })
  processor.port.onmessage({ data: Int16Array.from([-16384, 0]).buffer })
  const output = [[new Float32Array(4), new Float32Array(4)]]
  expect(processor.process([], output)).toBe(true)
  expect(Array.from(output[0][0])).toEqual([32767 / 32768, 0, -0.5, 0])
  expect(Array.from(output[0][1])).toEqual([-1, 0.5, 0, 0])
})
