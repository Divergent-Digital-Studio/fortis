import { describe, it, expect } from 'vitest'
import { ConfidenceScorer } from '@main/services/confidence-scorer'
import { SensitivityTuner } from '@main/services/sensitivity-tuner'
import type { RuleResult } from '@main/services/threat-detector'

function makeRuleResult(overrides: Partial<RuleResult>): RuleResult {
    return {
        ruleId: overrides.ruleId ?? 'data-exfiltration',
        ruleName: overrides.ruleName ?? 'Rule',
        threatLevel: overrides.threatLevel ?? 'danger',
        confidence: overrides.confidence ?? 85,
        reason: 'reason',
        recommendation: 'rec',
        connectionId: 'c1',
        ...overrides,
    }
}

function relaxedScorer(): ConfidenceScorer {
    const tuner = new SensitivityTuner()
    tuner.setLevel('relaxed')
    return new ConfidenceScorer(tuner)
}

describe('BE-15 danger severity floor in relaxed mode', () => {
    it('danger results for data-exfiltration / port-scan / brute-force alert in relaxed', () => {
        const scorer = relaxedScorer()
        for (const ruleId of ['data-exfiltration', 'port-scan', 'brute-force']) {
            const result = scorer.filterRuleResult(makeRuleResult({ ruleId, threatLevel: 'danger' }))
            expect(result.shouldAlert, ruleId).toBe(true)
        }
    })

    it('critical results always alert in relaxed', () => {
        const scorer = relaxedScorer()
        const result = scorer.filterRuleResult(
            makeRuleResult({ ruleId: 'rapid-churn', threatLevel: 'critical', confidence: 10 }),
        )
        expect(result.shouldAlert).toBe(true)
    })

    it('an info result does NOT alert in relaxed', () => {
        const scorer = relaxedScorer()
        const result = scorer.filterRuleResult(
            makeRuleResult({ ruleId: 'rapid-churn', threatLevel: 'info', confidence: 60 }),
        )
        expect(result.shouldAlert).toBe(false)
    })

    it('filterBatch routes danger to alerts not silentLogs in relaxed', () => {
        const scorer = relaxedScorer()
        const { alerts, silentLogs } = scorer.filterBatch([
            makeRuleResult({ ruleId: 'data-exfiltration', threatLevel: 'danger' }),
        ])
        expect(alerts.length).toBe(1)
        expect(silentLogs.length).toBe(0)
    })

    it('filterAIFinding alerts on danger regardless of confidence in relaxed', () => {
        const scorer = relaxedScorer()
        const result = scorer.filterAIFinding(40, 'danger')
        expect(result.shouldAlert).toBe(true)
    })
})

describe('BE-16 dns-tunneling alerts in balanced', () => {
    it('balanced dns-tunneling rule result alerts', () => {
        const tuner = new SensitivityTuner()
        const scorer = new ConfidenceScorer(tuner)
        const result = scorer.filterRuleResult(
            makeRuleResult({ ruleId: 'dns-tunneling', threatLevel: 'warning' }),
        )
        expect(result.shouldAlert).toBe(true)
    })

    it('dns-tunneling base confidence is at least balanced threshold (75)', () => {
        const scorer = new ConfidenceScorer(new SensitivityTuner())
        expect(scorer.getRuleConfidenceScore('dns-tunneling')).toBeGreaterThanOrEqual(75)
    })
})
