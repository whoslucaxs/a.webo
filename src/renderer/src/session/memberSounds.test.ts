import { expect, test } from 'vitest'
import { memberSoundChanges } from './memberSounds'

test('plays once for own entry, then only when another member joins or leaves', () => {
  const alone = new Set(['me'])
  const withAlex = new Set(['me', 'alex'])
  expect(memberSoundChanges(null, alone, 'me')).toEqual(['join'])
  expect(memberSoundChanges(alone, withAlex, 'me')).toEqual(['join'])
  expect(memberSoundChanges(withAlex, new Set(withAlex), 'me')).toEqual([])
  expect(memberSoundChanges(withAlex, alone, 'me')).toEqual(['exit'])
  expect(memberSoundChanges(withAlex, new Set(), 'me')).toEqual([])
})
