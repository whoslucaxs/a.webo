import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import { ed25519 } from '@noble/curves/ed25519.js'

export type StoredIdentity = {
  publicKey: Uint8Array
  privateKey: Uint8Array
  fingerprint: string
  recovered?: boolean
}

const fingerprint = (publicKey: Uint8Array): string =>
  [...publicKey]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)

const identityPath = (): string => join(app.getPath('userData'), 'device-identity.bin')

const readIdentity = (packed: Buffer): StoredIdentity => {
  const candidates: string[] = []
  if (safeStorage.isEncryptionAvailable()) {
    try {
      candidates.push(safeStorage.decryptString(packed))
    } catch {
      // A previous keyring may no longer be available.
    }
  }
  candidates.push(packed.toString('utf8'))
  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw) as { publicKey: string; privateKey: string }
      const publicKey = Buffer.from(parsed.publicKey, 'base64')
      const privateKey = Buffer.from(parsed.privateKey, 'base64')
      if (publicKey.length !== 32 || privateKey.length !== 32 ||
          !Buffer.from(ed25519.getPublicKey(privateKey)).equals(publicKey)) continue
      return {
        publicKey: new Uint8Array(publicKey),
        privateKey: new Uint8Array(privateKey),
        fingerprint: fingerprint(new Uint8Array(publicKey)),
      }
    } catch {
      // Try the other storage format.
    }
  }
  throw new Error('Stored device identity cannot be decrypted')
}

export const loadOrCreateIdentity = (): StoredIdentity => {
  const file = identityPath()
  mkdirSync(app.getPath('userData'), { recursive: true })
  let recovered = false
  if (existsSync(file)) {
    try {
      return readIdentity(readFileSync(file))
    } catch {
      renameSync(file, `${file}.unreadable-${Date.now()}-${randomBytes(4).toString('hex')}`)
      recovered = true
    }
  }
  const secretKey = randomBytes(32)
  const publicKey = ed25519.getPublicKey(secretKey)
  const record = {
    publicKey: Buffer.from(publicKey).toString('base64'),
    privateKey: Buffer.from(secretKey).toString('base64'),
  }
  const json = JSON.stringify(record)
  const stored = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, 'utf8')
  writeFileSync(file, stored, { mode: 0o600 })
  return {
    publicKey: new Uint8Array(publicKey),
    privateKey: new Uint8Array(secretKey),
    fingerprint: fingerprint(new Uint8Array(publicKey)),
    recovered,
  }
}
