import { createHash } from 'node:crypto';
import type { IDatabaseService } from '../services/database';
import type { AIAnalysisResult } from '../../shared/types/analysis';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TTL_MS = DEFAULT_TTL_MS;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

interface CacheStats {
    hits: number;
    misses: number;
    lastResetAt: number;
}

export class AICache {
    private readonly db: IDatabaseService;
    private stats: CacheStats;
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor(db: IDatabaseService) {
        this.db = db;
        this.stats = {
            hits: 0,
            misses: 0,
            lastResetAt: Date.now(),
        };
    }

    static generateCacheKey(processName: string, remoteIP: string, remotePort: number): string {
        const input = `${processName}|${remoteIP}|${remotePort}`;
        return createHash('sha256').update(input).digest('hex');
    }

    get(cacheKey: string): AIAnalysisResult | null {
        const resultJson = this.db.getCachedResult(cacheKey);

        if (!resultJson) {
            this.stats.misses++;
            return null;
        }

        try {
            const result = JSON.parse(resultJson) as AIAnalysisResult;
            this.stats.hits++;
            return result;
        } catch {
            this.stats.misses++;
            return null;
        }
    }

    set(cacheKey: string, result: AIAnalysisResult, ttlMs: number = DEFAULT_TTL_MS): void {
        const clampedTtl = Math.min(ttlMs, MAX_TTL_MS);
        const resultJson = JSON.stringify(result);
        this.db.cacheResult(cacheKey, resultJson, clampedTtl);
    }

    clearExpired(): number {
        return this.db.clearExpiredCache();
    }

    getCacheHitRate(): number {
        const total = this.stats.hits + this.stats.misses;
        if (total === 0) return 0;
        return this.stats.hits / total;
    }

    getStats(): CacheStats {
        return { ...this.stats };
    }

    resetStats(): void {
        this.stats = {
            hits: 0,
            misses: 0,
            lastResetAt: Date.now(),
        };
    }

    startPeriodicCleanup(): void {
        if (this.cleanupTimer) return;

        this.cleanupTimer = setInterval(() => {
            this.clearExpired();
            this.maybeResetDailyStats();
        }, CLEANUP_INTERVAL_MS);
    }

    stopPeriodicCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    private maybeResetDailyStats(): void {
        const oneDayMs = 24 * 60 * 60 * 1000;
        if (Date.now() - this.stats.lastResetAt >= oneDayMs) {
            this.resetStats();
        }
    }
}
