import { sign, verify, createPublicKey, createPrivateKey, randomBytes } from 'crypto'
import type { KeyObject } from 'crypto'
import type { SubscriptionTier } from '../../../shared/types/settings'

export const LICENSE_FORMAT_VERSION = 1
const LICENSE_PREFIX = 'FORTIS-LICENSE-V1-'
export const FORTIS_PRODUCT_ID = 'fortis-desktop'

export interface LicenseToken {
    v: number
    productId: string
    tier: SubscriptionTier
    issuedAt: number
    expiresAt: number | null
    machineId: string | null
    seatCount: number | null
    customerId: string | null
}

export interface LicenseTokenBytes {
    payload: Buffer
    signature: Buffer
}

export type LicenseVerifyReason =
    | 'valid'
    | 'empty'
    | 'malformed'
    | 'bad-signature'
    | 'expired'
    | 'wrong-product'
    | 'wrong-machine'

export interface LicenseVerifyResult {
    valid: boolean
    reason: LicenseVerifyReason
    token: LicenseToken | null
}

function canonicalPayload(token: LicenseToken): Buffer {
    return Buffer.from(JSON.stringify({
        v: token.v,
        productId: token.productId,
        tier: token.tier,
        issuedAt: token.issuedAt,
        expiresAt: token.expiresAt,
        machineId: token.machineId,
        seatCount: token.seatCount,
        customerId: token.customerId,
    }), 'utf8')
}

function decodeBase64Url(input: string): Buffer | null {
    try {
        const padded = input.replace(/-/g, '+').replace(/_/g, '/')
        const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
        return Buffer.from(padded + pad, 'base64')
    } catch {
        return null
    }
}

function encodeBase64Url(buf: Buffer): string {
    return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function issueLicenseToken(
    params: {
        tier: SubscriptionTier
        privateKeyPem: string
        productId?: string
        validDays?: number | null
        machineId?: string | null
        seatCount?: number | null
        customerId?: string | null
        issuedAt?: number
    }
): string {
    const now = params.issuedAt ?? Date.now()
    const expiresAt = params.validDays === null || params.validDays === undefined
        ? null
        : now + params.validDays * 24 * 60 * 60 * 1000

    const token: LicenseToken = {
        v: LICENSE_FORMAT_VERSION,
        productId: params.productId ?? FORTIS_PRODUCT_ID,
        tier: params.tier,
        issuedAt: now,
        expiresAt,
        machineId: params.machineId ?? null,
        seatCount: params.seatCount ?? null,
        customerId: params.customerId ?? null,
    }

    const privateKey = createPrivateKey(params.privateKeyPem)
    const payload = canonicalPayload(token)
    const signature = sign(null, payload, privateKey)

    return LICENSE_PREFIX + encodeBase64Url(payload) + '.' + encodeBase64Url(signature)
}

export function parseLicenseKey(key: string): LicenseTokenBytes | null {
    if (!key || typeof key !== 'string') return null
    const stripped = key.startsWith(LICENSE_PREFIX) ? key.slice(LICENSE_PREFIX.length) : null
    if (!stripped) return null

    const parts = stripped.split('.')
    if (parts.length !== 2) return null

    const payload = decodeBase64Url(parts[0]!)
    const signature = decodeBase64Url(parts[1]!)
    if (!payload || !signature) return null

    return { payload, signature }
}

export function decodePayload(payload: Buffer): LicenseToken | null {
    try {
        const parsed = JSON.parse(payload.toString('utf8')) as Partial<LicenseToken>
        if (typeof parsed.v !== 'number') return null
        if (typeof parsed.productId !== 'string') return null
        if (typeof parsed.tier !== 'string') return null
        if (parsed.tier !== 'free' && parsed.tier !== 'pro' && parsed.tier !== 'enterprise') return null
        if (typeof parsed.issuedAt !== 'number') return null
        if (parsed.expiresAt !== null && typeof parsed.expiresAt !== 'number') return null
        if (parsed.machineId !== null && typeof parsed.machineId !== 'string') return null
        if (parsed.seatCount !== null && typeof parsed.seatCount !== 'number') return null
        if (parsed.customerId !== null && typeof parsed.customerId !== 'string') return null

        return {
            v: parsed.v,
            productId: parsed.productId,
            tier: parsed.tier,
            issuedAt: parsed.issuedAt,
            expiresAt: parsed.expiresAt ?? null,
            machineId: parsed.machineId ?? null,
            seatCount: parsed.seatCount ?? null,
            customerId: parsed.customerId ?? null,
        }
    } catch {
        return null
    }
}

export function verifyLicenseToken(
    key: string,
    publicKeyPem: string,
    options: { now?: number | undefined; expectedMachineId?: string | null | undefined } = {}
): LicenseVerifyResult {
    const now = options.now ?? Date.now()

    if (!key || key.trim().length === 0) {
        return { valid: false, reason: 'empty', token: null }
    }

    const parts = parseLicenseKey(key)
    if (!parts) {
        return { valid: false, reason: 'malformed', token: null }
    }

    const token = decodePayload(parts.payload)
    if (!token) {
        return { valid: false, reason: 'malformed', token: null }
    }

    try {
        const publicKey = createPublicKey(publicKeyPem)
        const valid = verify(null, parts.payload, publicKey, parts.signature)
        if (!valid) {
            return { valid: false, reason: 'bad-signature', token: null }
        }
    } catch {
        return { valid: false, reason: 'bad-signature', token: null }
    }

    if (token.productId !== FORTIS_PRODUCT_ID) {
        return { valid: false, reason: 'wrong-product', token }
    }

    if (token.expiresAt !== null && now > token.expiresAt) {
        return { valid: false, reason: 'expired', token }
    }

    if (token.machineId !== null && options.expectedMachineId !== undefined) {
        if (token.machineId !== options.expectedMachineId) {
            return { valid: false, reason: 'wrong-machine', token }
        }
    }

    return { valid: true, reason: 'valid', token }
}

export function generateLicenseNonce(): string {
    return randomBytes(8).toString('hex')
}

export type { KeyObject }
