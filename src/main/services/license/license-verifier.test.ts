import { describe, it, expect } from 'vitest'
import { issueLicenseToken } from './license-token'
import { verifyStoredLicense, FREE_TIER, tierFromLicense } from './license-verifier'

const DEV_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIEzfrsiGzRR5KkV1KxWGPsBmzHtWh/yOvZYP3bee5exM
-----END PRIVATE KEY-----`

describe('verifyStoredLicense', () => {
    it('returns free tier for an empty license', () => {
        const result = verifyStoredLicense('')
        expect(result.tier).toBe('free')
        expect(result.valid).toBe(false)
        expect(result.reason).toBe('no-license')
    })

    it('returns the signed tier for a valid license', () => {
        const key = issueLicenseToken({ tier: 'pro', privateKeyPem: DEV_PRIVATE_KEY_PEM, validDays: 365 })
        const result = verifyStoredLicense(key)
        expect(result.tier).toBe('pro')
        expect(result.valid).toBe(true)
        expect(result.reason).toBe('valid')
        expect(result.expiresAt).not.toBeNull()
    })

    it('returns the enterprise tier for a valid enterprise license', () => {
        const key = issueLicenseToken({ tier: 'enterprise', privateKeyPem: DEV_PRIVATE_KEY_PEM, validDays: 365 })
        expect(verifyStoredLicense(key).tier).toBe('enterprise')
    })

    it('downgrades to free on a forged key', () => {
        const result = verifyStoredLicense('FORTIS-LICENSE-V1-invalid.garbage')
        expect(result.tier).toBe('free')
        expect(result.valid).toBe(false)
    })

    it('downgrades to free on expiry', () => {
        const pastIssued = Date.now() - 40 * 24 * 60 * 60 * 1000
        const key = issueLicenseToken({ tier: 'pro', privateKeyPem: DEV_PRIVATE_KEY_PEM, validDays: 30, issuedAt: pastIssued })
        const result = verifyStoredLicense(key)
        expect(result.tier).toBe('free')
        expect(result.valid).toBe(false)
        expect(result.reason).toBe('expired')
    })

    it('downgrades to free when machine id does not match', () => {
        const key = issueLicenseToken({ tier: 'pro', privateKeyPem: DEV_PRIVATE_KEY_PEM, machineId: 'real-machine' })
        const result = verifyStoredLicense(key, { machineId: 'wrong-machine' })
        expect(result.tier).toBe('free')
        expect(result.reason).toBe('wrong-machine')
        expect(result.machineLocked).toBe(true)
    })

    it('FREE_TIER constant is the canonical fallback', () => {
        expect(FREE_TIER.tier).toBe('free')
        expect(FREE_TIER.valid).toBe(false)
    })

    it('tierFromLicense returns only the tier', () => {
        const key = issueLicenseToken({ tier: 'enterprise', privateKeyPem: DEV_PRIVATE_KEY_PEM, validDays: 30 })
        expect(tierFromLicense(key)).toBe('enterprise')
        expect(tierFromLicense('')).toBe('free')
    })
})
