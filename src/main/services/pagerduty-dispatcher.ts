import type { DatabaseService } from './database';
import type { FortisEventBus } from './event-bus';
import type { Alert } from '../../shared/types/alert';
import type { ThreatLevel } from '../../shared/types/analysis';
import { buildPagerDutyEvent, shouldRoute, PAGERDUTY_ENQUEUE_URL } from './pagerduty/pagerduty-payload';

type FetchFn = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

interface PagerDutyDispatcherDeps {
    database: DatabaseService;
    eventBus: FortisEventBus;
    fetchFn?: FetchFn;
    backoffMs?: number;
    source?: string;
}

const MAX_RETRIES = 3;
const MIN_KEY_LENGTH = 8;

export class PagerDutyDispatcher {
    private handler: ((p: { alert: Alert }) => void) | null = null;
    private readonly fetchFn: FetchFn;
    private readonly backoffMs: number;

    constructor(private readonly deps: PagerDutyDispatcherDeps) {
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

    private config(): { routingKey: string; floor: ThreatLevel } | null {
        const enabled = this.deps.database.getSetting('pagerDutyEnabled');
        const verified = this.deps.database.getSetting('pagerDutyVerified');
        const routingKey = this.deps.database.getSetting('pagerDutyRoutingKey');
        const floor = this.deps.database.getSetting('pagerDutySeverityFloor');
        if (!enabled || !verified || typeof routingKey !== 'string' || routingKey.length < MIN_KEY_LENGTH) return null;
        return { routingKey, floor };
    }

    isConfigured(): boolean {
        const routingKey = this.deps.database.getSetting('pagerDutyRoutingKey');
        const verified = this.deps.database.getSetting('pagerDutyVerified');
        return verified === true && typeof routingKey === 'string' && routingKey.length >= MIN_KEY_LENGTH;
    }

    async test(routingKey: string): Promise<boolean> {
        if (typeof routingKey !== 'string' || routingKey.length < MIN_KEY_LENGTH) return false;
        const now = Date.now();
        const probe: Alert = {
            id: 'pd-test',
            timestamp: now,
            type: 'system',
            threatLevel: 'critical',
            title: 'Fortis PagerDuty test',
            description: 'Test event from Fortis.',
            connectionId: 't',
            recommendation: 'No action needed.',
            acknowledged: false,
            whitelisted: false,
            dedupKey: `fortis-test-${now}`,
            suppressedCount: 0,
            createdAt: now,
        };
        return this.post(
            JSON.stringify(buildPagerDutyEvent(routingKey, probe, { source: this.deps.source ?? 'fortis' })),
        );
    }

    private async dispatch(alert: Alert): Promise<void> {
        const cfg = this.config();
        if (!cfg) return;
        if (!shouldRoute(alert.threatLevel, cfg.floor)) return;
        const body = JSON.stringify(
            buildPagerDutyEvent(cfg.routingKey, alert, { source: this.deps.source ?? 'fortis' }),
        );
        const ok = await this.post(body);
        if (!ok) console.error(`[PagerDuty] delivery failed for alert ${alert.id} after ${MAX_RETRIES} attempts`);
    }

    private async post(body: string): Promise<boolean> {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const res = await this.fetchFn(PAGERDUTY_ENQUEUE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                });
                if (res.ok) return true;
                console.error(`[PagerDuty] attempt ${attempt} got status ${res.status}`);
            } catch (err) {
                console.error(`[PagerDuty] attempt ${attempt} threw:`, err instanceof Error ? err.message : err);
            }
            if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, this.backoffMs * 2 ** (attempt - 1)));
        }
        return false;
    }
}
