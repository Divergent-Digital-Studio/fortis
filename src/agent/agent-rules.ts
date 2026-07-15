import { createHash } from 'node:crypto';
import type { CustomRule } from '../shared/types/m3';
import type { NetworkConnection } from '../shared/types/connection';
import type { Alert } from '../shared/types/alert';
import { evaluateRule, type RuleConnection } from '../main/services/rules/rule-eval';

function isValidRule(v: unknown): v is CustomRule {
    if (typeof v !== 'object' || v === null) return false;
    const r = v as Record<string, unknown>;
    return (
        typeof r.id === 'string' &&
        typeof r.name === 'string' &&
        typeof r.enabled === 'boolean' &&
        Array.isArray(r.conditions) &&
        typeof r.action === 'string' &&
        typeof r.threatLevel === 'string'
    );
}

export function parseRules(raw: string): CustomRule[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidRule);
}

function toRuleConnection(conn: NetworkConnection): RuleConnection {
    return {
        process: conn.processName,
        remotePort: conn.remotePort,
        remoteAddress: conn.remoteAddress,
        country: '',
        protocol: conn.protocol,
    };
}

export function evaluateConnectionsToAlerts(
    rules: CustomRule[],
    connections: NetworkConnection[],
    now: number,
): Alert[] {
    const enabled = rules.filter((r) => r.enabled);
    const alerts: Alert[] = [];
    for (const rule of enabled) {
        for (const conn of connections) {
            if (!evaluateRule(rule, toRuleConnection(conn))) continue;
            const dedupKey = `agent-rule:${rule.id}:${conn.remoteAddress}:${conn.remotePort}`;
            const id = createHash('sha256').update(`${dedupKey}:${now}`).digest('hex').slice(0, 16);
            alerts.push({
                id,
                timestamp: now,
                type: 'system',
                threatLevel: rule.threatLevel,
                title: `Custom rule matched: ${rule.name}`,
                description: `${conn.processName} connected to ${conn.remoteAddress}:${conn.remotePort} and matched the rule "${rule.name}".`,
                connectionId: conn.id,
                remoteAddress: conn.remoteAddress,
                remotePort: conn.remotePort,
                processName: conn.processName,
                recommendation: 'Review this connection against the rule you defined.',
                source: 'system',
                acknowledged: false,
                whitelisted: false,
                dedupKey,
                suppressedCount: 0,
                createdAt: now,
            });
        }
    }
    return alerts;
}
