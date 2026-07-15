import { describe, it, expect, beforeEach } from 'vitest'
import { createCipheriv, randomBytes, createHash, scryptSync } from 'crypto'
import {
    encrypt,
    decrypt,
    isEncrypted,
    isVersionedCiphertext,
    configureEncryption,
    deriveEncryptionKey,
    legacyMachineKeyFrom,
    reEncryptFromLegacy,
    CIPHERTEXT_VERSION,
    IV_LENGTH,
} from '@main/services/encryption'

const MASTER = Buffer.alloc(32, 7)
const SALT = Buffer.alloc(16, 9)

function legacyEncrypt(plaintext: string, machineId: string): string {
    const key = createHash('sha256').update(`${machineId}:fortis-encryption-salt-v1`).digest()
    const iv = randomBytes(16)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const authTag = cipher.getAuthTag()
    return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]).toString('base64')
}

describe('SEC-03 KDF key derivation', () => {
    it('derives a 32-byte key via scrypt from master key + salt', () => {
        const key = deriveEncryptionKey(MASTER, SALT)
        expect(key.length).toBe(32)
        const expected = scryptSync(MASTER, SALT, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
        expect(key.equals(expected)).toBe(true)
    })

    it('is not a single-pass sha256 of machine-id (legacy key cannot decrypt new ciphertext)', () => {
        configureEncryption({ masterKey: MASTER, salt: SALT })
        const ciphertext = encrypt('top-secret')

        const legacyKey = legacyMachineKeyFrom('some-machine-id')
        expect(() => decryptWithRawKey(ciphertext, legacyKey)).toThrow()
    })

    it('two different master keys produce non-cross-decryptable ciphertext', () => {
        configureEncryption({ masterKey: Buffer.alloc(32, 1), salt: SALT })
        const ctA = encrypt('value')

        configureEncryption({ masterKey: Buffer.alloc(32, 2), salt: SALT })
        expect(() => decrypt(ctA)).toThrow()
    })
})

function decryptWithRawKey(ciphertext: string, key: Buffer): string {
    const { createDecipheriv } = require('crypto') as typeof import('crypto')
    const payload = Buffer.from(ciphertext, 'base64')
    const hasHeader = payload[0] === CIPHERTEXT_VERSION
    const ivLen = hasHeader ? 12 : 16
    const offset = hasHeader ? 1 : 0
    const iv = payload.subarray(offset, offset + ivLen)
    const authTag = payload.subarray(offset + ivLen, offset + ivLen + 16)
    const data = payload.subarray(offset + ivLen + 16)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    let out = decipher.update(data.toString('hex'), 'hex', 'utf8')
    out += decipher.final('utf8')
    return out
}

describe('SEC-07 IV length and ciphertext versioning', () => {
    beforeEach(() => {
        configureEncryption({ masterKey: MASTER, salt: SALT })
    })

    it('new ciphertext uses a 12-byte IV and a version header', () => {
        const ct = encrypt('hello')
        const payload = Buffer.from(ct, 'base64')
        expect(IV_LENGTH).toBe(12)
        expect(payload[0]).toBe(CIPHERTEXT_VERSION)
    })

    it('round-trips correctly', () => {
        const ct = encrypt('a longer secret value 12345')
        expect(decrypt(ct)).toBe('a longer secret value 12345')
    })

    it('produces different ciphertext for the same plaintext (random IV)', () => {
        const a = encrypt('same')
        const b = encrypt('same')
        expect(a).not.toBe(b)
        expect(decrypt(a)).toBe('same')
        expect(decrypt(b)).toBe('same')
    })

    it('still decrypts a legacy 16-byte-IV v1 ciphertext produced with the active key', () => {
        const key = deriveEncryptionKey(MASTER, SALT)
        let iv: Buffer
        do {
            iv = randomBytes(16)
        } while (iv[0] === CIPHERTEXT_VERSION)
        const cipher = createCipheriv('aes-256-gcm', key, iv)
        let enc = cipher.update('legacy-format', 'utf8', 'hex')
        enc += cipher.final('hex')
        const tag = cipher.getAuthTag()
        const legacyCt = Buffer.concat([iv, tag, Buffer.from(enc, 'hex')]).toString('base64')

        expect(decrypt(legacyCt)).toBe('legacy-format')
    })

    it('isEncrypted accepts both v1 and v2 formats but rejects plaintext api keys', () => {
        configureEncryption({ masterKey: MASTER, salt: SALT })
        const ct = encrypt('val')
        expect(isEncrypted(ct)).toBe(true)
        expect(isEncrypted('sk-ant-abc123')).toBe(false)
    })

    it('isVersionedCiphertext only accepts v2 and rejects long plaintext base64-ish strings', () => {
        configureEncryption({ masterKey: MASTER, salt: SALT })
        const ct = encrypt('val')
        expect(isVersionedCiphertext(ct)).toBe(true)
        expect(isVersionedCiphertext('FORTISLICENSEVALUE1234567890ABCDEFGHIJKLMNOP')).toBe(false)
        expect(isVersionedCiphertext('')).toBe(false)
    })
})

describe('SEC-07 version byte is authoritative on decrypt', () => {
    it('v2 ciphertext that fails GCM auth (wrong key) throws and does not silently reinterpret as legacy', () => {
        configureEncryption({ masterKey: Buffer.alloc(32, 1), salt: SALT })
        const v2 = encrypt('genuine-secret')
        expect(Buffer.from(v2, 'base64')[0]).toBe(CIPHERTEXT_VERSION)

        configureEncryption({ masterKey: Buffer.alloc(32, 2), salt: SALT })
        expect(() => decrypt(v2)).toThrow()
    })

    it('corrupt v2 payload (tampered ciphertext) throws rather than falling back to legacy', () => {
        configureEncryption({ masterKey: MASTER, salt: SALT })
        const v2 = encrypt('value-to-corrupt')
        const buf = Buffer.from(v2, 'base64')
        buf[buf.length - 1] = buf[buf.length - 1]! ^ 0xff
        const corrupt = buf.toString('base64')
        expect(corrupt[0]).not.toBeUndefined()
        expect(() => decrypt(corrupt)).toThrow()
    })

    it('legacy (non-version-byte first) ciphertext still decrypts', () => {
        const key = deriveEncryptionKey(MASTER, SALT)
        let iv: Buffer
        do {
            iv = randomBytes(16)
        } while (iv[0] === CIPHERTEXT_VERSION)
        const cipher = createCipheriv('aes-256-gcm', key, iv)
        let enc = cipher.update('legacy-plain', 'utf8', 'hex')
        enc += cipher.final('hex')
        const tag = cipher.getAuthTag()
        const legacyCt = Buffer.concat([iv, tag, Buffer.from(enc, 'hex')]).toString('base64')

        configureEncryption({ masterKey: MASTER, salt: SALT })
        expect(decrypt(legacyCt)).toBe('legacy-plain')
    })
})

describe('SEC-03 legacy migration', () => {
    it('re-encrypts a legacy machine-id-derived value under the new key', () => {
        const machineId = 'legacy-machine-id'
        const legacyCt = legacyEncrypt('my-license-key', machineId)

        configureEncryption({ masterKey: MASTER, salt: SALT })
        const newCt = reEncryptFromLegacy(legacyCt, machineId)

        expect(newCt).not.toBe(legacyCt)
        expect(decrypt(newCt)).toBe('my-license-key')

        const payload = Buffer.from(newCt, 'base64')
        expect(payload[0]).toBe(CIPHERTEXT_VERSION)
    })
})
