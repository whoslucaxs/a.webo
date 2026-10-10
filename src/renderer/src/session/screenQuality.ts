import type { ScreenProfile } from './adaptive/types'

export type ScreenQuality = {
  resolution: 480 | 720 | 1080 | 'native'
  frameRate: 15 | 30 | 60
  bitrate: 800_000 | 1_500_000 | 3_500_000 | 4_500_000 | 6_000_000 | 'auto'
}

export const DEFAULT_SCREEN_QUALITY: ScreenQuality = {
  resolution: 720,
  frameRate: 30,
  bitrate: 'auto',
}

export const screenProfileForQuality = (adaptive: ScreenProfile, quality: ScreenQuality): ScreenProfile => ({
  ...adaptive,
  maxHeight: quality.resolution === 'native' ? null : quality.resolution,
  maxFramerate: quality.frameRate,
  maxBitrate: quality.bitrate === 'auto' ? adaptive.maxBitrate : quality.bitrate,
})
