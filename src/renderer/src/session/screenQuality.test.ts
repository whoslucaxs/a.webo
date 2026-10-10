import { describe, expect, it } from 'vitest'
import { SCREEN_PROFILES } from './adaptive/qualityProfiles'
import { DEFAULT_SCREEN_QUALITY, screenProfileForQuality } from './screenQuality'

describe('screen share quality', () => {
  it('keeps the chosen resolution and frame rate while AUTO follows network bitrate', () => {
    expect(DEFAULT_SCREEN_QUALITY).toEqual({ resolution: 720, frameRate: 30, bitrate: 'auto' })
    expect(screenProfileForQuality(SCREEN_PROFILES.low, DEFAULT_SCREEN_QUALITY)).toMatchObject({
      maxHeight: 720, maxFramerate: 30, maxBitrate: 800_000,
    })
    expect(screenProfileForQuality(SCREEN_PROFILES.high, DEFAULT_SCREEN_QUALITY).maxBitrate).toBe(4_000_000)
  })

  it('honors native resolution and a manual bitrate cap', () => {
    expect(screenProfileForQuality(SCREEN_PROFILES.low, {
      resolution: 'native', frameRate: 60, bitrate: 6_000_000,
    })).toMatchObject({ maxHeight: null, maxFramerate: 60, maxBitrate: 6_000_000 })
  })
})
