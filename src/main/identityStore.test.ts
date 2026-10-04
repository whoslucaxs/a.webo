import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const state = vi.hoisted(() => ({ dir: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => state.dir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    decryptString: (packed: Buffer) => {
      const value = packed.toString('utf8')
      if (!value.startsWith('encrypted:')) throw new Error('Cannot decrypt old key')
      return value.slice('encrypted:'.length)
    },
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
  },
}))

import { loadOrCreateIdentity } from './identityStore'

beforeEach(() => {
  state.dir = mkdtempSync(join(tmpdir(), 'a-webo-identity-'))
})

afterEach(() => {
  for (const name of readdirSync(state.dir)) unlinkSync(join(state.dir, name))
  rmdirSync(state.dir)
})

it('preserves an unreadable identity and creates a stable replacement', () => {
  writeFileSync(join(state.dir, 'device-identity.bin'), 'old encrypted key')

  const replacement = loadOrCreateIdentity()
  expect(replacement.recovered).toBe(true)
  expect(replacement.privateKey).toHaveLength(32)
  const backup = readdirSync(state.dir).find((name) => name.startsWith('device-identity.bin.unreadable-'))
  expect(backup).toBeTruthy()
  expect(readFileSync(join(state.dir, backup!), 'utf8')).toBe('old encrypted key')

  const next = loadOrCreateIdentity()
  expect(next.recovered).toBeUndefined()
  expect(next.fingerprint).toBe(replacement.fingerprint)
})
