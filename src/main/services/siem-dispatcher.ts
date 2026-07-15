import type { DatabaseService } from './database'
import type { FortisEventBus } from './event-bus'
import type { Alert } from '../../shared/types/alert'
import type { ThreatLevel } from '../../shared/types/analysis'
import type { SiemVendor } from '../../shared/types/m6'
import { buildSiemPayload } from './siem/siem-payload'

type FetchFn = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>

interface SiemDispatcherDeps {
    database: DatabaseService
    eventBus: FortisEventBus
    fetchFn?: FetchFn
    backoffMs?: number
}

const MAX_RETRIES = 3

const THREAT_ORDER: Record<ThreatLevel, number> = {
    safe: 0,
    info: 1,
    warning: 2,
    danger: 3,
    critical: 4,
}

function shouldRoute(level: ThreatLevel, floor: ThreatLevel): boolean {
    return THREAT_ORDER[level] >= THREAT_ORDER[floor]
}

export class SiemDispatcher {
    private handler: ((p: { alert: Alert }) => void) | null = null
    private readonly fetchFn: FetchFn
    private readonly backoffMs: number

    constructor(private readonly deps: SiemDispatcherDeps) {
        this.fetchFn =
            deps.fetchFn ??
            ((url, init) => fetch(url, init).then((r) => ({ ok: r.ok, status: r.status })))
        this.backoffMs = deps.backoffMs ?? 250
    }

    start(): void {
        if (this.handler) return
        this.handler = (p) => {
            void this.dispatch(p.alert)
        }
        this.deps.eventBus.on('threat:detected', this.handler)
    }

    stop(): void {
        if (this.handler) {
            this.deps.eventBus.off('threat:detected', this.handler)
            this.handler = null
        }
    }

    isConfigured(): boolean {
        const verified = this.deps.database.getSetting('siemVerified')
        const endpoint = this.deps.database.getSetting('siemEndpoint')
        return verified === true && typeof endpoint === 'string' && endpoint.length > 0
    }

    private config(): { vendor: SiemVendor; endpoint: string; token: string; floor: ThreatLevel } | null {
        const enabled = this.deps.database.getSetting('siemEnabled')
        const verified = this.deps.database.getSetting('siemVerified')
        const vendor = this.deps.database.getSetting('siemVendor')
        const endpoint = this.deps.database.getSetting('siemEndpoint')
        const token = this.deps.database.getSetting('siemToken')
        const floor = this.deps.database.getSetting('siemSeverityFloor')
        if (!enabled || !verified || typeof endpoint !== 'string' || endpoint.length === 0) return null
        return { vendor, endpoint, token: typeof token === 'string' ? token : '', floor }
    }

    async test(vendor: SiemVendor, endpoint: string, token: string): Promise<boolean> {
        if (typeof endpoint !== 'string' || endpoint.length === 0) return false
        const now = Date.now()
        const probe: Alert = {
            id: 'siem-test',
            timestamp: now,
            type: 'system',
            threatLevel: 'warning',
            title: 'Fortis SIEM test',
            description: 'Test event from Fortis.',
            connectionId: 't',
            recommendation: 'No action needed.',
            acknowledged: false,
            whitelisted: false,
            dedupKey: `fortis-siem-test-${now}`,
            suppressedCount: 0,
            createdAt: now,
        }
        const payload = buildSiemPayload(vendor, endpoint, token, probe)
        return this.post(payload.url, payload.headers, payload.body)
    }

    private async dispatch(alert: Alert): Promise<void> {
        const cfg = this.config()
        if (!cfg) return
        if (!shouldRoute(alert.threatLevel, cfg.floor)) return
        const payload = buildSiemPayload(cfg.vendor, cfg.endpoint, cfg.token, alert)
        const ok = await this.post(payload.url, payload.headers, payload.body)
        if (!ok) console.error(`[Siem] delivery failed for alert ${alert.id} after ${MAX_RETRIES} attempts`)
    }

    private async post(url: string, headers: Record<string, string>, body: string): Promise<boolean> {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const res = await this.fetchFn(url, { method: 'POST', headers, body })
                if (res.ok) return true
                console.error(`[Siem] attempt ${attempt} got status ${res.status}`)
            } catch (err) {
                console.error(`[Siem] attempt ${attempt} threw:`, err instanceof Error ? err.message : err)
            }
            if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, this.backoffMs * 2 ** (attempt - 1)))
        }
        return false
    }
}
