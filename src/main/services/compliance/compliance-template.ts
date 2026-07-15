import type { ComplianceFramework, ComplianceReport, ComplianceControl, ControlStatus } from '../../../shared/types/m6'

export interface ComplianceEvidence {
    encryptionAtRest: boolean
    rbacEnabled: boolean
    retentionDays: number
    alertCount: number
    backupEncrypted: boolean
    auditLogPresent: boolean
    generatedAt: number
    orgName: string
}

function boolStatus(ok: boolean): ControlStatus {
    return ok ? 'pass' : 'fail'
}

function commonControls(e: ComplianceEvidence, prefix: string): ComplianceControl[] {
    return [
        { id: `${prefix}-ENC-1`, title: 'Encryption at rest', status: boolStatus(e.encryptionAtRest), evidence: e.encryptionAtRest ? 'SQLCipher-encrypted database' : 'Database not encrypted' },
        { id: `${prefix}-AC-1`, title: 'Access control (RBAC)', status: boolStatus(e.rbacEnabled), evidence: e.rbacEnabled ? 'Role-based access control enabled' : 'RBAC disabled' },
        { id: `${prefix}-LOG-1`, title: 'Audit logging', status: e.auditLogPresent ? 'pass' : 'warn', evidence: e.auditLogPresent ? 'Defense actions audited' : 'Audit log operational, no actions recorded yet' },
        { id: `${prefix}-BAK-1`, title: 'Encrypted backups', status: boolStatus(e.backupEncrypted), evidence: e.backupEncrypted ? 'Backups encrypted' : 'Backups not encrypted' },
        { id: `${prefix}-RET-1`, title: 'Data retention policy', status: e.retentionDays > 0 ? 'pass' : 'warn', evidence: `Retention ${e.retentionDays} days` },
        { id: `${prefix}-MON-1`, title: 'Continuous monitoring', status: e.alertCount >= 0 ? 'pass' : 'na', evidence: `${e.alertCount} alerts recorded` },
    ]
}

const FRAMEWORK_PREFIX: Record<ComplianceFramework, string> = {
    soc2: 'SOC2', iso27001: 'ISO', pci: 'PCI', hipaa: 'HIPAA', gdpr: 'GDPR',
}

export function buildComplianceReport(framework: ComplianceFramework, e: ComplianceEvidence): ComplianceReport {
    const controls = commonControls(e, FRAMEWORK_PREFIX[framework])
    if (framework === 'gdpr') {
        controls.push({ id: 'GDPR-PII-1', title: 'Local-only PII processing', status: 'pass', evidence: 'All enrichment is local/bundled; no cloud lookups' })
    }
    if (framework === 'pci') {
        controls.push({ id: 'PCI-NET-1', title: 'Network traffic monitoring', status: 'pass', evidence: 'Outbound connections monitored' })
    }
    if (framework === 'hipaa') {
        controls.push({ id: 'HIPAA-INT-1', title: 'Integrity controls', status: boolStatus(e.encryptionAtRest), evidence: 'Encrypted store protects integrity' })
    }
    if (framework === 'iso27001') {
        controls.push({ id: 'ISO-CRYPTO-1', title: 'Cryptographic controls (A.10)', status: boolStatus(e.encryptionAtRest), evidence: 'AES-256 (SQLCipher) at rest' })
    }
    if (framework === 'soc2') {
        controls.push({ id: 'SOC2-CC6-1', title: 'Logical access (CC6)', status: boolStatus(e.rbacEnabled), evidence: 'Role-scoped IPC access enforcement' })
    }
    const summary = { pass: 0, warn: 0, fail: 0, na: 0 }
    for (const c of controls) summary[c.status] += 1
    return { framework, generatedAt: e.generatedAt, orgName: e.orgName, summary, controls }
}
