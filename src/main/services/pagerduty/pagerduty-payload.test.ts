import { describe, it, expect } from 'vitest';
import {
    buildPagerDutyEvent,
    mapThreatToSeverity,
    shouldRoute,
    PAGERDUTY_ENQUEUE_URL,
} from './pagerduty-payload';
import type { Alert } from '../../../shared/types/alert';

const alert: Alert = {
    id: 'al1',
    timestamp: 1700000000000,
    type: 'system',
    threatLevel: 'critical',
    title: 'Critical exfil',
    description: 'Process X to bad IP',
    connectionId: 'c1',
    remoteAddress: '8.8.8.8',
    processName: 'curl',
    recommendation: 'Investigate',
    acknowledged: false,
    whitelisted: false,
    dedupKey: 'k1',
    suppressedCount: 0,
    createdAt: 1700000000000,
};

describe('pagerduty-payload', () => {
    it('maps threat levels to PD severities', () => {
        expect(mapThreatToSeverity('critical')).toBe('critical');
        expect(mapThreatToSeverity('danger')).toBe('error');
        expect(mapThreatToSeverity('warning')).toBe('warning');
        expect(mapThreatToSeverity('info')).toBe('info');
        expect(mapThreatToSeverity('safe')).toBe('info');
    });

    it('routes only at or above the severity floor', () => {
        expect(shouldRoute('critical', 'danger')).toBe(true);
        expect(shouldRoute('danger', 'danger')).toBe(true);
        expect(shouldRoute('warning', 'danger')).toBe(false);
    });

    it('builds a v2 enqueue body', () => {
        const body = buildPagerDutyEvent('routekey', alert, { source: 'fortis-host' });
        expect(body.routing_key).toBe('routekey');
        expect(body.event_action).toBe('trigger');
        expect(body.dedup_key).toBe('k1');
        expect(body.payload.severity).toBe('critical');
        expect(body.payload.summary).toContain('Critical exfil');
        expect(body.payload.source).toBe('fortis-host');
        expect(body.payload.custom_details.processName).toBe('curl');
    });

    it('exposes the enqueue url', () => {
        expect(PAGERDUTY_ENQUEUE_URL).toBe('https://events.pagerduty.com/v2/enqueue');
    });
});
