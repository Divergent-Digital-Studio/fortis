import { buildDedupKey } from './db/dedup-key'
import type { AlertDisposition } from './db/dedup-key'

const DEFAULT_SUPPRESSION_WINDOW_MS = 30 * 60 * 1000
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

interface DedupEntry {
    timestamp: number
    suppressedCount: number
}

interface DedupKeyInput {
    disposition?: AlertDisposition | undefined
    ruleId?: string | undefined
    findingType?: string | undefined
    processName?: string | undefined
    remoteAddress?: string | undefined
    remotePort?: number | undefined
}

export class AlertDeduplicator {
    private activeKeys = new Map<string, DedupEntry>()
    private suppressionWindowMs: number
    private cleanupTimer: ReturnType<typeof setInterval> | null = null

    constructor(suppressionWindowMs = DEFAULT_SUPPRESSION_WINDOW_MS) {
        this.suppressionWindowMs = suppressionWindowMs
        this.startCleanupTimer()
    }

    generateDedupKey(input: DedupKeyInput): string {
        return buildDedupKey(input)
    }

    shouldSuppress(dedupKey: string): boolean {
        const entry = this.activeKeys.get(dedupKey)
        if (!entry) return false

        const elapsed = Date.now() - entry.timestamp
        if (elapsed > this.suppressionWindowMs) {
            this.activeKeys.delete(dedupKey)
            return false
        }

        entry.suppressedCount++
        return true
    }

    recordAlert(dedupKey: string): void {
        this.activeKeys.set(dedupKey, {
            timestamp: Date.now(),
            suppressedCount: 0,
        })
    }

    getSuppressedCount(dedupKey: string): number {
        return this.activeKeys.get(dedupKey)?.suppressedCount ?? 0
    }

    clearExpired(): void {
        const now = Date.now()

        for (const [key, entry] of this.activeKeys) {
            if (now - entry.timestamp > this.suppressionWindowMs) {
                this.activeKeys.delete(key)
            }
        }
    }

    getActiveKeyCount(): number {
        return this.activeKeys.size
    }

    private startCleanupTimer(): void {
        this.cleanupTimer = setInterval(() => {
            this.clearExpired()
        }, CLEANUP_INTERVAL_MS)
    }

    dispose(): void {
        if (this.cleanupTimer !== null) {
            clearInterval(this.cleanupTimer)
            this.cleanupTimer = null
        }
        this.activeKeys.clear()
    }
}
