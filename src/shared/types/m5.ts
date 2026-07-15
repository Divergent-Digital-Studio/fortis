import type { ThreatLevel } from './analysis';

export type RemoteAgentStatus = 'connected' | 'stale' | 'disconnected';

export interface RemoteAgentInfo {
    agentId: string;
    platform: string;
    status: RemoteAgentStatus;
    connectedAt: number;
    lastSeen: number;
}

export interface RemoteEventItem {
    agentId: string;
    kind: 'connections' | 'alert';
    ts: number;
    summary: string;
    threatLevel?: ThreatLevel;
    count?: number;
}

export interface RemoteServerState {
    enabled: boolean;
    listening: boolean;
    host: string;
    port: number;
    agentCount: number;
    error?: string;
}

export interface RemoteSnapshot {
    serverState: RemoteServerState;
    agents: RemoteAgentInfo[];
    events: RemoteEventItem[];
    /** This machine's LAN IPv4, for building the agent's serverUrl. Empty when offline. */
    lanAddress: string;
}

export interface PagerDutyState {
    enabled: boolean;
    configured: boolean;
    severityFloor: ThreatLevel;
}
