import type { FortisEventBus } from './event-bus';
import type { NetworkMonitor as _NetworkMonitor } from './network-monitor';
import type { ScanScheduler } from './scan-scheduler';
import type { DatabaseService } from './database';
import { ThreatDetector } from './threat-detector';
import type { RuleResult } from './threat-detector';
import { AlertDeduplicator } from './alert-deduplicator';
import { retentionMsForTier } from './db/retention';
import { ConfidenceScorer } from './confidence-scorer';
import { SensitivityTuner } from './sensitivity-tuner';
import type { WhitelistService } from './whitelist';
import type { LearningPeriodService } from './learning-period';
import type { SensitivityLevel } from '@shared/types/settings';
import { updateTrayState, updateConnectionCount } from '../tray';
import {
    updateCachedConnections,
    pushScanStatusUpdate,
    pushNewAlert,
    handleScanError,
} from '../ipc-handlers';
import type { Alert, AlertType } from '@shared/types/alert';

interface EventPipelineDependencies {
    eventBus: FortisEventBus;
    monitor: _NetworkMonitor;
    scheduler: ScanScheduler;
    database: DatabaseService;
    sensitivityTuner?: SensitivityTuner;
}

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

export class EventPipeline {
    private eventBus: FortisEventBus;
    private scheduler: ScanScheduler;
    private database: DatabaseService;
    private threatDetector: ThreatDetector;
    private alertDeduplicator: AlertDeduplicator;
    private confidenceScorer: ConfidenceScorer;
    private sensitivityTuner: SensitivityTuner;
    private whitelistService: WhitelistService | null = null;
    private learningPeriodService: LearningPeriodService | null = null;
    private lastSnapshotTime = 0;
    private compactTimer: ReturnType<typeof setInterval> | null = null;
    private disposed = false;

    constructor(deps: EventPipelineDependencies) {
        this.eventBus = deps.eventBus;
        this.scheduler = deps.scheduler;
        this.database = deps.database;
        this.sensitivityTuner = deps.sensitivityTuner ?? new SensitivityTuner();
        this.threatDetector = new ThreatDetector();
        this.alertDeduplicator = new AlertDeduplicator();
        this.confidenceScorer = new ConfidenceScorer(this.sensitivityTuner);

        this.handleScanComplete = this.handleScanComplete.bind(this);
        this.handleDiffDetected = this.handleDiffDetected.bind(this);
        this.handleDiffNone = this.handleDiffNone.bind(this);
        this.handleScanError = this.handleScanError.bind(this);
        this.handleMonitorPause = this.handleMonitorPause.bind(this);
        this.handleMonitorResume = this.handleMonitorResume.bind(this);
        this.handleSettingsChanged = this.handleSettingsChanged.bind(this);
    }

    getSensitivityTuner(): SensitivityTuner {
        return this.sensitivityTuner;
    }

    setWhitelistService(service: WhitelistService): void {
        this.whitelistService = service;
    }

    setLearningPeriodService(service: LearningPeriodService): void {
        this.learningPeriodService = service;
    }

    wire(): void {
        this.eventBus.on('scan:complete', this.handleScanComplete);
        this.eventBus.on('diff:detected', this.handleDiffDetected);
        this.eventBus.on('diff:none', this.handleDiffNone);
        this.eventBus.on('scan:error', this.handleScanError);
        this.eventBus.on('monitor:pause', this.handleMonitorPause);
        this.eventBus.on('monitor:resume', this.handleMonitorResume);
        this.eventBus.on('settings:changed', this.handleSettingsChanged);

        this.startCompactionTimer();
    }

    private handleScanComplete(payload: {
        connections: import('@shared/types').NetworkConnection[];
        metadata: {
            platform: string;
            parser: string;
            durationMs: number;
            connectionCount: number;
            diffCount: number;
        };
    }): void {
        if (this.disposed) return;

        const { connections, metadata } = payload;

        try {
            this.database.saveScanMetadata({
                timestamp: Date.now(),
                platform: metadata.platform,
                parser: metadata.parser,
                durationMs: metadata.durationMs,
                connectionCount: metadata.connectionCount,
                diffCount: metadata.diffCount,
            });
        } catch {
            // noop — scan metadata persistence failure is non-critical
        }

        const now = Date.now();
        if (now - this.lastSnapshotTime >= SNAPSHOT_INTERVAL_MS) {
            try {
                this.database.saveSnapshot({
                    timestamp: now,
                    connections,
                });
                this.lastSnapshotTime = now;
            } catch {
                // noop — snapshot persistence failure is non-critical
            }
        }

        updateCachedConnections(connections);
        updateConnectionCount(connections.length);

        if (this.learningPeriodService) {
            this.learningPeriodService.recordConnections(connections);
        }

        this.runThreatDetection(connections);

        pushScanStatusUpdate({ scanning: false });
    }

