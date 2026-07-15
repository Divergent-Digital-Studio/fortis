import { describe, it, expect } from 'vitest';
import { parseRules, evaluateConnectionsToAlerts } from './agent-rules';
import type { NetworkConnection } from '../shared/types/connection';

const conn: NetworkConnection = {
    id: 'c1',
    protocol: 'tcp',
    localAddress: '127.0.0.1',
    localPort: 5000,
    remoteAddress: '8.8.8.8',
    remotePort: 443,
    state: 'ESTABLISHED',
    processName: 'curl',
    processId: 42,
    timestamp: 1700000000000,
} as NetworkConnection;

describe('agent-rules', () => {
    it('parses a valid rule array', () => {
        const rules = parseRules(
            JSON.stringify([
                {
                    id: 'r1',
                    name: 'Block curl',
                    enabled: true,
                    conditions: [{ field: 'process', operator: 'equals', value: 'curl' }],
                    action: 'alert',
                    threatLevel: 'danger',
                    createdAt: 1,
                },
            ]),
        );
        expect(rules).toHaveLength(1);
    });

    it('ignores malformed rule json', () => {
        expect(parseRules('{bad')).toEqual([]);
    });

    it('emits an alert for a matching connection', () => {
        const rules = parseRules(
            JSON.stringify([
                {
                    id: 'r1',
                    name: 'Block curl',
                    enabled: true,
                    conditions: [{ field: 'process', operator: 'equals', value: 'curl' }],
                    action: 'alert',
                    threatLevel: 'danger',
                    createdAt: 1,
                },
            ]),
        );
        const alerts = evaluateConnectionsToAlerts(rules, [conn], 1700000001000);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.threatLevel).toBe('danger');
        expect(alerts[0]?.title).toContain('Block curl');
    });

    it('skips disabled rules', () => {
        const rules = parseRules(
            JSON.stringify([
                {
                    id: 'r1',
                    name: 'x',
                    enabled: false,
                    conditions: [{ field: 'process', operator: 'equals', value: 'curl' }],
                    action: 'alert',
                    threatLevel: 'danger',
                    createdAt: 1,
                },
            ]),
        );
        expect(evaluateConnectionsToAlerts(rules, [conn], 1)).toHaveLength(0);
    });
});
