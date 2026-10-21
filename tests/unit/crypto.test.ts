import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, isLockedEnvelope, lockText, PBKDF2_ITERATIONS, unlockText, WrongPassphraseError } from '../../src/db/crypto'

const FAST = 100_000 // the minimum accepted; keeps tests quick

describe('passphrase lock', () => {
  it('locks and unlocks a backup', async () => {
    const envelope = await lockText('{"entries":["walk in the park"]}', 'correct horse battery', FAST)
    expect(envelope).toMatchObject({ app: 'life-design', kind: 'locked-backup', kdf: { name: 'PBKDF2', iterations: FAST } })
    expect(JSON.stringify(envelope)).not.toContain('walk in the park')
    expect(await unlockText(envelope, 'correct horse battery')).toBe('{"entries":["walk in the park"]}')
  })

  it('refuses a wrong passphrase', async () => {
    const envelope = await lockText('secret', 'correct horse battery', FAST)
    await expect(unlockText(envelope, 'Correct horse battery')).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('refuses a damaged file', async () => {
    const envelope = await lockText('secret', 'correct horse battery', FAST)
    const bytes = base64ToBytes(envelope.data)
    bytes[0] = (bytes[0] ?? 0) ^ 0xff
    await expect(unlockText({ ...envelope, data: bytesToBase64(bytes) }, 'correct horse battery')).rejects.toBeInstanceOf(
      WrongPassphraseError,
    )
  })

  it('uses a fresh salt and IV every time', async () => {
    const a = await lockText('same', 'passphrase!', FAST)
    const b = await lockText('same', 'passphrase!', FAST)
    expect(a.kdf.salt).not.toBe(b.kdf.salt)
    expect(a.cipher.iv).not.toBe(b.cipher.iv)
  })

  it('defaults to 600,000 PBKDF2 iterations', async () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000)
    expect((await lockText('x', 'passphrase!')).kdf.iterations).toBe(600_000)
  })

  it('recognises envelopes and rejects absurd iteration counts', async () => {
    const envelope = await lockText('x', 'passphrase!', FAST)
    expect(isLockedEnvelope(envelope)).toBe(true)
    expect(isLockedEnvelope({ ...envelope, kdf: { ...envelope.kdf, iterations: 1_000_000_000 } })).toBe(false)
    expect(isLockedEnvelope({ ...envelope, kind: 'backup' })).toBe(false)
  })

  it('round-trips large binary data through base64', () => {
    const bytes = new Uint8Array(200_000)
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31) % 256
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })
})
