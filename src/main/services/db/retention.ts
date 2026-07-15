import type { SubscriptionTier } from '@shared/types/settings'
import { TIER_CONFIGS } from '../tier-gating'

const HOUR_MS = 60 * 60 * 1000
const FALLBACK_RETENTION_HOURS = 24
const PAID_RETENTION_HOURS = 30 * 24

function resolveRetentionHours(tier: SubscriptionTier | string | undefined): number {
    const config = TIER_CONFIGS[tier as SubscriptionTier]
    if (!config) return FALLBACK_RETENTION_HOURS
    if (config.alertHistoryHours === null) return PAID_RETENTION_HOURS
    return config.alertHistoryHours
}

function retentionMsForTier(tier: SubscriptionTier | string | undefined): number {
    return resolveRetentionHours(tier) * HOUR_MS
}

function retentionCutoff(tier: SubscriptionTier | string | undefined, now: number): number {
    return now - retentionMsForTier(tier)
}

function computeM1RetentionCutoff(
    limits: { alertHistoryHours: number | null },
    now: number,
): number | null {
    if (limits.alertHistoryHours === null) return null
    return now - limits.alertHistoryHours * HOUR_MS
}

function computeReportRetentionCutoff(
    limits: { alertHistoryHours: number | null },
    now: number,
): number | null {
    return computeM1RetentionCutoff(limits, now)
}

export { resolveRetentionHours, retentionMsForTier, retentionCutoff, computeM1RetentionCutoff, computeReportRetentionCutoff }
