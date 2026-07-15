import type { FortisEventBus } from './event-bus';
import type { IDatabaseService } from './database';
import type { NetworkConnection, ConnectionDiff } from '../../shared/types/connection';
import type { AIModelTier } from '../../shared/types/analysis';
import type { SensitivityTuner, SensitivityConfig } from './sensitivity-tuner';
import type { WhitelistService } from './whitelist';
import type { TierGatingService } from './tier-gating';
import { SUSPICIOUS_PORTS, SUSPICIOUS_IP_LIST, isSuspiciousIP } from './suspicious-indicators';

interface TriggerDecision {
    shouldCall: boolean;
    modelTier: AIModelTier;
    shouldBatch: boolean;
    reason: string;
}

const KNOWN_SAFE_PROCESSES = new Set([
    'node',
    'node.exe',
    'electron',
    'electron.exe',
    'chrome',
    'chrome.exe',
    'google chrome',
    'google chrome helper',
    'firefox',
    'firefox.exe',
    'safari',
    'safari networking',
    'msedge',
    'msedge.exe',
    'microsoft edge',
    'opera',
    'opera.exe',
    'brave',
    'brave.exe',
    'vivaldi',
    'vivaldi.exe',
    'arc',
    'arc.exe',
    'code',
    'code.exe',
    'code helper',
    'cursor',
    'cursor.exe',
    'systemd',
    'systemd-resolved',
    'systemd-networkd',
    'launchd',
    'svchost.exe',
    'services.exe',
    'lsass.exe',
    'csrss.exe',
    'wininit.exe',
    'winlogon.exe',
    'explorer.exe',
    'taskhostw.exe',
    'kernel_task',
    'mds',
    'mds_stores',
    'mdnsresponder',
    'configd',
    'coredns',
    'networkd',
    'nsurlsessiond',
    'trustd',
    'apsd',
    'sharingd',
    'identityservicesd',
    'rapportd',
    'cloudd',
    'spotifyd',
    'spotify',
    'spotify.exe',
    'slack',
    'slack.exe',
    'teams',
    'teams.exe',
    'discord',
    'discord.exe',
    'zoom.us',
    'zoom.exe',
    'dropbox',
    'dropbox.exe',
    'onedrive',
    'onedrive.exe',
    'icloud',
    'bird',
    'com.apple.webkit',
]);

const PERIODIC_CHECK_INTERVAL_MS = 5 * 60 * 1000;

class SmartTriggerService {
    private readonly db: IDatabaseService;
    private readonly sensitivityTuner: SensitivityTuner | null;
    private readonly suspiciousIpList: ReadonlySet<string>;
    private whitelistService: WhitelistService | null = null;
    private tierGating: TierGatingService | null = null;
    private lastAnalysisTime = 0;
    private periodicTimer: ReturnType<typeof setInterval> | null = null;
    private disposed = false;
    private debounceIntervalMs: number;
    private churnThreshold: number;
    private minNewConnections: number;

    constructor(
        _eventBus: FortisEventBus,
        db: IDatabaseService,
        sensitivityTuner?: SensitivityTuner,
        suspiciousIpList: ReadonlySet<string> = SUSPICIOUS_IP_LIST,
    ) {
        this.db = db;
        this.sensitivityTuner = sensitivityTuner ?? null;
        this.suspiciousIpList = suspiciousIpList;

        const config = this.getSensitivityConfig();
        this.debounceIntervalMs = config.smartTriggerDebounceMs;
        this.churnThreshold = config.smartTriggerChurnThreshold;
        this.minNewConnections = config.smartTriggerMinNewConnections;

        if (this.sensitivityTuner) {
            this.sensitivityTuner.onLevelChange((_level, updatedConfig) => {
                this.applyConfig(updatedConfig);
            });
        }
    }

    setWhitelistService(service: WhitelistService): void {
        this.whitelistService = service;
    }

    setTierGating(service: TierGatingService): void {
        this.tierGating = service;
    }

