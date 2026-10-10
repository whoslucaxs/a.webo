export const VIDEO_CODECS = ['AV1', 'VP9', 'VP8', 'H264'] as const
export type VideoCodec = (typeof VIDEO_CODECS)[number]

export const isVideoCodec = (value: unknown): value is VideoCodec =>
  VIDEO_CODECS.includes(value as VideoCodec)
