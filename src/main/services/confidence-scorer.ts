import type { ThreatLevel } from '@shared/types/analysis'
import type { SensitivityLevel } from '@shared/types/settings'
import type { RuleResult } from './threat-detector'
import { SensitivityTuner } from './sensitivity-tuner'

export interface ConfidenceThresholds {
    alertThreshold: number
    silentLogThreshold: number
}

const RULE_CONFIDENCE_SCORES: Record<string, number> = {
    'malicious-port': 95,
    'tor-exit-node': 80,
    'suspicious-listen': 70,
    'process-anomaly': 90,
    'rapid-churn': 60,
    'unknown-outbound': 65,
    'data-exfiltration': 55,
    'port-scan': 80,
    'brute-force': 85,
    'dns-tunneling': 80,
}

const SEVERITY_ALERT_FLOOR: ReadonlySet<ThreatLevel> = new Set(['danger', 'critical'])

export interface ConfidenceFilterResult {
    shouldAlert: boolean
    shouldLog: boolean
    confidence: number
    reason: string
}

export class ConfidenceScorer {
    private readonly tuner: SensitivityTuner

    constructor(tuner?: SensitivityTuner) {
        this.tuner = tuner ?? new SensitivityTuner()
    }

    setSensitivityLevel(level: SensitivityLevel): void {
        this.tuner.setLevel(level)
    }

    getSensitivityLevel(): SensitivityLevel {
        return this.tuner.getLevel()
    }

    getThresholds(): ConfidenceThresholds {
        const config = this.tuner.getConfig()
        return {
            alertThreshold: config.confidenceAlertThreshold,
            silentLogThreshold: config.confidenceSilentLogThreshold,
        }
    }

    getRuleConfidenceScore(ruleId: string): number {
        return RULE_CONFIDENCE_SCORES[ruleId] ?? 50
    }

    normalizeRuleConfidence(result: RuleResult): number {
        const baseScore = RULE_CONFIDENCE_SCORES[result.ruleId]
        if (baseScore !== undefined) {
            return baseScore
        }
        return result.confidence
    }

    filterRuleResult(result: RuleResult): ConfidenceFilterResult {
        const confidence = this.normalizeRuleConfidence(result)
        const thresholds = this.getThresholds()
        const level = this.tuner.getLevel()

        if (SEVERITY_ALERT_FLOOR.has(result.threatLevel)) {
            return {
                shouldAlert: true,
                shouldLog: true,
                confidence,
                reason: `Severity ${result.threatLevel} always alerts regardless of confidence ${confidence} (${level} mode)`,
            }
        }

        if (confidence >= thresholds.alertThreshold) {
            return {
                shouldAlert: true,
                shouldLog: true,
                confidence,
                reason: `Confidence ${confidence} meets alert threshold ${thresholds.alertThreshold} (${level} mode)`,
            }
        }

        if (confidence >= thresholds.silentLogThreshold) {
            return {
                shouldAlert: false,
                shouldLog: true,
                confidence,
                reason: `Confidence ${confidence} below alert threshold ${thresholds.alertThreshold} — logged silently (${level} mode)`,
            }
        }

        return {
            shouldAlert: false,
            shouldLog: false,
            confidence,
            reason: `Confidence ${confidence} below silent log threshold ${thresholds.silentLogThreshold} — suppressed (${level} mode)`,
        }
    }

    filterAIFinding(confidence: number, threatLevel: ThreatLevel): ConfidenceFilterResult {
        const thresholds = this.getThresholds()
        const level = this.tuner.getLevel()

        if (SEVERITY_ALERT_FLOOR.has(threatLevel)) {
            return {
                shouldAlert: true,
                shouldLog: true,
                confidence,
                reason: `AI severity ${threatLevel} always alerts regardless of confidence ${confidence} (${level} mode)`,
            }
        }

        if (confidence >= thresholds.alertThreshold) {
            return {
                shouldAlert: true,
                shouldLog: true,
                confidence,
                reason: `AI confidence ${confidence} meets alert threshold ${thresholds.alertThreshold} (${level} mode)`,
            }
        }

        if (confidence >= thresholds.silentLogThreshold) {
            return {
                shouldAlert: false,
                shouldLog: true,
                confidence,
                reason: `AI confidence ${confidence} below alert threshold ${thresholds.alertThreshold} — logged silently (${level} mode)`,
            }
        }

        return {
            shouldAlert: false,
            shouldLog: false,
            confidence,
            reason: `AI confidence ${confidence} below silent log threshold ${thresholds.silentLogThreshold} — suppressed (${level} mode)`,
        }
    }

    filterBatch(results: RuleResult[]): { alerts: RuleResult[]; silentLogs: RuleResult[]; suppressed: RuleResult[] } {
        const alerts: RuleResult[] = []
        const silentLogs: RuleResult[] = []
        const suppressed: RuleResult[] = []

        for (const result of results) {
            const filterResult = this.filterRuleResult(result)

            if (filterResult.shouldAlert) {
                alerts.push({ ...result, confidence: filterResult.confidence })
            } else if (filterResult.shouldLog) {
                silentLogs.push({ ...result, confidence: filterResult.confidence })
            } else {
                suppressed.push({ ...result, confidence: filterResult.confidence })
            }
        }

        return { alerts, silentLogs, suppressed }
    }

    getConfidenceScoreMap(): ReadonlyMap<string, number> {
        return new Map(Object.entries(RULE_CONFIDENCE_SCORES))
    }

    static getDefaultThresholds(level: SensitivityLevel): ConfidenceThresholds {
        const config = SensitivityTuner.getConfigForLevel(level)
        return {
            alertThreshold: config.confidenceAlertThreshold,
            silentLogThreshold: config.confidenceSilentLogThreshold,
        }
    }
}