    private runThreatDetection(connections: import('@shared/types').NetworkConnection[]): void {
        if (this.disposed) return;

        let alerts: RuleResult[];
        let silentLogs: RuleResult[];
        try {
            const results = this.threatDetector.evaluateAll(connections);
            const filtered = this.confidenceScorer.filterBatch(results);
            alerts = filtered.alerts;
            silentLogs = filtered.silentLogs;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[EventPipeline] Threat detection failed for scan of ${connections.length} connections: ${message}`);
            this.emitDetectionDegraded(message);
            return;
        }

        for (const result of alerts) {
            try {
                this.handleThreatResult(result);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`[EventPipeline] Failed to handle threat result "${result.ruleId}": ${message}`);
            }
        }

        for (const result of silentLogs) {
            try {
                this.logSilentDetection(result);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`[EventPipeline] Failed to log silent detection "${result.ruleId}": ${message}`);
            }
        }
    }

    private emitDetectionDegraded(reason: string): void {
        try {
            this.eventBus.emit('analysis:degraded', {
                active: true,
                message: `Rule-based threat detection error: ${reason}`,
            });
        } catch {
            // structured-log fallback only — degraded signal emission must never re-throw into the scan loop
            console.error('[EventPipeline] Failed to emit detection-degraded signal');
        }
    }

    private handleThreatResult(result: RuleResult): void {
        if (this.disposed) return;

        try {
            if (this.whitelistService) {
                const isWl = this.whitelistService.isWhitelisted(
                    result.processName,
                    result.remoteAddress,
                    result.remotePort,
                );
                if (isWl) return;
            }

            if (this.learningPeriodService && this.learningPeriodService.shouldSuppressAlert(result.threatLevel)) {
                this.logLearningDetection(result);
                return;
            }

            const dedupKey = this.alertDeduplicator.generateDedupKey({
                ruleId: result.ruleId,
                processName: result.processName,
                remoteAddress: result.remoteAddress,
                remotePort: result.remotePort,
            });

            if (this.alertDeduplicator.shouldSuppress(dedupKey)) {
                try {
                    this.database.saveAlert({
                        timestamp: Date.now(),
                        type: 'rule_based' as AlertType,
                        threatLevel: result.threatLevel,
                        title: result.ruleName,
                        description: result.reason,
                        connectionId: result.connectionId,
                        recommendation: result.recommendation,
                        confidence: result.confidence,
                        source: 'rule_engine',
                        dedupKey,
                    });
                } catch {
                    // noop — suppressed count persistence failure is non-critical
                }
                return;
            }

            this.alertDeduplicator.recordAlert(dedupKey);

            const now = Date.now();

            const alertInput: Parameters<typeof this.database.saveAlert>[0] = {
                timestamp: now,
                type: 'rule_based' as AlertType,
                threatLevel: result.threatLevel,
                title: result.ruleName,
                description: result.reason,
                connectionId: result.connectionId,
                recommendation: result.recommendation,
                confidence: result.confidence,
                source: 'rule_engine',
                dedupKey,
            };
            if (result.remoteAddress) alertInput.remoteAddress = result.remoteAddress;
            if (result.remotePort) alertInput.remotePort = result.remotePort;
            if (result.processName) alertInput.processName = result.processName;

            const alertId = this.database.saveAlert(alertInput);

            const alert: Alert = {
                id: alertId,
                timestamp: now,
                type: 'rule_based',
                threatLevel: result.threatLevel,
                title: result.ruleName,
                description: result.reason,
                connectionId: result.connectionId,
                recommendation: result.recommendation,
                confidence: result.confidence,
                source: 'rule_engine',
                acknowledged: false,
                whitelisted: false,
                dedupKey,
                suppressedCount: this.alertDeduplicator.getSuppressedCount(dedupKey),
                createdAt: now,
            };
            if (result.remoteAddress) alert.remoteAddress = result.remoteAddress;
            if (result.remotePort) alert.remotePort = result.remotePort;
            if (result.processName) alert.processName = result.processName;

            this.eventBus.emit('threat:detected', { alert });
            pushNewAlert(alert);
        } catch {
            // noop — alert persistence failure is non-critical
        }
    }

    private logLearningDetection(result: RuleResult): void {
        try {
            const alertInput: Parameters<typeof this.database.saveAlert>[0] = {
                timestamp: Date.now(),
                type: 'rule_based' as AlertType,
                threatLevel: 'info',
                title: `[Learning] ${result.ruleName}`,
                description: result.reason,
                connectionId: result.connectionId,
                recommendation: 'This detection occurred during the learning period and was suppressed.',
                confidence: result.confidence,
                source: 'rule_engine',
                dedupKey: this.alertDeduplicator.generateDedupKey({
                    disposition: 'learning',
                    ruleId: result.ruleId,
                    processName: result.processName,
                    remoteAddress: result.remoteAddress,
                    remotePort: result.remotePort,
                }),
            };
            if (result.remoteAddress) alertInput.remoteAddress = result.remoteAddress;
            if (result.remotePort) alertInput.remotePort = result.remotePort;
            if (result.processName) alertInput.processName = result.processName;

            this.database.saveAlert(alertInput);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[EventPipeline] Failed to persist learning detection "${result.ruleId}": ${message}`);
        }
    }

    private handleDiffDetected(payload: {
        diff: import('@shared/types').ConnectionDiff;
    }): void {
        if (this.disposed) return;

        const { diff } = payload;
        const scanId = `scan_${Date.now()}`;

        try {
            const diffInputs: Array<{
                scanId: string;
                timestamp: number;
                type: 'new' | 'dropped' | 'changed';
                connectionData: import('@shared/types').NetworkConnection;
            }> = [];

            for (const conn of diff.newConnections) {
                diffInputs.push({
                    scanId,
                    timestamp: diff.timestamp,
                    type: 'new',
                    connectionData: conn,
                });
            }

            for (const conn of diff.droppedConnections) {
                diffInputs.push({
                    scanId,
                    timestamp: diff.timestamp,
                    type: 'dropped',
                    connectionData: conn,
                });
            }

            for (const change of diff.changedConnections) {
                diffInputs.push({
                    scanId,
                    timestamp: diff.timestamp,
                    type: 'changed',
                    connectionData: change.after,
                });
            }

            if (diffInputs.length > 0) {
                this.database.saveBatchDiffs(diffInputs);
            }
        } catch {
            // noop — diff persistence failure is non-critical
        }
    }

    private handleDiffNone(_payload: { timestamp: number }): void {
        // no-op — no changes to persist
    }

    private handleScanError(payload: {
        error: Error;
        platform: string;
    }): void {
        if (this.disposed) return;

        handleScanError(payload.error);
    }

    private handleMonitorPause(): void {
        if (this.disposed) return;

        updateTrayState('paused');
        pushScanStatusUpdate({ scanning: false });
    }

    private handleMonitorResume(): void {
        if (this.disposed) return;

        updateTrayState('active');
    }

    private handleSettingsChanged(payload: {
        key: string;
        value: unknown;
    }): void {
        if (this.disposed) return;

        if (payload.key === 'scanInterval' && typeof payload.value === 'number') {
            this.scheduler.setBaseInterval(payload.value);
        }

        if (payload.key === 'adaptiveInterval' && typeof payload.value === 'boolean') {
            this.scheduler.setAdaptiveEnabled(payload.value);
        }

        if (payload.key === 'sensitivityLevel' && typeof payload.value === 'string') {
            const validLevels: SensitivityLevel[] = ['paranoid', 'balanced', 'relaxed'];
            if (validLevels.includes(payload.value as SensitivityLevel)) {
                this.sensitivityTuner.setLevel(payload.value as SensitivityLevel);
            }
        }
    }

    private logSilentDetection(result: RuleResult): void {
        try {
            const alertInput: Parameters<typeof this.database.saveAlert>[0] = {
                timestamp: Date.now(),
                type: 'rule_based' as AlertType,
                threatLevel: 'info',
                title: `[Silent] ${result.ruleName}`,
                description: result.reason,
                connectionId: result.connectionId,
                recommendation: result.recommendation,
                confidence: result.confidence,
                source: 'rule_engine',
                dedupKey: this.alertDeduplicator.generateDedupKey({
                    disposition: 'silent',
                    ruleId: result.ruleId,
                    processName: result.processName,
                    remoteAddress: result.remoteAddress,
                    remotePort: result.remotePort,
                }),
            };
            if (result.remoteAddress) alertInput.remoteAddress = result.remoteAddress;
            if (result.remotePort) alertInput.remotePort = result.remotePort;
            if (result.processName) alertInput.processName = result.processName;

            this.database.saveAlert(alertInput);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[EventPipeline] Failed to persist silent detection "${result.ruleId}": ${message}`);
        }
    }

    private startCompactionTimer(): void {
        const ONE_HOUR_MS = 60 * 60 * 1000;

        this.compactTimer = setInterval(() => {
            if (this.disposed) return;

            try {
                const tier = this.database.getSetting('tier');
                this.database.compact(retentionMsForTier(tier));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`[EventPipeline] Retention compaction failed: ${message}`);
            }
        }, ONE_HOUR_MS);
    }

    dispose(): void {
        this.disposed = true;

        this.eventBus.off('scan:complete', this.handleScanComplete);
        this.eventBus.off('diff:detected', this.handleDiffDetected);
        this.eventBus.off('diff:none', this.handleDiffNone);
        this.eventBus.off('scan:error', this.handleScanError);
        this.eventBus.off('monitor:pause', this.handleMonitorPause);
        this.eventBus.off('monitor:resume', this.handleMonitorResume);
        this.eventBus.off('settings:changed', this.handleSettingsChanged);

        if (this.compactTimer !== null) {
            clearInterval(this.compactTimer);
            this.compactTimer = null;
        }

        this.alertDeduplicator.dispose();
        this.sensitivityTuner.dispose();
    }
}
