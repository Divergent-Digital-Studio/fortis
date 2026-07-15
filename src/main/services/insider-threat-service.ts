import type { DatabaseService } from './database'
import type { FortisEventBus } from './event-bus'
import type { NetworkConnection } from '../../shared/types/connection'
import type { Alert } from '../../shared/types/alert'
import type { InsiderThreatEvent } from '../../shared/types/m6'
import type { BandwidthSnapshot } from '../../shared/types/m3'
import { scoreBehavior, type Baseline, type BehaviorWindow } from './insider/insider-threat'

const MAX_EVENTS = 100
const ALERT_THRESHOLD = 60
const TYPICAL_HOUR_START = 8
const TYPICAL_HOUR_END = 20
const EGRESS_SAMPLES_MAX = 12
const MAX_TRACKED_PROCESSES = 256

interface InsiderThreatServiceDeps {
    database: DatabaseService
    eventBus: FortisEventBus
    onAlert: (alert: Alert) => void
    now?: () => number
}

export class InsiderThreatService {
    private handler: ((p: { connections: NetworkConnection[] }) => void) | null = null
    private bandwidthHandler: ((p: { snapshot: BandwidthSnapshot }) => void) | null = null
    private readonly recentEvents: InsiderThreatEvent[] = []
    private readonly now: () => number
    private readonly egressByProcess: Map<string, number[]> = new Map()

    constructor(private readonly deps: InsiderThreatServiceDeps) {
        this.now = deps.now ?? (() => Date.now())
    }

    start(): void {
        if (this.handler) return
        this.handler = (p) => this.onScan(p.connections)
        this.deps.eventBus.on('scan:complete', this.handler)
        this.bandwidthHandler = (p) => this.onBandwidth(p.snapshot)
        this.deps.eventBus.on('bandwidth:updated', this.bandwidthHandler)
    }

    stop(): void {
        if (this.handler) {
            this.deps.eventBus.off('scan:complete', this.handler)
            this.handler = null
        }
        if (this.bandwidthHandler) {
            this.deps.eventBus.off('bandwidth:updated', this.bandwidthHandler)
            this.bandwidthHandler = null
        }
    }

    getRecentEvents(): InsiderThreatEvent[] {
        return [...this.recentEvents]
    }

    private isEnabled(): boolean {
        return this.deps.database.getSetting('insiderThreatEnabled') === true
    }

    private onBandwidth(snapshot: BandwidthSnapshot): void {
        if (snapshot.status !== 'ready') return
        const perProcess = new Map<string, number>()
        for (const p of snapshot.processes) {
            const name = p.processName || `pid-${p.pid}`
            perProcess.set(name, (perProcess.get(name) ?? 0) + (p.bytesOutPerSec ?? 0))
        }
        for (const [name, bytesOut] of perProcess) {
            const samples = this.egressByProcess.get(name) ?? []
            samples.push(bytesOut)
            if (samples.length > EGRESS_SAMPLES_MAX) samples.shift()
            if (!this.egressByProcess.has(name) && this.egressByProcess.size >= MAX_TRACKED_PROCESSES) {
                const oldest = this.egressByProcess.keys().next().value
                if (oldest) this.egressByProcess.delete(oldest)
            }
            this.egressByProcess.set(name, samples)
        }
    }

    private egressStatsFor(processName: string): { bytes: number; avg: number } {
        const samples = this.egressByProcess.get(processName)
        if (!samples || samples.length === 0) return { bytes: 0, avg: 0 }
        const latest = samples[samples.length - 1] ?? 0
        const baselineSamples = samples.length > 1 ? samples.slice(0, -1) : samples
        const avg = baselineSamples.reduce((a, b) => a + b, 0) / baselineSamples.length
        return { bytes: latest, avg }
    }

    private onScan(connections: NetworkConnection[]): void {
        if (!this.isEnabled()) return
        const ts = this.now()
        const hour = new Date(ts).getHours()
        const byProcess = new Map<string, Set<string>>()
        for (const c of connections) {
            if (!c.remoteAddress || c.remoteAddress === '0.0.0.0' || c.remoteAddress === '*') continue
            const set = byProcess.get(c.processName) ?? new Set<string>()
            set.add(c.remoteAddress)
            byProcess.set(c.processName, set)
        }

        for (const [processName, dests] of byProcess) {
            const known = new Set(this.deps.database.listInsiderDestinations(processName))
            const egress = this.egressStatsFor(processName)
            const baseline: Baseline = {
                knownDestinations: known,
                typicalHourStart: TYPICAL_HOUR_START,
                typicalHourEnd: TYPICAL_HOUR_END,
                avgBytesPerWindow: egress.avg,
            }
            const window: BehaviorWindow = { processName, destinations: [...dests], hour, bytes: egress.bytes }
            const result = scoreBehavior(baseline, window)

            for (const dest of dests) {
                this.deps.database.upsertInsiderBaseline(processName, dest, ts)
            }

            if (result.score >= ALERT_THRESHOLD) {
                this.recordEvent({ ts, processName, score: result.score, factors: result.factors })
            }
        }
    }

    private recordEvent(event: InsiderThreatEvent): void {
        this.recentEvents.unshift(event)
        if (this.recentEvents.length > MAX_EVENTS) this.recentEvents.length = MAX_EVENTS
        this.deps.eventBus.emit('insider:event', { event })
        this.deps.onAlert(this.toAlert(event))
    }

    private toAlert(event: InsiderThreatEvent): Alert {
        return {
            id: `insider-${event.ts}-${event.processName}`,
            timestamp: event.ts,
            type: 'system',
            threatLevel: event.score >= 80 ? 'danger' : 'warning',
            title: `Insider-threat signal: ${event.processName}`,
            description: `Behavioral risk score ${event.score}. Factors: ${event.factors.join(', ')}.`,
            connectionId: 'insider',
            processName: event.processName,
            recommendation: 'Review this process for unusual outbound behavior.',
            acknowledged: false,
            whitelisted: false,
            source: 'system',
            dedupKey: `insider-${event.processName}-${Math.floor(event.ts / 60000)}`,
            suppressedCount: 0,
            createdAt: event.ts,
        }
    }
}
