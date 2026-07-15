import type { Alert } from '../../../shared/types/alert';
import type { ThreatLevel } from '../../../shared/types/analysis';

export const PAGERDUTY_ENQUEUE_URL = 'https://events.pagerduty.com/v2/enqueue';

export type PdSeverity = 'critical' | 'error' | 'warning' | 'info';

const THREAT_ORDER: Record<ThreatLevel, number> = {
    safe: 0,
    info: 1,
    warning: 2,
    danger: 3,
    critical: 4,
};

export function mapThreatToSeverity(level: ThreatLevel): PdSeverity {
    switch (level) {
        case 'critical':
            return 'critical';
        case 'danger':
            return 'error';
        case 'warning':
            return 'warning';
        default:
            return 'info';
    }
}

export function shouldRoute(level: ThreatLevel, floor: ThreatLevel): boolean {
    return THREAT_ORDER[level] >= THREAT_ORDER[floor];
}

export interface PagerDutyEvent {
    routing_key: string;
    event_action: 'trigger';
    dedup_key: string;
    payload: {
        summary: string;
        severity: PdSeverity;
        source: string;
        component: string;
        custom_details: Record<string, unknown>;
    };
}

export function buildPagerDutyEvent(
    routingKey: string,
    alert: Alert,
    opts: { source?: string } = {},
): PagerDutyEvent {
    return {
        routing_key: routingKey,
        event_action: 'trigger',
        dedup_key: alert.dedupKey,
        payload: {
            summary: `[Fortis] ${alert.title}`.slice(0, 1024),
            severity: mapThreatToSeverity(alert.threatLevel),
            source: opts.source ?? 'fortis',
            component: 'network-monitor',
            custom_details: {
                description: alert.description,
                recommendation: alert.recommendation,
                processName: alert.processName ?? null,
                remoteAddress: alert.remoteAddress ?? null,
                remotePort: alert.remotePort ?? null,
                threatLevel: alert.threatLevel,
                timestamp: alert.timestamp,
            },
        },
    };
}
