export const isAvatarDataUrl = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 24_000 &&
  /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
