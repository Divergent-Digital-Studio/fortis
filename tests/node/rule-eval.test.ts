import { describe, it, expect } from 'vitest';
import { evaluateRule, isValidRule, matchCondition, type RuleConnection } from '@main/services/rules/rule-eval';
import type { CustomRule, RuleCondition } from '@shared/types/m3';

const conn = (over: Partial<RuleConnection> = {}): RuleConnection => ({
    process: 'chrome',
    remotePort: 443,
    remoteAddress: '8.8.8.8',
    country: 'US',
    protocol: 'tcp',
    ...over,
});

const cond = (over: Partial<RuleCondition>): RuleCondition => ({
    field: 'remotePort',
    operator: 'equals',
    value: '443',
    ...over,
});

describe('matchCondition', () => {
    it('equals on remotePort', () => {
        expect(matchCondition(cond({ field: 'remotePort', operator: 'equals', value: '443' }), conn())).toBe(true);
    });
    it('equals miss on remotePort', () => {
        expect(matchCondition(cond({ field: 'remotePort', operator: 'equals', value: '80' }), conn())).toBe(false);
    });
    it('notEquals on country true', () => {
        expect(matchCondition(cond({ field: 'country', operator: 'notEquals', value: 'RU' }), conn())).toBe(true);
    });
    it('notEquals on country false', () => {
        expect(matchCondition(cond({ field: 'country', operator: 'notEquals', value: 'US' }), conn())).toBe(false);
    });
    it('equals on country case-insensitive', () => {
        expect(matchCondition(cond({ field: 'country', operator: 'equals', value: 'us' }), conn())).toBe(true);
    });
    it('contains on process', () => {
        expect(matchCondition(cond({ field: 'process', operator: 'contains', value: 'chro' }), conn())).toBe(true);
    });
    it('contains on protocol', () => {
        expect(matchCondition(cond({ field: 'protocol', operator: 'contains', value: 'cp' }), conn())).toBe(true);
    });
    it('inCidr hit on remoteAddress', () => {
        expect(matchCondition(cond({ field: 'remoteAddress', operator: 'inCidr', value: '8.8.8.0/24' }), conn())).toBe(true);
    });
    it('inCidr miss on remoteAddress', () => {
        expect(matchCondition(cond({ field: 'remoteAddress', operator: 'inCidr', value: '10.0.0.0/8' }), conn())).toBe(false);
    });
    it('inCidr returns false when field is not remoteAddress', () => {
        expect(matchCondition(cond({ field: 'country', operator: 'inCidr', value: '8.8.8.0/24' }), conn())).toBe(false);
    });
});

describe('evaluateRule', () => {
    const rule = (conds: RuleCondition[]): CustomRule => ({
        id: 'r1',
        name: 'r',
        enabled: true,
        conditions: conds,
        action: 'alert',
        threatLevel: 'warning',
        createdAt: 0,
    });

    it('AND-combines: all match -> true', () => {
        expect(
            evaluateRule(
                rule([
                    cond({ field: 'remotePort', operator: 'equals', value: '443' }),
                    cond({ field: 'process', operator: 'contains', value: 'chrome' }),
                ]),
                conn(),
            ),
        ).toBe(true);
    });
    it('AND-combines: one miss -> false', () => {
        expect(
            evaluateRule(
                rule([
                    cond({ field: 'remotePort', operator: 'equals', value: '443' }),
                    cond({ field: 'country', operator: 'equals', value: 'RU' }),
                ]),
                conn(),
            ),
        ).toBe(false);
    });
    it('empty conditions -> false', () => {
        expect(evaluateRule(rule([]), conn())).toBe(false);
    });
});

describe('isValidRule', () => {
    const valid = {
        id: '',
        name: 'Block IRC',
        enabled: true,
        conditions: [{ field: 'remotePort', operator: 'equals', value: '6667' }],
        action: 'alert',
        threatLevel: 'warning',
        createdAt: 0,
    };

    it('accepts a well-formed rule', () => {
        expect(isValidRule(valid)).toBe(true);
    });

    it('rejects rules evaluateRule can never match', () => {
        expect(isValidRule({ ...valid, conditions: [] })).toBe(false);
        expect(isValidRule({ ...valid, name: '   ' })).toBe(false);
        expect(isValidRule({ ...valid, conditions: [{ ...valid.conditions[0], value: '  ' }] })).toBe(false);
        expect(
            isValidRule({ ...valid, conditions: [{ field: 'process', operator: 'inCidr', value: '10.0.0.0/8' }] }),
        ).toBe(false);
    });

    it('accepts inCidr on remoteAddress', () => {
        expect(
            isValidRule({ ...valid, conditions: [{ field: 'remoteAddress', operator: 'inCidr', value: '10.0.0.0/8' }] }),
        ).toBe(true);
    });

    it('rejects unknown enums and bad shapes', () => {
        expect(isValidRule({ ...valid, action: 'rm -rf' })).toBe(false);
        expect(isValidRule({ ...valid, threatLevel: 'nuclear' })).toBe(false);
        expect(isValidRule({ ...valid, conditions: [{ field: 'shell', operator: 'equals', value: 'x' }] })).toBe(false);
        expect(isValidRule({ ...valid, enabled: 'yes' })).toBe(false);
        expect(isValidRule(null)).toBe(false);
    });
});
