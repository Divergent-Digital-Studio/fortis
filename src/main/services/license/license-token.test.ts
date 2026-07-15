import { describe, it, expect } from 'vitest'
import { generateKeyPairSync } from 'crypto'
import {
    issueLicenseToken,
    verifyLicenseToken,
    parseLicenseKey,
    decodePayload,
    FORTIS_PRODUCT_ID,
    LICENSE_FORMAT_VERSION,
} from './license-token'

const DEV_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIEzfrsiGzRR5KkV1KxWGPsBmzHtWh/yOvZYP3bee5exM
-----END PRIVATE KEY-----`

const DEV_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAofAlIbKuAJOrnVPzsZGKUDJtWNyQB300II7M6ERvZO0=
-----END PUBLIC KEY-----`

const WRONG_KEYPAIR = generateKeyPairSync('ed25519')
const WRONG_PRIVATE_PEM = WRONG_KEYPAIR.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

describe('license token sign/verify round-trip', () => {
    it('issues and verifies a pro license', () => {
        const key = issueLicenseToken({ tier: 'pro', privateKeyPem: DEV_PRIVATE_KEY_PEM, validDays: 365 })
        const result = verifyLicenseToken(key, DEV_PUBLIC_KEY_PEM)
        expect(result.valid).toBe(true)
        expect(result.reason).toBe('valid')
        expect(result.token?.tier).toBe('pro')
        expect(result.token?.productId).toBe(FORTIS_PRODUCT_ID)
        expect(result.token?.v).toBe(LICENSE_FORMAT_VERSION)
    })

    it('issues an unlimited (no expiry) license', () => {
        const key = issueLicenseToken({ tier: 'enterprise', privateKeyPem: DEV_PRIVATE_KEY_PEM, validDays: null })
        const result = verifyLicenseToken(key, DEV_PUBLIC_KEY_PEM)
        expect(result.valid).toBe(true)
        expect(result.token?.expiresAt).toBeNull()
    })

    it('carries machine lock + seat count + customer id', () => {
        const key = issueLicenseToken({
            tier: 'enterprise',
            privateKeyPem: DEV_PRIVATE_KEY_PEM,
            machineId: 'abc-123',
            seatCount: 50,
            customerId: 'cust_9',
        })
        const result = verifyLicenseToken(key, DEV_PUBLIC_KEY_PEM)
        expect(result.token?.machineId).toBe('abc-123')
        expect(result.token?.seatCount).toBe(50)
        expect(result.token?.customerId).toBe('cust_9')
    })
})

describe('license token tamper / forgery rejection', () => {
    it('rejects a signature made with the wrong private key', () => {
        const key = issueLicenseToken({ tier: 'pro', privateKeyPem: WRONG_PRIVATE_PEM })
        const result = verifyLicenseToken(key, DEV_PUBLIC_KEY_PEM)
        expect(result.valid).toBe(false)
        expect(result.reason).toBe('bad-signature')
    })

    it('rejects a tampered payload (signature no longer matches)', () => {
        const key = issueLicenseToken({ tier: 'pro', privateKeyPem: DEV_PRIVATE_KEY_PEM, validDays: 30 })
        const parsed = parseLicenseKey(key)!
        const tamperedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(parsed.payload.toString()), tier: 'enterprise' }), 'utf8')
        const stripped = key.startsWith('FORTIS-LICENSE-V1-') ? key.slice('FORTIS-LICENSE-V1-'.length) : key
        const sigPart = stripped.split('.')[1]
        const tamperedKey = 'FORTIS-LICENSE-V1-' + Buffer.from(tamperedPayload).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') + '.' + sigPart
        const result = verifyLicenseToken(tamperedKey, DEV_PUBLIC_KEY_PEM)
        expect(result.valid).toBe(false)
        expect(result.reason).toBe('bad-signature')
    })

    it('rejects a non-license string', () => {
        expect(verifyLicenseToken('sk-fake-key', DEV_PUBLIC_KEY_PEM).reason).toBe('malformed')
        expect(verifyLicenseToken('garbage', DEV_PUBLIC_KEY_PEM).reason).toBe('malformed')
    })

    it('rejects empty', () => {
        expect(verifyLicenseToken('', DEV_PUBLIC_KEY_PEM).reason).toBe('empty')
        expect(verifyLicenseToken('   ', DEV_PUBLIC_KEY_PEM).reason).toBe('empty')
    })

    it('rejects a wrong-product token', () => {
        const key = issueLicenseToken({ tier: 'pro', privateKeyPem: DEV_PRIVATE_KEY_PEM, productId: 'other-product' })
        const result = verifyLicenseToken(key, DEV_PUBLIC_KEY_PEM)
        expect(result.valid).toBe(false)
        expect(result.reason).toBe('wrong-product')
    })
})

describe('license token expiry', () => {
    it('rejects an expired license', () => {
        const pastIssued = Date.now() - 40 * 24 * 60 * 60 * 1000
        const key = issueLicenseToken({
            tier: 'pro',
            privateKeyPem: DEV_PRIVATE_KEY_PEM,
            validDays: 30,
            issuedAt: pastIssued,
        })
        const result = verifyLicenseToken(key, DEV_PUBLIC_KEY_PEM)
        expect(result.valid).toBe(false)
        expect(result.reason).toBe('expired')
    })

    it('accepts a not-yet-irrelevant license at the boundary', () => {
        const key = issueLicenseToken({ tier: 'pro', privateKeyPem: DEV_PRIVATE_KEY_PEM, validDays: 1 })
        const result = verifyLicenseToken(key, DEV_PUBLIC_KEY_PEM, { now: Date.now() + 12 * 60 * 60 * 1000 })
        expect(result.valid).toBe(true)
    })
})

describe('license token machine binding', () => {
    it('rejects when expected machine id does not match', () => {
        const key = issueLicenseToken({ tier: 'pro', privateKeyPem: DEV_PRIVATE_KEY_PEM, machineId: 'machine-A' })
        const result = verifyLicenseToken(key, DEV_PUBLIC_KEY_PEM, { expectedMachineId: 'machine-B' })
        expect(result.valid).toBe(false)
        expect(result.reason).toBe('wrong-machine')
    })

    it('accepts when machine id matches', () => {
        const key = issueLicenseToken({ tier: 'pro', privateKeyPem: DEV_PRIVATE_KEY_PEM, machineId: 'machine-A' })
        const result = verifyLicenseToken(key, DEV_PUBLIC_KEY_PEM, { expectedMachineId: 'machine-A' })
        expect(result.valid).toBe(true)
    })
})

describe('decodePayload defensive parsing', () => {
    it('returns null on invalid json', () => {
        expect(decodePayload(Buffer.from('not-json', 'utf8'))).toBeNull()
    })

    it('returns null on missing required fields', () => {
        expect(decodePayload(Buffer.from(JSON.stringify({ v: 1 }), 'utf8'))).toBeNull()
    })
})
