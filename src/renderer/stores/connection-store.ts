import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
    NetworkConnection,
    ConnectionStats,
    ThreatLevel,
    AIAnalysisResult,
    Alert,
} from '../../shared/types';

type ScanStatus = 'idle' | 'scanning' | 'error';

type ThreatSource = 'ai' | 'rule' | null;

interface ConnectionThreatData {
    threatLevel: ThreatLevel | null;
    confidence: number | null;
    explanation: string | null;
    source: ThreatSource;
}

interface ConnectionState {
    connections: NetworkConnection[];
    lastScanTimestamp: number;
    scanStatus: ScanStatus;
    connectionStats: ConnectionStats;
    threatMap: Map<string, ConnectionThreatData>;
}

interface ConnectionActions {
    setConnections: (connections: NetworkConnection[]) => void;
    clearConnections: () => void;
    setScanStatus: (status: ScanStatus) => void;
    setConnectionStats: (stats: ConnectionStats) => void;
    setLastScanTimestamp: (timestamp: number) => void;
    mergeAIAnalysis: (result: AIAnalysisResult) => void;
    mergeRuleAlert: (alert: Alert) => void;
    getThreatData: (connectionId: string) => ConnectionThreatData | undefined;
    initGlobalSubscriptions: () => () => void;
}

type ConnectionStore = ConnectionState & ConnectionActions;

const INITIAL_STATS: ConnectionStats = {
    totalActive: 0,
    totalTcp: 0,
    totalUdp: 0,
    totalEstablished: 0,
    totalListening: 0,
    uniqueRemoteAddresses: 0,
    uniqueProcesses: 0,
    topProcesses: [],
    topRemoteAddresses: [],
};

const THREAT_PRIORITY: Record<ThreatLevel, number> = {
    critical: 5,
    danger: 4,
    warning: 3,
    info: 2,
    safe: 1,
};

function shouldOverrideThreat(
    existing: ConnectionThreatData | undefined,
    incoming: ConnectionThreatData,
): boolean {
    if (!existing || existing.threatLevel === null) return true;
    if (incoming.threatLevel === null) return false;

    const existingPriority = THREAT_PRIORITY[existing.threatLevel];
    const incomingPriority = THREAT_PRIORITY[incoming.threatLevel!];

    if (incomingPriority > existingPriority) return true;

    if (incomingPriority === existingPriority) {
        if (incoming.source === 'ai' && existing.source === 'rule') return true;
        if (
            incoming.source === existing.source &&
            (incoming.confidence ?? 0) > (existing.confidence ?? 0)
        ) {
            return true;
        }
    }

    return false;
}

export const useConnectionStore = create<ConnectionStore>()(
    subscribeWithSelector((set, get) => ({
        connections: [],
        lastScanTimestamp: 0,
        scanStatus: 'idle',
        connectionStats: INITIAL_STATS,
        threatMap: new Map<string, ConnectionThreatData>(),

        setConnections: (connections) =>
            set({
                connections,
                lastScanTimestamp: Date.now(),
            }),

        clearConnections: () =>
            set({
                connections: [],
                connectionStats: INITIAL_STATS,
                threatMap: new Map(),
            }),

        setScanStatus: (scanStatus) => set({ scanStatus }),

        setConnectionStats: (connectionStats) => set({ connectionStats }),

        setLastScanTimestamp: (lastScanTimestamp) =>
            set({ lastScanTimestamp }),

        mergeAIAnalysis: (result) => {
            if (!result.findings || result.findings.length === 0) return;

            const currentMap = get().threatMap;
            const nextMap = new Map(currentMap);

            for (const finding of result.findings) {
                const incoming: ConnectionThreatData = {
                    threatLevel: finding.threatLevel,
                    confidence: finding.confidence,
                    explanation: finding.explanation,
                    source: 'ai',
                };

                const existing = nextMap.get(finding.connectionId);
                if (shouldOverrideThreat(existing, incoming)) {
                    nextMap.set(finding.connectionId, incoming);
                }
            }

            set({ threatMap: nextMap });
        },

        mergeRuleAlert: (alert) => {
            if (alert.type !== 'rule_based') return;

            const connectionId = alert.connectionId;
            if (!connectionId) {
                const { connections } = get();
                const matching = connections.filter(
                    (c) =>
                        (alert.processName && c.processName === alert.processName) ||
                        (alert.remoteAddress && c.remoteAddress === alert.remoteAddress &&
                            alert.remotePort && c.remotePort === alert.remotePort),
                );

                if (matching.length === 0) return;

                const currentMap = get().threatMap;
                const nextMap = new Map(currentMap);

                for (const conn of matching) {
                    const incoming: ConnectionThreatData = {
                        threatLevel: alert.threatLevel,
                        confidence: alert.confidence ?? null,
                        explanation: alert.description,
                        source: 'rule',
                    };

                    const existing = nextMap.get(conn.id);
                    if (shouldOverrideThreat(existing, incoming)) {
                        nextMap.set(conn.id, incoming);
                    }
                }

                set({ threatMap: nextMap });
                return;
            }

            const incoming: ConnectionThreatData = {
                threatLevel: alert.threatLevel,
                confidence: alert.confidence ?? null,
                explanation: alert.description,
                source: 'rule',
            };

            const currentMap = get().threatMap;
            const existing = currentMap.get(connectionId);
            if (shouldOverrideThreat(existing, incoming)) {
                const nextMap = new Map(currentMap);
                nextMap.set(connectionId, incoming);
                set({ threatMap: nextMap });
            }
        },

        getThreatData: (connectionId) => {
            return get().threatMap.get(connectionId);
        },

        initGlobalSubscriptions: () => {
            const unsubAnalysis = window.fortis.onAnalysisUpdate((result) => {
                get().mergeAIAnalysis(result);
            });

            const unsubAlert = window.fortis.onNewAlert((alert) => {
                get().mergeRuleAlert(alert);
            });

            const unsubConnections = window.fortis.onConnectionsUpdate((updatedConnections) => {
                get().setConnections(updatedConnections);
            });

            const unsubScanStatus = window.fortis.onScanStatus((status) => {
                if (status.error) {
                    get().setScanStatus('error');
                } else if (status.scanning) {
                    get().setScanStatus('scanning');
                } else {
                    get().setScanStatus('idle');
                }
            });

            return () => {
                unsubAnalysis();
                unsubAlert();
                unsubConnections();
                unsubScanStatus();
            };
        },
    })),
);

export type { ConnectionThreatData, ThreatSource };
