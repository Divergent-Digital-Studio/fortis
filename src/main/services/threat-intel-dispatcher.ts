import { createHash } from 'node:crypto';
import type { DatabaseService } from './database';
import type { FortisEventBus } from './event-bus';
import type { Alert } from '../../shared/types/alert';
import type { ThreatLevel } from '../../shared/types/analysis';
import type { CommunityState, ThreatIntelSubmission } from '../../shared/types/m7';
import { buildSubmission, buildSubmissionBatch } from './community/threat-intel-payload';
import { getSalt } from '../utils/anonymizer';

type FetchFn = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

interface ThreatIntelDispatcherDeps {
    database: DatabaseService;
    eventBus: FortisEventBus;
    fetchFn?: FetchFn;
    backoffMs?: number;
}

const MAX_RETRIES = 3;

const THREAT_ORDER: Record<ThreatLevel, number> = {
    safe: 0,
    info: 1,
    warning: 2,
    danger: 3,
    critical: 4,
};

function shouldRoute(level: ThreatLevel, floor: ThreatLevel): boolean {
    return THREAT_ORDER[level] >= THREAT_ORDER[floor];
}

function hashDestination(ip: string): string {
    return createHash('sha256').update(`${getSalt()}:${ip}`).digest('hex').substring(0, 32);
}

export class ThreatIntelDispatcher {
    private handler: ((p: { alert: Alert }) => void) | null = null;
    private readonly fetchFn: FetchFn;
    private readonly backoffMs: number;
    private submittedCount = 0;
    private lastSubmittedAt: number | null = null;

    constructor(private readonly deps: ThreatIntelDispatcherDeps) {
        this.fetchFn =
            deps.fetchFn ??
            ((url, init) => fetch(url, init).then((r) => ({ ok: r.ok, status: r.status })));
        this.backoffMs = deps.backoffMs ?? 250;
    }

    start(): void {
        if (this.handler) return;
        this.handler = (p) => {
            void this.dispatch(p.alert);
        };
        this.deps.eventBus.on('threat:detected', this.handler);
    }

    stop(): void {
        if (this.handler) {
            this.deps.eventBus.off('threat:detected', this.handler);
            this.handler = null;
        }
    }

    getState(): CommunityState {
        const enabled = this.deps.database.getSetting('threatIntelEnabled') === true;
        const verified = this.deps.database.getSetting('threatIntelVerified') === true;
        const endpoint = this.deps.database.getSetting('threatIntelEndpoint');
        const floor = this.deps.database.getSetting('threatIntelSeverityFloor');
        const configured = typeof endpoint === 'string' && endpoint.length > 0;
        return {
            enabled,
            configured,
            verified,
            severityFloor: floor,
            submittedCount: this.submittedCount,
            lastSubmittedAt: this.lastSubmittedAt,
        };
    }

    private emitState(): void {
        this.deps.eventBus.emit('community:state', this.getState());
    }

    private config(): { endpoint: string; key: string; floor: ThreatLevel } | null {
        const enabled = this.deps.database.getSetting('threatIntelEnabled');
        const verified = this.deps.database.getSetting('threatIntelVerified');
        const endpoint = this.deps.database.getSetting('threatIntelEndpoint');
        const key = this.deps.database.getSetting('threatIntelKey');
        const floor = this.deps.database.getSetting('threatIntelSeverityFloor');
        if (!enabled || !verified || typeof endpoint !== 'string' || endpoint.length === 0) return null;
        return { endpoint, key: typeof key === 'string' ? key : '', floor };
    }

    setEnabled(enabled: boolean): CommunityState {
        this.deps.database.setSetting('threatIntelEnabled', enabled);
        if (!enabled) this.deps.database.setSetting('threatIntelVerified', false);
        this.emitState();
        return this.getState();
    }

    setConfig(cfg: { endpoint: string; severityFloor: ThreatLevel }): CommunityState {
        this.deps.database.setSetting('threatIntelEndpoint', cfg.endpoint);
        this.deps.database.setSetting('threatIntelSeverityFloor', cfg.severityFloor);
        this.deps.database.setSetting('threatIntelVerified', false);
        this.emitState();
        return this.getState();
    }

    /**
     * A blank `key` means "keep the stored one" — the UI clears the field after a
     * save. Probing without it would verify an unauthenticated request that the
     * real submissions never make.
     */
    private resolveKey(key: string): string {
        if (key.length > 0) return key;
        const stored = this.deps.database.getSetting('threatIntelKey');
        return typeof stored === 'string' ? stored : '';
    }

    async test(endpoint: string, key: string): Promise<boolean> {
        if (typeof endpoint !== 'string' || endpoint.length === 0) return false;
        const now = Date.now();
        const probe: ThreatIntelSubmission = {
            destHash: hashDestination('test'),
            destPort: null,
            threatLevel: 'info',
            category: 'connectivity-test',
            bucketedAt: Math.floor(now / (5 * 60 * 1000)) * (5 * 60 * 1000),
        };
        const ok = await this.post(endpoint, this.headers(this.resolveKey(key)), JSON.stringify({ test: true, submission: probe }));
        if (ok) {
            this.deps.database.setSetting('threatIntelVerified', true);
            this.emitState();
        }
        return ok;
    }

    previewBatch(alerts: Alert[]): ThreatIntelSubmission[] {
        const floor = this.deps.database.getSetting('threatIntelSeverityFloor');
        const qualifying = alerts.filter((a) => shouldRoute(a.threatLevel, floor));
        return buildSubmissionBatch(qualifying, hashDestination);
    }

    private headers(key: string): Record<string, string> {
        const base: Record<string, string> = { 'Content-Type': 'application/json' };
        return key.length > 0 ? { ...base, Authorization: `Bearer ${key}` } : base;
    }

    private async dispatch(alert: Alert): Promise<void> {
        const cfg = this.config();
        if (!cfg) return;
        if (!shouldRoute(alert.threatLevel, cfg.floor)) return;
        if (typeof alert.remoteAddress !== 'string' || alert.remoteAddress.length === 0) return;
        const submission = buildSubmission(alert, hashDestination);
        const ok = await this.post(cfg.endpoint, this.headers(cfg.key), JSON.stringify({ submission }));
        if (ok) {
            this.submittedCount += 1;
            this.lastSubmittedAt = Date.now();
            this.emitState();
        } else {
            console.error(`[ThreatIntel] delivery failed for alert ${alert.id} after ${MAX_RETRIES} attempts`);
        }
    }

    private async post(url: string, headers: Record<string, string>, body: string): Promise<boolean> {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const res = await this.fetchFn(url, { method: 'POST', headers, body });
                if (res.ok) return true;
                console.error(`[ThreatIntel] attempt ${attempt} got status ${res.status}`);
            } catch (err) {
                console.error(`[ThreatIntel] attempt ${attempt} threw:`, err instanceof Error ? err.message : err);
            }
            if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, this.backoffMs * 2 ** (attempt - 1)));
        }
        return false;
    }
}
