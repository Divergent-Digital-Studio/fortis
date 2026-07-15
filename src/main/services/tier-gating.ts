import type { IDatabaseService } from './database';
import type { FortisEventBus } from './event-bus';
import type { SubscriptionTier } from '../../shared/types/settings';
import { verifyStoredLicense, type VerifiedTier } from './license/license-verifier';
import { machineIdSync } from './machine-id';

interface TierLimits {
    dailyScans: number;
    autoTriggersEnabled: boolean;
    notificationsEnabled: boolean;
    alertHistoryHours: number | null;
    aiProviderSelectionEnabled: boolean;
}

const TIER_CONFIGS: Record<SubscriptionTier, TierLimits> = {
    free: {
        dailyScans: 3,
        autoTriggersEnabled: false,
        notificationsEnabled: false,
        alertHistoryHours: 24,
        aiProviderSelectionEnabled: false,
    },
    pro: {
        dailyScans: Infinity,
        autoTriggersEnabled: true,
        notificationsEnabled: true,
        alertHistoryHours: null,
        aiProviderSelectionEnabled: true,
    },
    enterprise: {
        dailyScans: Infinity,
        autoTriggersEnabled: true,
        notificationsEnabled: true,
        alertHistoryHours: null,
        aiProviderSelectionEnabled: true,
    },
};

function todayDateString(): string {
    return new Date().toISOString().slice(0, 10);
}

function getTierLimitsFor(tier: SubscriptionTier): TierLimits {
    return TIER_CONFIGS[tier] ?? TIER_CONFIGS.free;
}

class TierGatingService {
    private readonly db: IDatabaseService;
    private readonly eventBus: FortisEventBus;

    constructor(db: IDatabaseService, eventBus: FortisEventBus) {
        this.db = db;
        this.eventBus = eventBus;
    }

    getCurrentTier(): SubscriptionTier {
        return this.getVerifiedTier().tier;
    }

    getVerifiedTier(): VerifiedTier {
        const licenseKey = this.db.getSetting('licenseKey')
        const stored = typeof licenseKey === 'string' ? licenseKey : ''
        return verifyStoredLicense(stored, { machineId: machineIdSync() });
    }

    getTierLimits(tier?: SubscriptionTier): TierLimits {
        const resolvedTier = tier ?? this.getCurrentTier();
        return TIER_CONFIGS[resolvedTier] ?? TIER_CONFIGS.free;
    }

    isPaidTier(): boolean {
        return this.getCurrentTier() !== 'free';
    }

    canPerformManualScan(): { allowed: boolean; reason: string; remaining: number } {
        const tier = this.getCurrentTier();
        const limits = this.getTierLimits(tier);

        if (limits.dailyScans === Infinity) {
            return { allowed: true, reason: 'paid_tier', remaining: Infinity };
        }

        this.maybeResetDailyCounter();

        const used = this.getDailyScansUsed();
        const remaining = Math.max(0, limits.dailyScans - used);

        if (remaining <= 0) {
            return { allowed: false, reason: 'scans_exhausted', remaining: 0 };
        }

        return { allowed: true, reason: 'scans_available', remaining };
    }

    canTriggerAutomatically(): boolean {
        const limits = this.getTierLimits();
        if (!limits.autoTriggersEnabled) return false;

        if (limits.dailyScans === Infinity) return true;

        this.maybeResetDailyCounter();
        const used = this.getDailyScansUsed();
        return used < limits.dailyScans;
    }

    isNotificationsAllowed(): boolean {
        return this.getTierLimits().notificationsEnabled;
    }

    getAlertHistoryFilter(): { dateFrom: number } | null {
        const limits = this.getTierLimits();
        if (limits.alertHistoryHours === null) return null;

        const dateFrom = Date.now() - limits.alertHistoryHours * 60 * 60 * 1000;
        return { dateFrom };
    }

    tryConsumeScan(): { allowed: boolean; remaining: number } {
        const tier = this.getCurrentTier();
        const limits = this.getTierLimits(tier);

        if (limits.dailyScans === Infinity) {
            return { allowed: true, remaining: Infinity };
        }

        this.maybeResetDailyCounter();

        const used = this.getDailyScansUsed();
        const remaining = Math.max(0, limits.dailyScans - used);

        if (remaining <= 0) {
            return { allowed: false, remaining: 0 };
        }

        const newUsed = used + 1;
        this.db.setSetting('dailyAiScansUsed', newUsed);
        this.db.setSetting('lastScanDate', todayDateString());

        const newRemaining = Math.max(0, limits.dailyScans - newUsed);
        this.eventBus.emit('tier:scan-used', { remaining: newRemaining });

        return { allowed: true, remaining: newRemaining };
    }

    refundScan(): void {
        const tier = this.getCurrentTier();
        const limits = this.getTierLimits(tier);

        if (limits.dailyScans === Infinity) return;

        this.maybeResetDailyCounter();

        const used = this.getDailyScansUsed();
        if (used <= 0) return;

        const newUsed = used - 1;
        this.db.setSetting('dailyAiScansUsed', newUsed);

        const remaining = Math.max(0, limits.dailyScans - newUsed);
        this.eventBus.emit('tier:scan-used', { remaining });
    }

    getRemainingScans(): number {
        const limits = this.getTierLimits();
        if (limits.dailyScans === Infinity) return Infinity;

        this.maybeResetDailyCounter();
        const used = this.getDailyScansUsed();
        return Math.max(0, limits.dailyScans - used);
    }

    getTotalAllowedScans(): number {
        return this.getTierLimits().dailyScans;
    }

    private getDailyScansUsed(): number {
        const used = this.db.getSetting('dailyAiScansUsed');
        return typeof used === 'number' ? used : 0;
    }

    private maybeResetDailyCounter(): void {
        const today = todayDateString();
        const lastDate = this.db.getSetting('lastScanDate');

        if (lastDate !== today) {
            this.db.setSetting('dailyAiScansUsed', 0);
            this.db.setSetting('lastScanDate', today);
        }
    }
}

export { TierGatingService, TIER_CONFIGS, getTierLimitsFor };
export type { TierLimits };
