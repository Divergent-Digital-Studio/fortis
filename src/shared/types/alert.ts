import type { ThreatLevel } from './analysis';

export type AlertType = 'ai_threat' | 'rule_based' | 'system';

export type AlertSource = 'ai' | 'rule_engine' | 'system';

export interface Alert {
    id: string;
    timestamp: number;
    type: AlertType;
    threatLevel: ThreatLevel;
    title: string;
    description: string;
    connectionId: string;
    remoteAddress?: string;
    remotePort?: number;
    processName?: string;
    recommendation: string;
    confidence?: number;
    acknowledged: boolean;
    whitelisted: boolean;
    source?: AlertSource;
    dedupKey: string;
    suppressedCount: number;
    createdAt: number;
}

export interface AlertFilters {
    threatLevel?: ThreatLevel;
    type?: AlertType;
    acknowledged?: boolean;
    dateFrom?: number;
    dateTo?: number;
    limit?: number;
    offset?: number;
}

export interface AlertCounts {
    total: number;
    critical: number;
    danger: number;
    warning: number;
    info: number;
    unacknowledged: number;
}
