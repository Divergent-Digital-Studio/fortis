import { EventEmitter } from 'node:events';
import type {
    NetworkConnection,
    ConnectionDiff,
    Alert,
    AIAnalysisResult,
} from '@shared/types';
import type { WhitelistEntry } from '@shared/types/whitelist';
import type { WifiDevice, DnsQueryRecord, VpnLeakStatus, GeoConnection, IotDevice } from '@shared/types/m1';
import type { WeeklyReport, FlowGraph } from '@shared/types/m2';
import type { DefenseAction, TlsCertInfo, BandwidthSnapshot } from '@shared/types/m3';
import type { UpdateStatus } from '@shared/types/m4';
import type { RemoteAgentInfo, RemoteEventItem, RemoteServerState } from '@shared/types/m5';
import type { AppUser, RestApiState, SiemState, InsiderThreatEvent, ComplianceReport } from '@shared/types/m6';
import type { CommunityState } from '@shared/types/m7';

interface ScanMetadata {
    platform: string;
    parser: string;
    durationMs: number;
    connectionCount: number;
    diffCount: number;
    source?: 'primary' | 'fallback' | 'worker';
}

export interface FortisEventMap {
    'scan:trigger': void;
    'scan:complete': { connections: NetworkConnection[]; metadata: ScanMetadata };
    'scan:error': { error: Error; platform: string };
    'diff:detected': { diff: ConnectionDiff };
    'diff:none': { timestamp: number };
    'threat:detected': { alert: Alert };
    'threat:resolved': { alertId: string };
    'settings:changed': { key: string; value: unknown };
    'monitor:pause': void;
    'monitor:resume': void;
    'analysis:start': { connectionCount: number; provider: string };
    'analysis:complete': { result: AIAnalysisResult };
    'analysis:error': { error: Error; provider: string; fallbackUsed?: boolean };
    'analysis:cached': { result: AIAnalysisResult };
    'analysis:skipped': { reason: string };
    'analysis:fallback': { fromLayer: string; toLayer: string; reason: string; provider?: string };
    'analysis:degraded': { active: boolean; message: string };
    'whitelist:updated': { entry: WhitelistEntry; action: 'added' | 'removed' };
    'tier:scan-used': { remaining: number };
    'learning:update': { daysRemaining: number; complete: boolean };
    'ai:provider-disabled': Record<string, never>;
    'devices:discovered': { devices: WifiDevice[] };
    'alert:device-new': { mac: string };
    'dns:collected': { records: DnsQueryRecord[] };
    'vpn:evaluated': { status: VpnLeakStatus };
    'geo:updated': { connections: GeoConnection[] };
    'iot:updated': { devices: IotDevice[] };
    'alert:iot-anomaly': { mac: string };
    'report:generated': { reports: WeeklyReport[] };
    'flow:updated': { graph: FlowGraph };
    'defense:updated': { actions: DefenseAction[] };
    'certs:updated': { certs: TlsCertInfo[] };
    'bandwidth:updated': { snapshot: BandwidthSnapshot };
    'update:status': UpdateStatus;
    'remote:agents': { agents: RemoteAgentInfo[] };
    'remote:event': { item: RemoteEventItem };
    'remote:server-state': RemoteServerState;
    'rest:state': RestApiState;
    'siem:state': SiemState;
    'users:changed': { users: AppUser[] };
    'insider:event': { event: InsiderThreatEvent };
    'compliance:ready': { report: ComplianceReport };
    'community:state': CommunityState;
}

type EventPayload<K extends keyof FortisEventMap> =
    FortisEventMap[K] extends void ? [] : [FortisEventMap[K]];

const PHASE2_EVENTS: ReadonlySet<string> = new Set([
    'analysis:start',
    'analysis:complete',
    'analysis:error',
    'analysis:cached',
    'analysis:skipped',
    'analysis:fallback',
    'analysis:degraded',
    'threat:detected',
    'threat:resolved',
    'whitelist:updated',
    'tier:scan-used',
    'learning:update',
]);

