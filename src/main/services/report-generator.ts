import { randomUUID } from 'crypto'
import type { FortisEventBus } from './event-bus'
import type { IDatabaseService } from './database'
import type { NetworkConnection } from '../../shared/types/connection'
import type { WeeklyReport, ReportGeneratedBy } from '../../shared/types/m2'
import type { AIAnalyzerService } from './ai-analyzer'
import { buildRollup } from './reports/report-rollup'
import { DAY_MS, DEFAULT_PERIOD_DAYS, clampPeriodDays } from './reports/report-schedule'

interface ConnectionSource {
    getPreviousConnections(): NetworkConnection[]
}

interface CountryLookup {
    getCurrentGeoConnections(): Array<{ remoteAddress: string; countryName: string | null }>
}

interface ReportGeneratorDeps {
    db: IDatabaseService
    eventBus: FortisEventBus
    monitor: ConnectionSource
    analyzer: AIAnalyzerService | null
    geoProvider: CountryLookup | null
}

function buildLocalSummary(
    periodDays: number,
    connectionCount: number,
    threatCount: number,
    newDeviceCount: number,
    topProcess: string | null,
): string {
    const parts: string[] = []
    parts.push(`Over the past ${periodDays} day(s) Fortis observed ${connectionCount} active connection(s).`)
    if (threatCount > 0) {
        parts.push(`${threatCount} alert(s) were raised.`)
    } else {
        parts.push('No alerts were raised.')
    }
    if (newDeviceCount > 0) {
        parts.push(`${newDeviceCount} new device(s) appeared on the network.`)
    }
    if (topProcess) {
        parts.push(`The most active process was ${topProcess}.`)
    }
    return parts.join(' ')
}

class ReportGenerator {
    private readonly db: IDatabaseService
    private readonly eventBus: FortisEventBus
    private readonly monitor: ConnectionSource
    private readonly analyzer: AIAnalyzerService | null
    private readonly geoProvider: CountryLookup | null

    constructor(deps: ReportGeneratorDeps) {
        this.db = deps.db
        this.eventBus = deps.eventBus
        this.monitor = deps.monitor
        this.analyzer = deps.analyzer
        this.geoProvider = deps.geoProvider
    }

    async generate(periodDays: number = DEFAULT_PERIOD_DAYS): Promise<WeeklyReport> {
        const days = clampPeriodDays(periodDays)
        const now = Date.now()
        const periodStart = now - days * DAY_MS
        const connections = this.monitor.getPreviousConnections()

        const countryMap = new Map<string, string | null>()
        if (this.geoProvider) {
            for (const geo of this.geoProvider.getCurrentGeoConnections()) {
                countryMap.set(geo.remoteAddress, geo.countryName)
            }
        }

        const alerts = this.db.getAlertsFiltered({ dateFrom: periodStart, dateTo: now })
        const threatCount = alerts.length

        const devices = this.db.getWifiDevices()
        const newDeviceCount = devices.filter((d) => d.firstSeen >= periodStart).length

        let healthScore: number | null = null
        let summary = ''
        let generatedBy: ReportGeneratedBy = 'local'

        if (this.analyzer && this.analyzer.getActiveProvider() && connections.length > 0) {
            try {
                const analysis = await this.analyzer.analyzeFull(connections)
                healthScore = analysis.healthScore
                summary = analysis.summary
                generatedBy = analysis.provider === 'degraded' ? 'local' : 'ai'
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error)
                console.warn(`[ReportGenerator] AI summary unavailable, using local summary: ${reason}`)
            }
        }

        const rollup = buildRollup({
            connections: connections.map((c) => ({ processName: c.processName, remoteAddress: c.remoteAddress })),
            threatCount,
            newDeviceCount,
            healthScore,
            countryOf: (addr) => countryMap.get(addr) ?? null,
        })

        if (summary.length === 0) {
            summary = buildLocalSummary(
                days,
                connections.length,
                threatCount,
                newDeviceCount,
                rollup.topProcesses[0]?.name ?? null,
            )
            generatedBy = 'local'
        }

        const report: WeeklyReport = {
            id: randomUUID(),
            generatedAt: now,
            periodStart,
            periodEnd: now,
            summary,
            healthScore: rollup.healthScore,
            topProcesses: rollup.topProcesses,
            topDestinations: rollup.topDestinations,
            threatCount: rollup.threatCount,
            newDeviceCount: rollup.newDeviceCount,
            generatedBy,
        }

        this.db.insertReport(report)
        this.eventBus.emit('report:generated', { reports: this.db.getReports() })

        return report
    }
}

export { ReportGenerator }
