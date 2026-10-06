import { expect, test } from 'vitest'
import { isBelowMinimumVersion } from './updatePolicy'

test('requires only clients below a valid minimum version to update', () => {
  expect(isBelowMinimumVersion('3.7.0', '3.8.0')).toBe(true)
  expect(isBelowMinimumVersion('3.10.0', '3.8.0')).toBe(false)
  expect(isBelowMinimumVersion('3.8.0', '3.8.0')).toBe(false)
  expect(isBelowMinimumVersion('3.7.0', 'invalid')).toBe(false)
})
