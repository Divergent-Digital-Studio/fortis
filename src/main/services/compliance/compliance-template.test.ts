import { describe, it, expect } from 'vitest'
import { buildComplianceReport, type ComplianceEvidence } from './compliance-template'

const evidence: ComplianceEvidence = {
    encryptionAtRest: true,
    rbacEnabled: true,
    retentionDays: 30,
    alertCount: 5,
    backupEncrypted: true,
    auditLogPresent: true,
    generatedAt: 1000,
    orgName: 'Acme',
}

describe('compliance-template', () => {
    it('produces controls and a summary for each framework', () => {
        for (const fw of ['soc2', 'iso27001', 'pci', 'hipaa', 'gdpr'] as const) {
            const r = buildComplianceReport(fw, evidence)
            expect(r.framework).toBe(fw)
            expect(r.controls.length).toBeGreaterThan(0)
            const total = r.summary.pass + r.summary.warn + r.summary.fail + r.summary.na
            expect(total).toBe(r.controls.length)
        }
    })
    it('marks the encryption control as fail when encryption is off', () => {
        const r = buildComplianceReport('soc2', { ...evidence, encryptionAtRest: false })
        const enc = r.controls.find((c) => c.id.includes('ENC'))
        expect(enc?.status).toBe('fail')
    })
    it('marks access-control pass when RBAC is on', () => {
        const r = buildComplianceReport('soc2', evidence)
        const ac = r.controls.find((c) => c.id.includes('AC'))
        expect(ac?.status).toBe('pass')
    })
})
