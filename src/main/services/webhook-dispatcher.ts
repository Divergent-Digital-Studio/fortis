import type { DatabaseService } from './database';
import type { FortisEventBus } from './event-bus';
import type { Alert } from '../../shared/types/alert';
import { buildWebhookBody, inferWebhookKind } from './webhook/webhook-payload';

type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>;

interface WebhookDispatcherDeps {
    database: DatabaseService;
    eventBus: FortisEventBus;
    fetchFn?: FetchFn;
    backoffMs?: number;
}

const MAX_RETRIES = 3;
const HTTP_URL_PATTERN = /^https?:\/\/\S+$/i;

export class WebhookDispatcher {
    private handler: ((p: { alert: Alert }) => void) | null = null;
    private fetchFn: FetchFn;
    private backoffMs: number;

    constructor(private deps: WebhookDispatcherDeps) {
        this.fetchFn = deps.fetchFn ?? ((url, init) => fetch(url, init).then((r) => ({ ok: r.ok, status: r.status })));
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

    private isEnabled(): { url: string } | null {
        const enabled = this.deps.database.getSetting('webhookEnabled');
        const url = this.deps.database.getSetting('webhookUrl');
        if (!enabled || typeof url !== 'string' || !HTTP_URL_PATTERN.test(url)) return null;
        return { url };
    }

    async test(url: string): Promise<boolean> {
        if (!HTTP_URL_PATTERN.test(url)) return false;
        const kind = inferWebhookKind(url);
        const probe = {
            id: 'test',
            timestamp: Date.now(),
            type: 'system',
            threatLevel: 'info',
            title: 'Fortis test',
            description: 'Webhook test message from Fortis.',
            connectionId: 't',
            recommendation: 'No action needed.',
            acknowledged: false,
            whitelisted: false,
            dedupKey: 'test',
            suppressedCount: 0,
            createdAt: Date.now(),
        } as Alert;
        return this.post(url, JSON.stringify(buildWebhookBody(kind, probe)));
    }

    private async dispatch(alert: Alert): Promise<void> {
        const cfg = this.isEnabled();
        if (!cfg) return;
        const body = JSON.stringify(buildWebhookBody(inferWebhookKind(cfg.url), alert));
        const ok = await this.post(cfg.url, body);
        if (!ok) console.error(`[Webhook] delivery failed for alert ${alert.id} after ${MAX_RETRIES} attempts`);
    }

    private async post(url: string, body: string): Promise<boolean> {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const res = await this.fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
                if (res.ok) return true;
                console.error(`[Webhook] attempt ${attempt} got status ${res.status}`);
            } catch (err) {
                console.error(`[Webhook] attempt ${attempt} threw:`, err instanceof Error ? err.message : err);
            }
            if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, this.backoffMs * 2 ** (attempt - 1)));
        }
        return false;
    }
}
