import { app } from 'electron';
import v8 from 'v8';

const MEMORY_CHECK_INTERVAL_MS = 60_000;
const SOFT_LIMIT_BYTES = 150 * 1024 * 1024;
const HARD_LIMIT_BYTES = 200 * 1024 * 1024;
const MB = 1024 * 1024;

export interface MemoryUsageSnapshot {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    externalMB: number;
    heapSizeLimit: number;
    timestamp: number;
}

interface MemoryWatchdogDependencies {
    onSoftLimit?: () => void;
    onHardLimit?: () => void;
}

export class MemoryWatchdog {
    private intervalHandle: ReturnType<typeof setInterval> | null = null;
    private softLimitTriggered = false;
    private onSoftLimit: (() => void) | null;
    private onHardLimit: (() => void) | null;

    constructor(deps?: MemoryWatchdogDependencies) {
        this.onSoftLimit = deps?.onSoftLimit ?? null;
        this.onHardLimit = deps?.onHardLimit ?? null;
    }

    start(): void {
        if (this.intervalHandle !== null) return;

        this.intervalHandle = setInterval(() => {
            this.checkMemory();
        }, MEMORY_CHECK_INTERVAL_MS);
    }

    stop(): void {
        if (this.intervalHandle !== null) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    private checkMemory(): void {
        const usage = process.memoryUsage();
        const heapUsed = usage.heapUsed;

        if (heapUsed > HARD_LIMIT_BYTES) {
            this.handleHardLimit(heapUsed);
            return;
        }

        if (heapUsed > SOFT_LIMIT_BYTES) {
            this.handleSoftLimit(heapUsed);
            return;
        }

        if (this.softLimitTriggered) {
            this.softLimitTriggered = false;
        }
    }

    private handleSoftLimit(heapUsed: number): void {
        if (this.softLimitTriggered) return;
        this.softLimitTriggered = true;

        const heapMB = (heapUsed / MB).toFixed(1);
        console.warn(`[MemoryWatchdog] Soft limit reached: ${heapMB}MB / ${SOFT_LIMIT_BYTES / MB}MB. Running cache cleanup.`);

        this.onSoftLimit?.();
        this.hintGarbageCollection();
    }

    private handleHardLimit(heapUsed: number): void {
        const heapMB = (heapUsed / MB).toFixed(1);
        console.error(`[MemoryWatchdog] Hard limit reached: ${heapMB}MB / ${HARD_LIMIT_BYTES / MB}MB. Triggering graceful restart.`);

        this.stop();
        this.onHardLimit?.();
        this.triggerGracefulRestart();
    }

    private hintGarbageCollection(): void {
        if (typeof global.gc === 'function') {
            try {
                global.gc();
            } catch {
                // GC hint unavailable — running without --expose-gc
            }
        }
    }

    private triggerGracefulRestart(): void {
        try {
            app.relaunch();
            app.quit();
        } catch {
            console.error('[MemoryWatchdog] Failed to relaunch app.');
        }
    }

    getMemoryUsage(): MemoryUsageSnapshot {
        const usage = process.memoryUsage();
        const heapStats = v8.getHeapStatistics();

        return {
            heapUsedMB: Math.round((usage.heapUsed / MB) * 100) / 100,
            heapTotalMB: Math.round((usage.heapTotal / MB) * 100) / 100,
            rssMB: Math.round((usage.rss / MB) * 100) / 100,
            externalMB: Math.round((usage.external / MB) * 100) / 100,
            heapSizeLimit: Math.round((heapStats.heap_size_limit / MB) * 100) / 100,
            timestamp: Date.now(),
        };
    }
}
