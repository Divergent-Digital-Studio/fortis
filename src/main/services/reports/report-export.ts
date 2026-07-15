import type { WeeklyReport, ReportExportFormat } from '../../../shared/types/m2'

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function formatDate(ms: number): string {
    return new Date(ms).toISOString()
}

function toMarkdown(report: WeeklyReport): string {
    const lines: string[] = []
    lines.push(`# Fortis Weekly Report`)
    lines.push('')
    lines.push(`- Period: ${formatDate(report.periodStart)} to ${formatDate(report.periodEnd)}`)
    lines.push(`- Generated: ${formatDate(report.generatedAt)} (${report.generatedBy})`)
    lines.push(`- Health score: ${report.healthScore ?? 'n/a'}`)
    lines.push(`- Threats: ${report.threatCount}`)
    lines.push(`- New devices: ${report.newDeviceCount}`)
    lines.push('')
    lines.push(`## Summary`)
    lines.push('')
    lines.push(report.summary)
    lines.push('')
    lines.push(`## Top processes`)
    lines.push('')
    for (const p of report.topProcesses) {
        lines.push(`- ${p.name}: ${p.count}`)
    }
    lines.push('')
    lines.push(`## Top destinations`)
    lines.push('')
    for (const d of report.topDestinations) {
        lines.push(`- ${d.address}${d.country ? ` (${d.country})` : ''}: ${d.count}`)
    }
    lines.push('')
    return lines.join('\n')
}

function toHtml(report: WeeklyReport): string {
    const processRows = report.topProcesses
        .map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${p.count}</td></tr>`)
        .join('')
    const destinationRows = report.topDestinations
        .map((d) => `<tr><td>${escapeHtml(d.address)}</td><td>${escapeHtml(d.country ?? '')}</td><td>${d.count}</td></tr>`)
        .join('')

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Fortis Weekly Report</title>
<style>
body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
h1 { font-size: 1.5rem; }
table { border-collapse: collapse; margin: 0.5rem 0; }
td, th { border: 1px solid #ccc; padding: 0.25rem 0.75rem; text-align: left; }
</style>
</head>
<body>
<h1>Fortis Weekly Report</h1>
<p>Period: ${escapeHtml(formatDate(report.periodStart))} to ${escapeHtml(formatDate(report.periodEnd))}</p>
<p>Generated: ${escapeHtml(formatDate(report.generatedAt))} (${escapeHtml(report.generatedBy)})</p>
<p>Health score: ${report.healthScore ?? 'n/a'} &middot; Threats: ${report.threatCount} &middot; New devices: ${report.newDeviceCount}</p>
<h2>Summary</h2>
<p>${escapeHtml(report.summary)}</p>
<h2>Top processes</h2>
<table><thead><tr><th>Process</th><th>Count</th></tr></thead><tbody>${processRows}</tbody></table>
<h2>Top destinations</h2>
<table><thead><tr><th>Address</th><th>Country</th><th>Count</th></tr></thead><tbody>${destinationRows}</tbody></table>
</body>
</html>`
}

function csvCell(value: string | number | null): string {
    const s = value === null ? '' : String(value)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(report: WeeklyReport): string {
    const headers = [
        'id',
        'generatedAt',
        'periodStart',
        'periodEnd',
        'healthScore',
        'threatCount',
        'newDeviceCount',
        'generatedBy',
        'summary',
        'topProcesses',
        'topDestinations',
    ]
    const row: Array<string | number | null> = [
        report.id,
        report.generatedAt,
        report.periodStart,
        report.periodEnd,
        report.healthScore,
        report.threatCount,
        report.newDeviceCount,
        report.generatedBy,
        report.summary,
        report.topProcesses.map((p) => `${p.name}:${p.count}`).join('; '),
        report.topDestinations.map((d) => `${d.address}(${d.country ?? ''}):${d.count}`).join('; '),
    ]
    return `${headers.join(',')}\n${row.map(csvCell).join(',')}\n`
}

export function exportReport(report: WeeklyReport, format: ReportExportFormat): string {
    switch (format) {
        case 'markdown':
            return toMarkdown(report)
        case 'html':
            return toHtml(report)
        case 'csv':
            return toCsv(report)
        case 'pdf':
            return ''
        case 'json':
        default:
            return JSON.stringify(report, null, 2)
    }
}
