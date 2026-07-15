import { BrowserWindow } from 'electron'
import type { DatabaseService } from './database'
import type { FortisEventBus } from './event-bus'
import type { ComplianceFramework, ComplianceReport } from '../../shared/types/m6'
import { buildComplianceReport, type ComplianceEvidence } from './compliance/compliance-template'
import { brandingHeaderHtml } from './compliance/report-branding'

interface ComplianceServiceDeps {
    database: DatabaseService
    eventBus: FortisEventBus
    retentionDays: () => number
}

const FRAMEWORK_LABEL: Record<ComplianceFramework, string> = {
    soc2: 'SOC 2',
    iso27001: 'ISO 27001',
    pci: 'PCI DSS',
    hipaa: 'HIPAA',
    gdpr: 'GDPR',
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export class ComplianceService {
    private last: ComplianceReport | null = null

    constructor(private readonly deps: ComplianceServiceDeps) {}

    private gatherEvidence(): ComplianceEvidence {
        const counts = this.deps.database.getAlertCounts()
        const auditActions = this.deps.database.getDefenseActions().length
        return {
            encryptionAtRest: true,
            rbacEnabled: this.deps.database.getSetting('rbacEnabled') === true,
            retentionDays: this.deps.retentionDays(),
            alertCount: counts.total,
            backupEncrypted: true,
            auditLogPresent: auditActions > 0,
            generatedAt: Date.now(),
            orgName: this.deps.database.getSetting('complianceOrgName') ?? '',
        }
    }

    generate(framework: ComplianceFramework): ComplianceReport {
        const evidence = this.gatherEvidence()
        const report = buildComplianceReport(framework, evidence)
        this.last = report
        this.deps.eventBus.emit('compliance:ready', { report })
        return report
    }

    getLast(): ComplianceReport | null {
        return this.last
    }

    renderHtml(report: ComplianceReport): string {
        const accent = this.deps.database.getSetting('complianceAccentColor') ?? '#3b82f6'
        const header = brandingHeaderHtml({ orgName: report.orgName, accentColor: accent })
        const rows = report.controls
            .map(
                (c) =>
                    `<tr><td>${escapeHtml(c.id)}</td><td>${escapeHtml(c.title)}</td><td>${c.status.toUpperCase()}</td><td>${escapeHtml(c.evidence)}</td></tr>`,
            )
            .join('')
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;color:#111;padding:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;font-size:13px}th{color:#666}</style></head><body>${header}<h2>${FRAMEWORK_LABEL[report.framework]} Compliance</h2><p>Pass ${report.summary.pass} · Warn ${report.summary.warn} · Fail ${report.summary.fail} · N/A ${report.summary.na}</p><table><thead><tr><th>Control</th><th>Title</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
    }

    async exportPdf(framework: ComplianceFramework): Promise<string> {
        const report = this.generate(framework)
        const html = this.renderHtml(report)
        const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
        try {
            await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
            const pdf = await win.webContents.printToPDF({ printBackground: true })
            return pdf.toString('base64')
        } catch (err) {
            console.error('[Compliance] printToPDF failed:', err instanceof Error ? err.message : err)
            return ''
        } finally {
            if (!win.isDestroyed()) win.destroy()
        }
    }
}
