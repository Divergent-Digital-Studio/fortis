import type { FortisEventBus } from './event-bus';
import type { DatabaseService } from './database';
import type { NetworkConnection } from '@shared/types/connection';
import { pushLearningStatus } from '../ipc-handlers';
import type { LearningStatusPayload } from '@shared/types/ipc';

const LEARNING_PERIOD_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STATUS_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const ALWAYS_ALERT_LEVELS: ReadonlySet<string> = new Set(['danger', 'critical']);

export class LearningPeriodService {
    private eventBus: FortisEventBus;
    private database: DatabaseService;
    private statusTimer: ReturnType<typeof setInterval> | null = null;
    private disposed = false;

    constructor(eventBus: FortisEventBus, database: DatabaseService) {
        this.eventBus = eventBus;
        this.database = database;
    }

    initialize(): void {
        const existingStart = this.database.getSetting('learningPeriodStart');

        if (!existingStart) {
            const now = new Date().toISOString();
            this.database.setSetting('learningPeriodStart', now);
            this.database.setSetting('learningPeriodComplete', false);
        }

        this.checkAndUpdateStatus();
        this.startPeriodicStatusCheck();
    }

    isLearningActive(): boolean {
        const complete = this.database.getSetting('learningPeriodComplete');
        if (complete) return false;

        const startStr = this.database.getSetting('learningPeriodStart');
        if (!startStr) return false;

        const elapsedMs = Date.now() - new Date(startStr).getTime();
        return elapsedMs < LEARNING_PERIOD_DAYS * MS_PER_DAY;
    }

    getDaysRemaining(): number {
        const startStr = this.database.getSetting('learningPeriodStart');
        if (!startStr) return LEARNING_PERIOD_DAYS;

        const elapsedMs = Date.now() - new Date(startStr).getTime();
        const elapsedDays = elapsedMs / MS_PER_DAY;
        const remaining = LEARNING_PERIOD_DAYS - elapsedDays;

        return Math.max(0, Math.ceil(remaining));
    }

    recordConnections(connections: NetworkConnection[]): void {
        if (!this.isLearningActive()) return;

        let failureCount = 0;
        let firstError: unknown = null;

        for (const conn of connections) {
            if (!conn.processName) continue;

            const remoteAddress = conn.remoteAddress || '';
            const remotePort = conn.remotePort || 0;

            if (!remoteAddress && remotePort === 0) continue;

            try {
                this.database.saveBaselineEntry(conn.processName, remoteAddress, remotePort);
            } catch (error) {
                failureCount++;
                if (firstError === null) firstError = error;
            }
        }

        if (failureCount > 0) {
            const message = firstError instanceof Error ? firstError.message : String(firstError);
            console.warn(`[LearningPeriod] Failed to save ${failureCount} baseline entr(ies) this batch: ${message}`);
        }
    }

    shouldSuppressAlert(threatLevel: string): boolean {
        if (!this.isLearningActive()) return false;

        return !ALWAYS_ALERT_LEVELS.has(threatLevel);
    }

    isConnectionInBaseline(processName: string, remoteAddress: string, remotePort: number): boolean {
        return this.database.isInBaseline(processName, remoteAddress, remotePort);
    }

    getBaselineCount(): number {
        return this.database.getBaselineCount();
    }

    getStatus(): LearningStatusPayload {
        const isActive = this.isLearningActive();
        const daysRemaining = this.getDaysRemaining();
        const complete = this.database.getSetting('learningPeriodComplete');
        const baselineCount = this.getBaselineCount();

        return {
            isLearningPeriod: isActive,
            daysRemaining,
            complete: complete === true,
            baselineCount,
        };
    }

    private checkAndUpdateStatus(): void {
        if (this.disposed) return;

        const complete = this.database.getSetting('learningPeriodComplete');

        if (complete) {
            this.emitStatus();
            return;
        }

        const startStr = this.database.getSetting('learningPeriodStart');
        if (!startStr) return;

        const elapsedMs = Date.now() - new Date(startStr).getTime();
        const elapsedDays = elapsedMs / MS_PER_DAY;

        if (elapsedDays >= LEARNING_PERIOD_DAYS) {
            this.database.setSetting('learningPeriodComplete', true);

            this.eventBus.emit('learning:update', {
                daysRemaining: 0,
                complete: true,
            });

            this.emitStatus();
            this.stopPeriodicStatusCheck();
            return;
        }

        this.emitStatus();
    }

    private emitStatus(): void {
        if (this.disposed) return;

        const status = this.getStatus();

        this.eventBus.emit('learning:update', {
            daysRemaining: status.daysRemaining,
            complete: status.complete,
        });

        pushLearningStatus(status);
    }

    private startPeriodicStatusCheck(): void {
        if (this.statusTimer) return;

        this.statusTimer = setInterval(() => {
            this.checkAndUpdateStatus();
        }, STATUS_CHECK_INTERVAL_MS);
    }

    private stopPeriodicStatusCheck(): void {
        if (this.statusTimer) {
            clearInterval(this.statusTimer);
            this.statusTimer = null;
        }
    }

    dispose(): void {
        this.disposed = true;
        this.stopPeriodicStatusCheck();
    }
}
