export function isBelowMinimumVersion(current: string, minimum: unknown): boolean {
  if (typeof minimum !== 'string' || !/^\d+\.\d+\.\d+$/.test(minimum)) return false
  const currentParts = current.split('.').map(Number)
  const minimumParts = minimum.split('.').map(Number)
  if (currentParts.length !== 3 || currentParts.some((part) => !Number.isFinite(part))) return false
  for (let index = 0; index < 3; index++) {
    if (currentParts[index] !== minimumParts[index]) return currentParts[index] < minimumParts[index]
  }
  return false
}
