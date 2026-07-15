import { describe, it, expect } from 'vitest';
import { RuleEngine } from '@main/services/rule-engine';
import type { CustomRule, DefenseAction } from '@shared/types/m3';
import type { NetworkConnection } from '@shared/types/connection';
import type { UserSettings } from '@shared/types/settings';

function makeConnection(over: Partial<NetworkConnection> = {}): NetworkConnection {
    return {
        id: 'conn-1',
        protocol: 'tcp',
        localAddress: '192.168.1.5',
        localPort: 5000,
        remoteAddress: '8.8.8.8',
        remotePort: 443,
        state: 'ESTABLISHED',
        processName: 'chrome',
        processId: 4321,
        timestamp: 0,
        ...over,
    };
}

function makeRule(over: Partial<CustomRule> = {}): CustomRule {
    return {
        id: 'rule-1',
        name: 'Block 8.8.8.8',
        enabled: true,
        conditions: [{ field: 'remoteAddress', operator: 'equals', value: '8.8.8.8' }],
        action: 'suggest-block',
        threatLevel: 'warning',
        createdAt: 0,
        ...over,
    };
}

interface FakeDeps {
    rules: CustomRule[];
    settings: Partial<UserSettings>;
    actions: DefenseAction[];
}

function makeFakeDatabase(state: FakeDeps) {
    return {
        getCustomRules: () => state.rules,
        getSetting: (<K extends keyof UserSettings>(key: K): UserSettings[K] =>
            state.settings[key] as UserSettings[K]),
        getDefenseActions: () => state.actions,
        insertDefenseAction: (a: DefenseAction) => {
            state.actions.push(a);
        },
        saveAlert: () => 'alert-id',
    } as unknown as ConstructorParameters<typeof RuleEngine>[0]['database'];
}

function makeFakeBus() {
    const emitted: Array<{ event: string; payload: unknown }> = [];
    return {
        bus: {
            on: () => {},
            off: () => {},
            emit: (event: string, payload: unknown) => {
                emitted.push({ event, payload });
                return true;
            },
        } as unknown as ConstructorParameters<typeof RuleEngine>[0]['eventBus'],
        emitted,
    };
}

function runScan(engine: RuleEngine, connections: NetworkConnection[]): void {
    (engine as unknown as { evaluateConnections: (c: NetworkConnection[]) => void }).evaluateConnections(
        connections,
    );
}

describe('RuleEngine suggestion gating', () => {
    it('does NOT create a defense suggestion when defenseEnabled is false', () => {
        const state: FakeDeps = { rules: [makeRule()], settings: { defenseEnabled: false }, actions: [] };
        const { bus } = makeFakeBus();
        const engine = new RuleEngine({ database: makeFakeDatabase(state), eventBus: bus });
        runScan(engine, [makeConnection()]);
        expect(state.actions).toHaveLength(0);
    });

    it('creates a pending block suggestion when defenseEnabled is true', () => {
        const state: FakeDeps = { rules: [makeRule()], settings: { defenseEnabled: true }, actions: [] };
        const { bus, emitted } = makeFakeBus();
        const engine = new RuleEngine({ database: makeFakeDatabase(state), eventBus: bus });
        runScan(engine, [makeConnection()]);
        expect(state.actions).toHaveLength(1);
        const action = state.actions[0];
        expect(action?.kind).toBe('block');
        expect(action?.status).toBe('pending');
        expect(action?.target).toBe('8.8.8.8');
        expect(action?.ruleId).toBe('rule-1');
        expect(emitted.some((e) => e.event === 'defense:updated')).toBe(true);
    });

    it('uses processId as the kill target for suggest-kill rules', () => {
        const state: FakeDeps = {
            rules: [makeRule({ action: 'suggest-kill' })],
            settings: { defenseEnabled: true },
            actions: [],
        };
        const { bus } = makeFakeBus();
        const engine = new RuleEngine({ database: makeFakeDatabase(state), eventBus: bus });
        runScan(engine, [makeConnection({ processId: 9999 })]);
        expect(state.actions[0]?.kind).toBe('kill');
        expect(state.actions[0]?.target).toBe('9999');
    });

    it('dedupes: a second scan does not create a duplicate pending suggestion', () => {
        const state: FakeDeps = { rules: [makeRule()], settings: { defenseEnabled: true }, actions: [] };
        const { bus } = makeFakeBus();
        const engine = new RuleEngine({ database: makeFakeDatabase(state), eventBus: bus });
        runScan(engine, [makeConnection()]);
        runScan(engine, [makeConnection()]);
        expect(state.actions).toHaveLength(1);
    });

    it('still raises an alert for an "alert" action regardless of defenseEnabled', () => {
        const state: FakeDeps = {
            rules: [makeRule({ action: 'alert' })],
            settings: { defenseEnabled: false },
            actions: [],
        };
        const { bus } = makeFakeBus();
        let alertRaised = false;
        const engine = new RuleEngine({
            database: makeFakeDatabase(state),
            eventBus: bus,
            onAlert: () => {
                alertRaised = true;
            },
        });
        runScan(engine, [makeConnection()]);
        expect(alertRaised).toBe(true);
        expect(state.actions).toHaveLength(0);
    });
});