export class FortisEventBus {
    private emitter: EventEmitter;
    private debugMode: boolean;

    constructor() {
        this.emitter = new EventEmitter();
        this.emitter.setMaxListeners(50);
        this.debugMode = process.env.FORTIS_DEBUG === '1' || process.env.NODE_ENV === 'development';
    }

    setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
    }

    emit<K extends keyof FortisEventMap>(
        event: K,
        ...args: EventPayload<K>
    ): boolean {
        if (this.debugMode && PHASE2_EVENTS.has(event as string)) {
            const payload = args[0] as Record<string, unknown> | undefined;
            const summary = payload ? this.summarizePayload(event as string, payload) : 'void';
            console.debug(`[EventBus] ${String(event)} → ${summary}`);
        }

        return this.emitter.emit(event as string, ...args);
    }

    private summarizePayload(event: string, payload: Record<string, unknown>): string {
        switch (event) {
            case 'analysis:start':
                return `connections=${payload.connectionCount}, provider=${payload.provider}`;
            case 'analysis:complete':
            case 'analysis:cached': {
                const result = payload.result as Record<string, unknown> | undefined;
                return result
                    ? `threat=${result.overallThreatLevel}, health=${result.healthScore}, findings=${(result.findings as unknown[])?.length ?? 0}`
                    : 'result=null';
            }
            case 'analysis:error':
                return `provider=${payload.provider}, fallback=${payload.fallbackUsed ?? false}`;
            case 'analysis:skipped':
                return `reason=${payload.reason}`;
            case 'analysis:fallback':
                return `from=${payload.fromLayer} → to=${payload.toLayer}, reason=${payload.reason}`;
            case 'analysis:degraded':
                return `active=${payload.active}, message=${payload.message}`;
            case 'threat:detected': {
                const alert = payload.alert as Record<string, unknown> | undefined;
                return alert ? `level=${alert.threatLevel}, title=${alert.title}` : 'alert=null';
            }
            case 'threat:resolved':
                return `alertId=${payload.alertId}`;
            case 'whitelist:updated':
                return `action=${payload.action}`;
            case 'tier:scan-used':
                return `remaining=${payload.remaining}`;
            case 'learning:update':
                return `daysRemaining=${payload.daysRemaining}, complete=${payload.complete}`;
            default:
                return JSON.stringify(payload).slice(0, 100);
        }
    }

    on<K extends keyof FortisEventMap>(
        event: K,
        listener: FortisEventMap[K] extends void
            ? () => void
            : (payload: FortisEventMap[K]) => void,
    ): this {
        this.emitter.on(event as string, listener as (...args: unknown[]) => void);
        return this;
    }

    off<K extends keyof FortisEventMap>(
        event: K,
        listener: FortisEventMap[K] extends void
            ? () => void
            : (payload: FortisEventMap[K]) => void,
    ): this {
        this.emitter.off(event as string, listener as (...args: unknown[]) => void);
        return this;
    }

    once<K extends keyof FortisEventMap>(
        event: K,
        listener: FortisEventMap[K] extends void
            ? () => void
            : (payload: FortisEventMap[K]) => void,
    ): this {
        this.emitter.once(event as string, listener as (...args: unknown[]) => void);
        return this;
    }

    removeAllListeners<K extends keyof FortisEventMap>(event?: K): this {
        if (event) {
            this.emitter.removeAllListeners(event as string);
        } else {
            this.emitter.removeAllListeners();
        }
        return this;
    }

    listenerCount<K extends keyof FortisEventMap>(event: K): number {
        return this.emitter.listenerCount(event as string);
    }

    destroy(): void {
        this.emitter.removeAllListeners();
    }
}

let instance: FortisEventBus | null = null;

export function getEventBus(): FortisEventBus {
    if (!instance) {
        instance = new FortisEventBus();
    }
    return instance;
}

export function resetEventBus(): void {
    if (instance) {
        instance.destroy();
        instance = null;
    }
}

export const eventBus = getEventBus();
