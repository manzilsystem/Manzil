// Web Push (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload encryption
// (RFC 8188 / RFC 8291), written on WebCrypto only so the Edge Function bundle
// stays free of npm imports. Nothing here reads the environment or the network.

const encoder = new TextEncoder()

export function b64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToB64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

// Copies into a fresh ArrayBuffer so WebCrypto accepts the view under strict typings.
function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', buf(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, buf(data)))
}

// HKDF-SHA256 with a single output block (length <= 32), enough for RFC 8291.
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm)
  const okm = await hmac(prk, concat(info, new Uint8Array([1])))
  return okm.slice(0, length)
}

export interface EncryptOptions {
  // Test hooks. Production calls leave both unset and get random values.
  salt?: Uint8Array
  senderKeyPair?: CryptoKeyPair
}

// Returns the aes128gcm request body: salt(16) | rs(4) | idlen(1) | sender public key(65) | ciphertext.
export async function encryptPayload(
  payload: Uint8Array,
  p256dh: string,
  authSecret: string,
  options: EncryptOptions = {},
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(p256dh)
  const auth = b64urlToBytes(authSecret)
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('invalid_p256dh')
  if (auth.length !== 16) throw new Error('invalid_auth')

  const sender = options.senderKeyPair ??
    await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', sender.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', buf(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, sender.privateKey, 256))

  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic)
  const ikm = await hkdf(auth, shared, keyInfo, 32)
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12)

  // Single record: payload, then the 0x02 last-record delimiter (no padding).
  const plaintext = concat(payload, new Uint8Array([2]))
  const aesKey = await crypto.subtle.importKey('raw', buf(cek), { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, aesKey, buf(plaintext)))

  const recordSize = new Uint8Array([0, 0, 0x10, 0])
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext)
}

// VAPID JWT (ES256). publicKey is the uncompressed point (65 bytes, base64url),
// privateKey is the raw 32-byte scalar (base64url). Neither is ever logged.
export async function vapidAuthorization(
  endpoint: string,
  subject: string,
  publicKey: string,
  privateKey: string,
  now = Math.floor(Date.now() / 1000),
): Promise<string> {
  const point = b64urlToBytes(publicKey)
  if (point.length !== 65 || point[0] !== 4) throw new Error('invalid_vapid_public_key')
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(point.slice(1, 33)),
    y: bytesToB64url(point.slice(33, 65)),
    d: privateKey,
    ext: true,
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = bytesToB64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = bytesToB64url(encoder.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: now + 12 * 60 * 60,
    sub: subject,
  })))
  const signingInput = `${header}.${claims}`
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, buf(encoder.encode(signingInput))))
  return `vapid t=${signingInput}.${bytesToB64url(signature)}, k=${publicKey}`
}
