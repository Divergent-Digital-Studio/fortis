import { BrowserWindow } from 'electron'
import type { DatabaseService } from '../database'
import { exportReport } from './report-export'

export class ReportPdfExporter {
    constructor(private readonly database: DatabaseService) {}

    async exportPdf(reportId: string): Promise<string> {
        const report = this.database.getReports(Number.MAX_SAFE_INTEGER).find((r) => r.id === reportId)
        if (!report) return ''
        const html = exportReport(report, 'html')
        const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
        try {
            await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
            const pdf = await win.webContents.printToPDF({ printBackground: true })
            return pdf.toString('base64')
        } catch (err) {
            console.error('[Export] printToPDF failed:', err instanceof Error ? err.message : err)
            return ''
        } finally {
            if (!win.isDestroyed()) win.destroy()
        }
    }
}
