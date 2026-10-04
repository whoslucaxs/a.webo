import { isAvatarDataUrl } from '../../shared/avatar'

export const avatarFromFile = async (file: File): Promise<string> => {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5_000_000) throw new Error('Invalid photo')
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 96
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    const edge = Math.min(bitmap.width, bitmap.height)
    context.drawImage(bitmap, (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge, 0, 0, 96, 96)
    const avatar = canvas.toDataURL('image/webp', 0.78)
    if (!isAvatarDataUrl(avatar)) throw new Error('Invalid photo')
    return avatar
  } finally {
    bitmap.close()
  }
}
