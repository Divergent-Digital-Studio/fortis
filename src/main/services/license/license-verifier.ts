import { verifyLicenseToken, type LicenseVerifyResult } from './license-token'
import { FORTIS_LICENSE_PUBLIC_KEY_PEM } from './public-key'
import type { SubscriptionTier, LicenseStatus } from '../../../shared/types/settings'

export interface VerifiedTier {
    tier: SubscriptionTier
    valid: boolean
    reason: string
    expiresAt: number | null
    machineLocked: boolean
    customerId: string | null
    seatCount: number | null
}

export const FREE_TIER: VerifiedTier = {
    tier: 'free',
    valid: false,
    reason: 'no-license',
    expiresAt: null,
    machineLocked: false,
    customerId: null,
    seatCount: null,
}

export function verifyStoredLicense(
    licenseKey: string,
    options: { now?: number | undefined; machineId?: string | null | undefined } = {}
): VerifiedTier {
    if (!licenseKey || licenseKey.trim().length === 0) {
        return { ...FREE_TIER }
    }

    try {
        const verifyOptions: { now?: number; expectedMachineId?: string | null } = {}
        if (options.now !== undefined) verifyOptions.now = options.now
        if (options.machineId !== undefined) verifyOptions.expectedMachineId = options.machineId

        const result: LicenseVerifyResult = verifyLicenseToken(licenseKey, FORTIS_LICENSE_PUBLIC_KEY_PEM, verifyOptions)

        if (!result.valid || !result.token) {
            return {
                tier: 'free',
                valid: false,
                reason: result.reason,
                expiresAt: result.token?.expiresAt ?? null,
                machineLocked: result.token?.machineId !== null && result.token?.machineId !== undefined,
                customerId: result.token?.customerId ?? null,
                seatCount: result.token?.seatCount ?? null,
            }
        }

        return {
            tier: result.token.tier,
            valid: true,
            reason: 'valid',
            expiresAt: result.token.expiresAt,
            machineLocked: result.token.machineId !== null,
            customerId: result.token.customerId,
            seatCount: result.token.seatCount,
        }
    } catch {
        return { ...FREE_TIER, reason: 'unexpected-error' }
    }
}

export function tierFromLicense(licenseKey: string, options?: { now?: number | undefined; machineId?: string | null | undefined }): SubscriptionTier {
    return verifyStoredLicense(licenseKey, options).tier
}

export function toLicenseStatus(verified: VerifiedTier): LicenseStatus {
    return {
        tier: verified.tier,
        valid: verified.valid,
        reason: verified.reason,
        expiresAt: verified.expiresAt,
        machineLocked: verified.machineLocked,
        customerId: verified.customerId,
        seatCount: verified.seatCount,
    }
}
