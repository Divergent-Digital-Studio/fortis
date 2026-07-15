import type { NetworkConnection } from './connection';

export type ThreatLevel = 'safe' | 'info' | 'warning' | 'danger' | 'critical';

export type ViewType = 'overview' | 'connections' | 'alerts' | 'settings' | 'devices' | 'dns' | 'geo' | 'iot' | 'reports' | 'flow' | 'defense' | 'bandwidth' | 'remote' | 'admin' | 'community';

export type AIProviderType = 'openai' | 'anthropic' | 'ollama';

export type AIModelTier = 'routine' | 'critical';

export interface AIFinding {
    id: string;
    connectionId: string;
    remoteAddress: string;
    port: number;
    process: string;
    threatLevel: ThreatLevel;
    confidence: number;
    explanation: string;
    recommendation: string;
    category?: string;
    description?: string;
    metadata?: Record<string, unknown>;
}

export interface AIAnalysisResult {
    id: string;
    timestamp: number;
    overallThreatLevel: ThreatLevel;
    healthScore: number;
    summary: string;
    findings: AIFinding[];
    newConnections: number;
    droppedConnections: number;
    provider: string;
    model: string;
    tokensUsed: number;
    costEstimate: number;
    cached: boolean;
    latencyMs: number;
}

export interface AIUsageStats {
    totalCalls: number;
    totalTokens: number;
    totalCostUSD: number;
    callsToday: number;
    averageLatencyMs: number;
    cacheHitRate: number;
    providerBreakdown: Record<AIProviderType, {
        calls: number;
        tokens: number;
        costUSD: number;
    }>;
}

export interface AnonymizedConnection {
    id: string;
    protocol: string;
    localPort: number;
    remoteAddress: string;
    remotePort: number;
    state: string;
    processName: string;
    isNew: boolean;
    isChanged: boolean;
}

export interface AnonymizedPayload {
    connections: AnonymizedConnection[];
    scanTimestamp: number;
    platform: string;
    totalActive: number;
}

export interface ThreatRuleResult {
    matched: boolean;
    threatLevel: ThreatLevel;
    confidence: number;
    explanation: string;
    recommendation: string;
    affectedConnections: string[];
}

export interface IThreatRule {
    id: string;
    name: string;
    description: string;
    evaluate(connections: NetworkConnection[]): ThreatRuleResult;
}

export interface IAIProvider {
    name: AIProviderType;
    analyzeConnections(payload: AnonymizedPayload, tier: AIModelTier, signal?: AbortSignal): Promise<AIAnalysisResult>;
    isAvailable(): Promise<boolean>;
    validateKey(keyToValidate?: string): Promise<{ valid: boolean; error?: string }>;
}
