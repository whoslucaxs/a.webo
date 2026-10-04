import { describe, expect, it } from 'vitest'
import { kiwiUrlFromArgv } from './kiwiUrl'

describe('kiwiUrlFromArgv', () => {
  it('finds a protocol URL that is not the last argument', () => {
    expect(kiwiUrlFromArgv(['a-webo.exe', 'webo://h/Ada/payload', '--updated'])).toBe(
      'webo://h/Ada/payload',
    )
  })

  it('accepts a quoted protocol URL', () => {
    expect(kiwiUrlFromArgv(['a-webo.exe', '"webo://h/Ada/payload"'])).toBe(
      'webo://h/Ada/payload',
    )
  })

  it('returns null when argv has no link', () => {
    expect(kiwiUrlFromArgv(['a-webo.exe', '--allow-file-access-from-files'])).toBeNull()
    expect(kiwiUrlFromArgv(['a-webo.exe', 'kiwi://h/Ada/payload'])).toBeNull()
  })
})
