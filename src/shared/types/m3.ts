import type { ThreatLevel } from './analysis';

export type DefenseActionKind = 'kill' | 'block';
export type DefenseActionStatus = 'pending' | 'executed' | 'failed' | 'cancelled';

export interface DefenseAction {
    id: string;
    createdAt: number;
    kind: DefenseActionKind;
    status: DefenseActionStatus;
    target: string;
    processName: string | null;
    reason: string;
    ruleId: string | null;
    executedAt: number | null;
    error: string | null;
}

export interface BlockedIp {
    ip: string;
    blockedAt: number;
    reason: string;
    platform: string;
    active: boolean;
}

export type RuleField = 'process' | 'remotePort' | 'remoteAddress' | 'country' | 'protocol';
export type RuleOperator = 'equals' | 'notEquals' | 'contains' | 'inCidr';
export type RuleAction = 'alert' | 'suggest-kill' | 'suggest-block';

export interface RuleCondition {
    field: RuleField;
    operator: RuleOperator;
    value: string;
}

export interface CustomRule {
    id: string;
    name: string;
    enabled: boolean;
    conditions: RuleCondition[];
    action: RuleAction;
    threatLevel: ThreatLevel;
    createdAt: number;
}

export type CertStatus = 'valid' | 'expiring' | 'expired' | 'self-signed' | 'error';

export interface TlsCertInfo {
    hostPort: string;
    host: string;
    port: number;
    issuer: string | null;
    subject: string | null;
    validFrom: number | null;
    validTo: number | null;
    daysUntilExpiry: number | null;
    selfSigned: boolean;
    status: CertStatus;
    lastChecked: number;
}

export interface ProcessBandwidth {
    pid: number;
    processName: string;
    bytesInPerSec: number;
    bytesOutPerSec: number;
}

/**
 * `unsupported` — the platform exposes no per-process counter; this never resolves.
 * `sampling`    — supported, but a rate needs two samples; one interval away from data.
 * `ready`       — `processes` holds live rates measured at `sampledAt`.
 */
export type BandwidthStatus = 'unsupported' | 'sampling' | 'ready';

export interface BandwidthSnapshot {
    status: BandwidthStatus;
    processes: ProcessBandwidth[];
    sampledAt: number;
}

export type WebhookKind = 'slack' | 'discord' | 'generic';

export const EMPTY_BANDWIDTH_SNAPSHOT: BandwidthSnapshot = {
    status: 'sampling',
    processes: [],
    sampledAt: 0,
};