    evaluate(diff: ConnectionDiff): TriggerDecision {
        if (diff.newConnections.length === 0 && diff.droppedConnections.length === 0) {
            return { shouldCall: false, modelTier: 'routine', shouldBatch: false, reason: 'no_diff' };
        }

        if (!this.canTriggerAutomatically()) {
            return { shouldCall: false, modelTier: 'routine', shouldBatch: false, reason: 'free_tier_limit_reached' };
        }

        const suspiciousResult = this.detectSuspiciousPortOrIP(diff.newConnections);
        if (suspiciousResult) {
            return suspiciousResult;
        }

        if (diff.newConnections.length > this.churnThreshold) {
            return { shouldCall: true, modelTier: 'critical', shouldBatch: false, reason: 'rapid_churn_detected' };
        }

        const unknownProcessConnections = diff.newConnections.filter(
            (c) => !this.isKnownSafeProcess(c.processName),
        );

        if (unknownProcessConnections.length > 0) {
            return { shouldCall: true, modelTier: 'routine', shouldBatch: true, reason: 'unknown_process_detected' };
        }

        const allKnownSafe = diff.newConnections.length > 0 &&
            diff.newConnections.every((c) => this.isKnownSafeProcess(c.processName));

        if (allKnownSafe) {
            return { shouldCall: false, modelTier: 'routine', shouldBatch: false, reason: 'all_known_safe' };
        }

        if (diff.newConnections.length < this.minNewConnections && diff.newConnections.length > 0) {
            const now = Date.now();
            if (now - this.lastAnalysisTime > this.debounceIntervalMs) {
                return { shouldCall: true, modelTier: 'routine', shouldBatch: true, reason: 'minor_changes_debounced' };
            }
            return { shouldCall: false, modelTier: 'routine', shouldBatch: false, reason: 'recently_analyzed' };
        }

        if (diff.newConnections.length >= this.minNewConnections) {
            const now = Date.now();
            if (now - this.lastAnalysisTime > this.debounceIntervalMs) {
                return { shouldCall: true, modelTier: 'routine', shouldBatch: true, reason: 'new_connections_above_threshold' };
            }
            return { shouldCall: false, modelTier: 'routine', shouldBatch: false, reason: 'recently_analyzed' };
        }

        return { shouldCall: false, modelTier: 'routine', shouldBatch: false, reason: 'no_actionable_trigger' };
    }

    evaluateManualScan(): TriggerDecision {
        return { shouldCall: true, modelTier: 'critical', shouldBatch: false, reason: 'manual_scan_now' };
    }

    recordAnalysis(): void {
        this.lastAnalysisTime = Date.now();
    }

    startPeriodicCheck(onTrigger: () => void): void {
        this.stopPeriodicCheck();

        this.periodicTimer = setInterval(() => {
            if (this.disposed) return;
            if (!this.canTriggerAutomatically()) return;

            onTrigger();
        }, PERIODIC_CHECK_INTERVAL_MS);
    }

    stopPeriodicCheck(): void {
        if (this.periodicTimer !== null) {
            clearInterval(this.periodicTimer);
            this.periodicTimer = null;
        }
    }

    isKnownSafeProcess(processName: string): boolean {
        const normalized = processName.toLowerCase().trim();

        if (KNOWN_SAFE_PROCESSES.has(normalized)) return true;

        const base = this.basename(normalized);
        if (KNOWN_SAFE_PROCESSES.has(base)) return true;

        const tokens = base.split(/[^a-z0-9.]+/).filter((t) => t.length > 0);
        for (const token of tokens) {
            if (KNOWN_SAFE_PROCESSES.has(token)) return true;
        }

        return this.isWhitelisted(processName);
    }

    private basename(value: string): string {
        const segments = value.split(/[\\/]/);
        return segments[segments.length - 1] ?? value;
    }

    dispose(): void {
        this.disposed = true;
        this.stopPeriodicCheck();
    }

    private applyConfig(config: SensitivityConfig): void {
        this.debounceIntervalMs = config.smartTriggerDebounceMs;
        this.churnThreshold = config.smartTriggerChurnThreshold;
        this.minNewConnections = config.smartTriggerMinNewConnections;
    }

    private getSensitivityConfig(): SensitivityConfig {
        if (this.sensitivityTuner) {
            return this.sensitivityTuner.getConfig();
        }
        const { SensitivityTuner: Tuner } = require('./sensitivity-tuner');
        return Tuner.getConfigForLevel('balanced');
    }

    private detectSuspiciousPortOrIP(connections: NetworkConnection[]): TriggerDecision | null {
        for (const conn of connections) {
            if (SUSPICIOUS_PORTS.has(conn.remotePort)) {
                return {
                    shouldCall: true,
                    modelTier: 'critical',
                    shouldBatch: false,
                    reason: `suspicious_port_${conn.remotePort}`,
                };
            }

            if (this.isSuspiciousIP(conn.remoteAddress)) {
                return {
                    shouldCall: true,
                    modelTier: 'critical',
                    shouldBatch: false,
                    reason: `suspicious_ip_${conn.remoteAddress}`,
                };
            }
        }

        return null;
    }

    private isSuspiciousIP(ip: string): boolean {
        return isSuspiciousIP(ip, this.suspiciousIpList);
    }

    isConnectionWhitelisted(processName?: string, remoteAddress?: string, remotePort?: number): boolean {
        try {
            if (this.whitelistService) {
                return this.whitelistService.isWhitelisted(processName, remoteAddress, remotePort);
            }
            return this.db.isWhitelisted(processName, remoteAddress, remotePort);
        } catch {
            return false;
        }
    }

    private isWhitelisted(processName: string): boolean {
        return this.isConnectionWhitelisted(processName);
    }

    private canTriggerAutomatically(): boolean {
        if (this.tierGating) {
            return this.tierGating.canTriggerAutomatically();
        }

        const tier = this.db.getSetting('tier');
        return tier !== 'free';
    }
}

export { SmartTriggerService };
export type { TriggerDecision };
