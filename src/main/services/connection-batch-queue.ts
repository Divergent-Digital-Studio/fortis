import type { NetworkConnection, ConnectionDiff } from '../../shared/types/connection';
import type { AIModelTier } from '../../shared/types/analysis';

interface BatchConfig {
    flushIntervalMs: number;
    maxBatchSize: number;
}

interface BatchEntry {
    connections: NetworkConnection[];
    diff: ConnectionDiff;
    tier: AIModelTier;
    reason: string;
    enqueuedAt: number;
}

interface BatchStatistics {
    totalBatchesFlushed: number;
    totalConnectionsBatched: number;
    totalImmediateBypasses: number;
    averageBatchSize: number;
    connectionsPerAICall: number;
    flushesByTimer: number;
    flushesBySize: number;
    lastFlushTimestamp: number;
}

type FlushCallback = (
    connections: NetworkConnection[],
    combinedDiff: ConnectionDiff,
    tier: AIModelTier,
    reason: string,
) => void;

const DEFAULT_FLUSH_INTERVAL_MS = 15_000;
const DEFAULT_MAX_BATCH_SIZE = 10;

class ConnectionBatchQueue {
    private buffer: BatchEntry[] = [];
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly flushIntervalMs: number;
    private readonly maxBatchSize: number;
    private onFlush: FlushCallback | null = null;
    private disposed = false;

    private stats: BatchStatistics = {
        totalBatchesFlushed: 0,
        totalConnectionsBatched: 0,
        totalImmediateBypasses: 0,
        averageBatchSize: 0,
        connectionsPerAICall: 0,
        flushesByTimer: 0,
        flushesBySize: 0,
        lastFlushTimestamp: 0,
    };

    private totalConnectionsInFlushedBatches = 0;

    constructor(config?: Partial<BatchConfig>) {
        this.flushIntervalMs = config?.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
        this.maxBatchSize = config?.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
    }

    setFlushCallback(callback: FlushCallback): void {
        this.onFlush = callback;
    }

    enqueue(diff: ConnectionDiff, tier: AIModelTier, reason: string): void {
        if (this.disposed) return;

        const entry: BatchEntry = {
            connections: [...diff.newConnections],
            diff,
            tier,
            reason,
            enqueuedAt: Date.now(),
        };

        this.buffer.push(entry);

        if (this.buffer.length === 1) {
            this.startTimer();
        }

        if (this.buffer.length >= this.maxBatchSize) {
            this.flush('size');
        }
    }

    sendImmediate(diff: ConnectionDiff, tier: AIModelTier, reason: string): void {
        if (this.disposed) return;

        this.stats.totalImmediateBypasses++;

        const combinedDiff: ConnectionDiff = {
            timestamp: diff.timestamp,
            newConnections: [...diff.newConnections],
            droppedConnections: [...diff.droppedConnections],
            changedConnections: [...diff.changedConnections],
            totalActive: diff.totalActive,
        };

        this.onFlush?.(diff.newConnections, combinedDiff, tier, reason);
    }

    flush(trigger: 'timer' | 'size' | 'manual' = 'manual'): void {
        if (this.disposed) return;
        if (this.buffer.length === 0) return;

        this.cancelTimer();

        const entries = this.buffer.splice(0);
        const allConnections: NetworkConnection[] = [];
        const allNewConnections: NetworkConnection[] = [];
        const allDroppedConnections: NetworkConnection[] = [];
        const allChangedConnections: ConnectionDiff['changedConnections'] = [];

        let highestTier: AIModelTier = 'routine';
        const reasons: string[] = [];
        let latestTimestamp = 0;
        let totalActive = 0;

        for (const entry of entries) {
            allConnections.push(...entry.connections);
            allNewConnections.push(...entry.diff.newConnections);
            allDroppedConnections.push(...entry.diff.droppedConnections);
            allChangedConnections.push(...entry.diff.changedConnections);

            if (entry.tier === 'critical') {
                highestTier = 'critical';
            }

            if (!reasons.includes(entry.reason)) {
                reasons.push(entry.reason);
            }

            if (entry.diff.timestamp > latestTimestamp) {
                latestTimestamp = entry.diff.timestamp;
            }

            if (entry.diff.totalActive > totalActive) {
                totalActive = entry.diff.totalActive;
            }
        }

        const combinedDiff: ConnectionDiff = {
            timestamp: latestTimestamp,
            newConnections: allNewConnections,
            droppedConnections: allDroppedConnections,
            changedConnections: allChangedConnections,
            totalActive,
        };

        const batchReason = `batch_${trigger}:${reasons.join('+')}`;
        const batchConnectionCount = allConnections.length;

        if (trigger === 'timer') {
            this.stats.flushesByTimer++;
        } else if (trigger === 'size') {
            this.stats.flushesBySize++;
        }

        this.stats.totalBatchesFlushed++;
        this.stats.totalConnectionsBatched += batchConnectionCount;
        this.totalConnectionsInFlushedBatches += batchConnectionCount;
        this.stats.lastFlushTimestamp = Date.now();

        this.stats.averageBatchSize = this.stats.totalBatchesFlushed > 0
            ? this.totalConnectionsInFlushedBatches / this.stats.totalBatchesFlushed
            : 0;

        const totalAICalls = this.stats.totalBatchesFlushed + this.stats.totalImmediateBypasses;
        this.stats.connectionsPerAICall = totalAICalls > 0
            ? (this.stats.totalConnectionsBatched + this.stats.totalImmediateBypasses) / totalAICalls
            : 0;

        this.onFlush?.(allConnections, combinedDiff, highestTier, batchReason);
    }

    getStatistics(): BatchStatistics {
        return { ...this.stats };
    }

    getBufferSize(): number {
        return this.buffer.length;
    }

    isBufferEmpty(): boolean {
        return this.buffer.length === 0;
    }

    clearBuffer(): void {
        this.cancelTimer();
        this.buffer.length = 0;
    }

    dispose(): void {
        this.disposed = true;
        this.cancelTimer();
        this.buffer.length = 0;
    }

    private startTimer(): void {
        if (this.flushTimer !== null) return;

        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            this.flush('timer');
        }, this.flushIntervalMs);
    }

    private cancelTimer(): void {
        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
    }
}

export { ConnectionBatchQueue };
export type { BatchConfig, BatchStatistics, FlushCallback };
