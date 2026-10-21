// Optional passphrase lock for backup files: PBKDF2-SHA256 (600k iterations) → AES-GCM-256, all via WebCrypto.

export const PBKDF2_ITERATIONS = 600_000
const MIN_ITERATIONS = 100_000
const MAX_ITERATIONS = 10_000_000

export interface LockedEnvelope {
  app: 'life-design'
  kind: 'locked-backup'
  v: 1
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  cipher: { name: 'AES-GCM'; iv: string }
  data: string
}

export class WrongPassphraseError extends Error {
  constructor() {
    super("That password didn't open this file. Passwords are case-sensitive.")
    this.name = 'WrongPassphraseError'
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function lockText(plain: string, passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<LockedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt, iterations)
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plain)))
  return {
    app: 'life-design',
    kind: 'locked-backup',
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    data: bytesToBase64(cipher),
  }
}

export async function unlockText(envelope: LockedEnvelope, passphrase: string): Promise<string> {
  const key = await deriveKey(passphrase, base64ToBytes(envelope.kdf.salt), envelope.kdf.iterations)
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(envelope.cipher.iv) }, key, base64ToBytes(envelope.data))
    return decoder.decode(plain)
  } catch {
    // AES-GCM authentication fails for a wrong passphrase or a damaged file alike.
    throw new WrongPassphraseError()
  }
}

export function isLockedEnvelope(x: unknown): x is LockedEnvelope {
  if (typeof x !== 'object' || x === null) return false
  const r = x as Record<string, unknown>
  const kdf = r.kdf as Record<string, unknown> | undefined
  const cipher = r.cipher as Record<string, unknown> | undefined
  return (
    r.app === 'life-design' &&
    r.kind === 'locked-backup' &&
    r.v === 1 &&
    typeof r.data === 'string' &&
    typeof kdf === 'object' &&
    kdf !== null &&
    kdf.name === 'PBKDF2' &&
    kdf.hash === 'SHA-256' &&
    typeof kdf.salt === 'string' &&
    Number.isInteger(kdf.iterations) &&
    (kdf.iterations as number) >= MIN_ITERATIONS &&
    (kdf.iterations as number) <= MAX_ITERATIONS &&
    typeof cipher === 'object' &&
    cipher !== null &&
    cipher.name === 'AES-GCM' &&
    typeof cipher.iv === 'string'
  )
}
