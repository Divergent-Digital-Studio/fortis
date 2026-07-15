import type { CustomRule, RuleCondition } from '../../../shared/types/m3';
import { matchesCidr } from '../db/whitelist-match';

export interface RuleConnection {
    process: string;
    remotePort: number;
    remoteAddress: string;
    country: string;
    protocol: string;
}

function fieldValue(field: RuleCondition['field'], c: RuleConnection): string {
    switch (field) {
        case 'process':
            return c.process;
        case 'remotePort':
            return String(c.remotePort);
        case 'remoteAddress':
            return c.remoteAddress;
        case 'country':
            return c.country;
        case 'protocol':
            return c.protocol;
        default:
            return '';
    }
}

export function matchCondition(cond: RuleCondition, c: RuleConnection): boolean {
    const actual = fieldValue(cond.field, c);
    const expected = cond.value;
    switch (cond.operator) {
        case 'equals':
            return actual.toLowerCase() === expected.toLowerCase();
        case 'notEquals':
            return actual.toLowerCase() !== expected.toLowerCase();
        case 'contains':
            return actual.toLowerCase().includes(expected.toLowerCase());
        case 'inCidr':
            return cond.field === 'remoteAddress' && matchesCidr(actual, expected);
        default:
            return false;
    }
}

export function evaluateRule(rule: CustomRule, c: RuleConnection): boolean {
    if (rule.conditions.length === 0) return false;
    return rule.conditions.every((cond) => matchCondition(cond, c));
}

const FIELDS = new Set(['process', 'remotePort', 'remoteAddress', 'country', 'protocol']);
const OPERATORS = new Set(['equals', 'notEquals', 'contains', 'inCidr']);
const ACTIONS = new Set(['alert', 'suggest-kill', 'suggest-block']);
const THREAT_LEVELS = new Set(['safe', 'info', 'warning', 'danger', 'critical']);

function isValidCondition(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const c = value as Record<string, unknown>;
    if (typeof c.field !== 'string' || !FIELDS.has(c.field)) return false;
    if (typeof c.operator !== 'string' || !OPERATORS.has(c.operator)) return false;
    if (typeof c.value !== 'string' || c.value.trim().length === 0) return false;
    // matchCondition only honours inCidr for remoteAddress; elsewhere it is dead.
    return c.operator !== 'inCidr' || c.field === 'remoteAddress';
}

// Rejects rules evaluateRule can never match, so the UI cannot silently persist
// a dead rule. Lives here to stay in step with matchCondition.
export function isValidRule(value: unknown): value is CustomRule {
    if (!value || typeof value !== 'object') return false;
    const r = value as Record<string, unknown>;
    if (typeof r.id !== 'string') return false;
    if (typeof r.name !== 'string' || r.name.trim().length === 0) return false;
    if (typeof r.enabled !== 'boolean') return false;
    if (typeof r.action !== 'string' || !ACTIONS.has(r.action)) return false;
    if (typeof r.threatLevel !== 'string' || !THREAT_LEVELS.has(r.threatLevel)) return false;
    return Array.isArray(r.conditions) && r.conditions.length > 0 && r.conditions.every(isValidCondition);
}
