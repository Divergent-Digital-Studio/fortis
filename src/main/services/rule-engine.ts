import { randomUUID } from 'node:crypto';
import type { IDatabaseService } from './database';
import type { FortisEventBus } from './event-bus';
import type { CustomRule, DefenseAction } from '../../shared/types/m3';
import type { NetworkConnection } from '../../shared/types/connection';
import type { Alert } from '../../shared/types/alert';
import { evaluateRule, type RuleConnection } from './rules/rule-eval';

interface RuleEngineDeps {
    database: IDatabaseService;
    eventBus: FortisEventBus;
    onAlert?: (alert: Alert) => void;
    countryForIp?: (ip: string) => string;
}

export class RuleEngine {
    private readonly database: IDatabaseService;
    private readonly eventBus: FortisEventBus;
    private readonly onAlert: ((alert: Alert) => void) | null;
    private readonly countryForIp: ((ip: string) => string) | null;
    private rules: CustomRule[] = [];
    private boundHandler: ((p: { connections: NetworkConnection[] }) => void) | null = null;

    constructor(deps: RuleEngineDeps) {
        this.database = deps.database;
        this.eventBus = deps.eventBus;
        this.onAlert = deps.onAlert ?? null;
        this.countryForIp = deps.countryForIp ?? null;
        this.rules = this.database.getCustomRules();
    }

    start(): void {
        if (this.boundHandler) return;
        this.boundHandler = (p) => this.evaluateConnections(p.connections);
        this.eventBus.on('scan:complete', this.boundHandler);
    }

    stop(): void {
        if (this.boundHandler) {
            this.eventBus.off('scan:complete', this.boundHandler);
            this.boundHandler = null;
        }
    }

    getRules(): CustomRule[] {
        return this.database.getCustomRules();
    }

    saveRule(rule: CustomRule): CustomRule[] {
        const toSave: CustomRule = rule.id ? rule : { ...rule, id: randomUUID(), createdAt: Date.now() };
        this.database.upsertCustomRule(toSave);
        this.rules = this.database.getCustomRules();
        return this.rules;
    }

    deleteRule(id: string): CustomRule[] {
        this.database.deleteCustomRule(id);
        this.rules = this.database.getCustomRules();
        return this.rules;
    }

    private toRuleConnection(conn: NetworkConnection): RuleConnection {
        return {
            process: conn.processName,
            remotePort: conn.remotePort,
            remoteAddress: conn.remoteAddress,
            country: this.countryForIp?.(conn.remoteAddress) ?? '',
            protocol: conn.protocol,
        };
    }

    private evaluateConnections(connections: NetworkConnection[]): void {
        const enabled = this.rules.filter((r) => r.enabled);
        if (enabled.length === 0) return;
        const defenseEnabled = this.database.getSetting('defenseEnabled') === true;
        const pendingKeys = defenseEnabled
            ? new Set(
                  this.database
                      .getDefenseActions(200)
                      .filter((a) => a.status === 'pending' && a.ruleId !== null)
                      .map((a) => `${a.ruleId}:${a.target}`),
              )
            : null;
        for (const rule of enabled) {
            for (const conn of connections) {
                const view = this.toRuleConnection(conn);
                if (!evaluateRule(rule, view)) continue;
                this.raiseRuleAlert(rule, conn);
                if (pendingKeys && (rule.action === 'suggest-kill' || rule.action === 'suggest-block')) {
                    this.createSuggestion(rule, conn, pendingKeys);
                }
            }
        }
    }

    private raiseRuleAlert(rule: CustomRule, conn: NetworkConnection): void {
        const now = Date.now();
        const dedupKey = `rule:${rule.id}:${conn.remoteAddress}:${conn.remotePort}`;
        const title = `Custom rule matched: ${rule.name}`;
        const description = `${conn.processName} connected to ${conn.remoteAddress}:${conn.remotePort} and matched the rule "${rule.name}".`;
        const recommendation = 'Review this connection against the rule you defined.';

        const alertId = this.database.saveAlert({
            timestamp: now,
            type: 'system',
            threatLevel: rule.threatLevel,
            title,
            description,
            connectionId: conn.id,
            recommendation,
            source: 'system',
            dedupKey,
        });

        if (this.onAlert) {
            this.onAlert({
                id: alertId,
                timestamp: now,
                type: 'system',
                threatLevel: rule.threatLevel,
                title,
                description,
                connectionId: conn.id,
                recommendation,
                source: 'system',
                acknowledged: false,
                whitelisted: false,
                dedupKey,
                suppressedCount: 0,
                createdAt: now,
            });
        }
    }

    private createSuggestion(rule: CustomRule, conn: NetworkConnection, pendingKeys: Set<string>): void {
        const isKill = rule.action === 'suggest-kill';
        const target = isKill ? String(conn.processId) : conn.remoteAddress;
        const key = `${rule.id}:${target}`;
        if (pendingKeys.has(key)) return;
        pendingKeys.add(key);

        const action: DefenseAction = {
            id: randomUUID(),
            createdAt: Date.now(),
            kind: isKill ? 'kill' : 'block',
            status: 'pending',
            target,
            processName: conn.processName,
            reason: `Rule "${rule.name}" suggested ${isKill ? 'killing' : 'blocking'} this connection.`,
            ruleId: rule.id,
            executedAt: null,
            error: null,
        };
        this.database.insertDefenseAction(action);
        this.eventBus.emit('defense:updated', { actions: this.database.getDefenseActions() });
    }
}
