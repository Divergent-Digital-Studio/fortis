import type { SensitivityLevel } from '@shared/types/settings'

export interface SensitivityConfig {
    confidenceAlertThreshold: number
    confidenceSilentLogThreshold: number
    notificationMaxPerWindow: number
    notificationWindowMs: number
    warningBatchIntervalMs: number
    smartTriggerDebounceMs: number
    smartTriggerChurnThreshold: number
    smartTriggerMinNewConnections: number
}

const SENSITIVITY_CONFIGS: Record<SensitivityLevel, SensitivityConfig> = {
    paranoid: {
        confidenceAlertThreshold: 60,
        confidenceSilentLogThreshold: 30,
        notificationMaxPerWindow: 10,
        notificationWindowMs: 15 * 60 * 1000,
        warningBatchIntervalMs: 2 * 60 * 1000,
        smartTriggerDebounceMs: 1 * 60 * 1000,
        smartTriggerChurnThreshold: 10,
        smartTriggerMinNewConnections: 1,
    },
    balanced: {
        confidenceAlertThreshold: 75,
        confidenceSilentLogThreshold: 50,
        notificationMaxPerWindow: 5,
        notificationWindowMs: 15 * 60 * 1000,
        warningBatchIntervalMs: 5 * 60 * 1000,
        smartTriggerDebounceMs: 2 * 60 * 1000,
        smartTriggerChurnThreshold: 20,
        smartTriggerMinNewConnections: 3,
    },
    relaxed: {
        confidenceAlertThreshold: 90,
        confidenceSilentLogThreshold: 70,
        notificationMaxPerWindow: 3,
        notificationWindowMs: 30 * 60 * 1000,
        warningBatchIntervalMs: 10 * 60 * 1000,
        smartTriggerDebounceMs: 5 * 60 * 1000,
        smartTriggerChurnThreshold: 40,
        smartTriggerMinNewConnections: 8,
    },
}

type SensitivityChangeListener = (level: SensitivityLevel, config: SensitivityConfig) => void

export class SensitivityTuner {
    private currentLevel: SensitivityLevel = 'balanced'
    private listeners: SensitivityChangeListener[] = []

    getLevel(): SensitivityLevel {
        return this.currentLevel
    }

    getConfig(): SensitivityConfig {
        return SENSITIVITY_CONFIGS[this.currentLevel]
    }

    setLevel(level: SensitivityLevel): void {
        if (level === this.currentLevel) return

        const validLevels: SensitivityLevel[] = ['paranoid', 'balanced', 'relaxed']
        if (!validLevels.includes(level)) return

        this.currentLevel = level
        const config = this.getConfig()

        for (const listener of this.listeners) {
            try {
                listener(level, config)
            } catch {
                // noop — listener failure is non-critical
            }
        }
    }

    onLevelChange(listener: SensitivityChangeListener): void {
        this.listeners.push(listener)
    }

    removeListener(listener: SensitivityChangeListener): void {
        this.listeners = this.listeners.filter((l) => l !== listener)
    }

    static getConfigForLevel(level: SensitivityLevel): SensitivityConfig {
        return SENSITIVITY_CONFIGS[level]
    }

    static getAllConfigs(): ReadonlyMap<SensitivityLevel, SensitivityConfig> {
        return new Map(Object.entries(SENSITIVITY_CONFIGS) as [SensitivityLevel, SensitivityConfig][])
    }

    dispose(): void {
        this.listeners = []
    }
}
