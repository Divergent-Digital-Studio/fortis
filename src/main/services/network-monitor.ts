import type { NetworkConnection, ConnectionDiff } from '@shared/types';
import type { FortisEventBus } from './event-bus';
import type { ScanScheduler } from './scan-scheduler';
import type { IConnectionParser } from '../utils/parsers/parser.interface';
import { DiffEngine } from '../utils/diff-engine';

type MonitorState = 'running' | 'paused' | 'stopped' | 'error';

interface ScanResult {
    connections: NetworkConnection[];
    diff: ConnectionDiff;
    durationMs: number;
}

export class NetworkMonitor {
    private eventBus: FortisEventBus;
    private scheduler: ScanScheduler;
    private parser: IConnectionParser;
    private diffEngine: DiffEngine;
    private status: MonitorState = 'stopped';
    private lastScanTimestamp: number | null = null;
    private scanInProgress = false;

    constructor(
        eventBus: FortisEventBus,
        scheduler: ScanScheduler,
        parser: IConnectionParser,
        diffEngine?: DiffEngine,
    ) {
        this.eventBus = eventBus;
        this.scheduler = scheduler;
        this.parser = parser;
        this.diffEngine = diffEngine ?? new DiffEngine(eventBus);

        this.handleScanTrigger = this.handleScanTrigger.bind(this);
    }

    start(): void {
        if (this.status === 'running') return;

        this.status = 'running';
        this.eventBus.off('scan:trigger', this.handleScanTrigger);
        this.eventBus.on('scan:trigger', this.handleScanTrigger);
        this.scheduler.start();
    }

    stop(): void {
        this.scheduler.stop();
        this.eventBus.off('scan:trigger', this.handleScanTrigger);
        this.status = 'stopped';
        this.diffEngine.reset();
        this.lastScanTimestamp = null;
    }

    pause(): void {
        if (this.status !== 'running') return;

        this.scheduler.pause();
        this.status = 'paused';
        this.eventBus.emit('monitor:pause');
    }

    resume(): void {
        if (this.status !== 'paused') return;

        this.status = 'running';
        this.scheduler.resume();
        this.eventBus.emit('monitor:resume');
    }

    async triggerManualScan(): Promise<ScanResult | null> {
        return this.executeScan();
    }

    getStatus(): MonitorState {
        return this.status;
    }

    getLastScanTimestamp(): number | null {
        return this.lastScanTimestamp;
    }

    getPreviousConnections(): NetworkConnection[] {
        return this.diffEngine.getPreviousConnections();
    }

    private async handleScanTrigger(): Promise<void> {
        await this.executeScan();
    }

    private async executeScan(): Promise<ScanResult | null> {
        if (this.scanInProgress) return null;

        this.scanInProgress = true;
        const startTime = Date.now();

        try {
            const currentConnections = await this.parser.parse();
            const durationMs = Date.now() - startTime;

            const diff = this.diffEngine.computeDiff(currentConnections);

            this.lastScanTimestamp = Date.now();

            const platform = this.parser.getPlatform();
            const parseMeta = this.parser.getLastParseMeta?.() ?? null;

            this.eventBus.emit('scan:complete', {
                connections: currentConnections,
                metadata: {
                    platform,
                    parser: parseMeta?.parser ?? `${platform}-parser`,
                    durationMs,
                    connectionCount: currentConnections.length,
                    diffCount: diff.newConnections.length + diff.droppedConnections.length + diff.changedConnections.length,
                    ...(parseMeta ? { source: parseMeta.source } : {}),
                },
            });

            if (this.status === 'error') {
                this.status = 'running';
            }

            return { connections: currentConnections, diff, durationMs };
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));

            this.status = 'error';

            this.eventBus.emit('scan:error', {
                error,
                platform: this.parser.getPlatform(),
            });

            return null;
        } finally {
            this.scanInProgress = false;
        }
    }

    destroy(): void {
        this.stop();
    }
}
