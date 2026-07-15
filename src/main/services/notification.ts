import { Notification, BrowserWindow, app } from 'electron';
import type { FortisEventBus } from './event-bus';
import type { DatabaseService } from './database';
import type { Alert } from '@shared/types/alert';
import type { ThreatLevel } from '@shared/types/analysis';
import { IPC_CHANNELS } from '@shared/types/ipc';
import type { SensitivityTuner, SensitivityConfig } from './sensitivity-tuner';

interface NotificationRecord {
    timestamp: number;
    threatLevel: ThreatLevel;
}

interface BatchedWarning {
    alert: Alert;
    scheduledAt: number;
}

const MAX_BODY_LENGTH = 200;
const PAID_TIERS = new Set(['pro', 'enterprise']);

export class NotificationService {
    private eventBus: FortisEventBus;
    private database: DatabaseService;
    private sensitivityTuner: SensitivityTuner | null;
    private notificationHistory: NotificationRecord[] = [];
    private pendingWarning: BatchedWarning | null = null;
    private warningTimer: ReturnType<typeof setTimeout> | null = null;
    private lastWarningTime = 0;
    private rateLimitWindowMs: number;
    private maxNotificationsPerWindow: number;
    private warningBatchIntervalMs: number;
    private disposed = false;
    private readonly onThreatDetected: (payload: { alert: Alert }) => void;

    constructor(eventBus: FortisEventBus, database: DatabaseService, sensitivityTuner?: SensitivityTuner) {
        this.eventBus = eventBus;
        this.database = database;
        this.sensitivityTuner = sensitivityTuner ?? null;

        const config = this.getSensitivityConfig();
        this.rateLimitWindowMs = config.notificationWindowMs;
        this.maxNotificationsPerWindow = config.notificationMaxPerWindow;
        this.warningBatchIntervalMs = config.warningBatchIntervalMs;

        this.onThreatDetected = (payload) => {
            this.handleThreatDetected(payload.alert);
        };

        if (this.sensitivityTuner) {
            this.sensitivityTuner.onLevelChange((_level, updatedConfig) => {
                this.applyConfig(updatedConfig);
            });
        }
    }

    wire(): void {
        this.eventBus.on('threat:detected', this.onThreatDetected);
    }

    private handleThreatDetected(alert: Alert): void {
        if (this.disposed) return;

        const level = alert.threatLevel;

        if (level === 'critical' || level === 'danger') {
            if (!this.isDangerNotificationAllowed()) return;
            this.sendImmediateNotification(alert);
            return;
        }

        if (level === 'warning') {
            if (!this.isPaidNotificationAllowed()) return;
            this.scheduleWarningNotification(alert);
            return;
        }
    }

    private notificationsBaseAllowed(): boolean {
        if (!Notification.isSupported()) return false;
        return this.database.getSetting('notificationsEnabled') === true;
    }

    private isDangerNotificationAllowed(): boolean {
        return this.notificationsBaseAllowed();
    }

    private isPaidNotificationAllowed(): boolean {
        if (!this.notificationsBaseAllowed()) return false;
        const tier = this.database.getSetting('tier');
        return PAID_TIERS.has(tier);
    }

    private isRateLimited(): boolean {
        const now = Date.now();
        this.notificationHistory = this.notificationHistory.filter(
            (record) => now - record.timestamp < this.rateLimitWindowMs,
        );
        return this.notificationHistory.length >= this.maxNotificationsPerWindow;
    }

    private recordNotification(threatLevel: ThreatLevel): void {
        this.notificationHistory.push({
            timestamp: Date.now(),
            threatLevel,
        });
    }

    private sendImmediateNotification(alert: Alert): void {
        if (this.isRateLimited()) return;

        const isCritical = alert.threatLevel === 'critical';
        const title = isCritical ? 'Fortis — Critical Threat' : 'Fortis Security Alert';
        const body = this.formatBody(alert);
        const soundEnabled = this.database.getSetting('soundEnabled');
        const silent = isCritical ? !soundEnabled : true;

        const notification = new Notification({
            title,
            body,
            silent,
        });

        notification.on('click', () => {
            this.focusAndNavigateToAlerts();
        });

        notification.show();
        this.recordNotification(alert.threatLevel);
    }

    private scheduleWarningNotification(alert: Alert): void {
        const now = Date.now();
        const timeSinceLastWarning = now - this.lastWarningTime;

        if (timeSinceLastWarning >= this.warningBatchIntervalMs) {
            this.sendWarningNotification(alert);
            return;
        }

        this.pendingWarning = { alert, scheduledAt: now };

        if (!this.warningTimer) {
            const delay = this.warningBatchIntervalMs - timeSinceLastWarning;
            this.warningTimer = setTimeout(() => {
                this.flushPendingWarning();
            }, delay);
        }
    }

    private flushPendingWarning(): void {
        this.warningTimer = null;

        if (!this.pendingWarning) return;

        const { alert } = this.pendingWarning;
        this.pendingWarning = null;

        if (this.disposed) return;
        if (!this.isPaidNotificationAllowed()) return;

        this.sendWarningNotification(alert);
    }

    private sendWarningNotification(alert: Alert): void {
        if (this.isRateLimited()) return;

        const notification = new Notification({
            title: 'Fortis Security Alert',
            body: this.formatBody(alert),
            silent: true,
        });

        notification.on('click', () => {
            this.focusAndNavigateToAlerts();
        });

        notification.show();
        this.lastWarningTime = Date.now();
        this.recordNotification(alert.threatLevel);
    }

    private formatBody(alert: Alert): string {
        const parts: string[] = [];

        if (alert.processName) {
            parts.push(`Process: ${alert.processName}`);
        }

        if (alert.remoteAddress) {
            const addressPart = alert.remotePort
                ? `${alert.remoteAddress}:${alert.remotePort}`
                : alert.remoteAddress;
            parts.push(`IP: ${addressPart}`);
        }

        const descriptionPrefix = parts.length > 0 ? `${parts.join(' | ')} — ` : '';
        const fullBody = `${descriptionPrefix}${alert.description}`;

        if (fullBody.length <= MAX_BODY_LENGTH) return fullBody;

        return `${fullBody.slice(0, MAX_BODY_LENGTH - 3)}...`;
    }

    private focusAndNavigateToAlerts(): void {
        const allWindows = BrowserWindow.getAllWindows();
        const mainWin = allWindows[0];

        if (!mainWin || mainWin.isDestroyed()) {
            app.emit('activate');
            return;
        }

        if (mainWin.isMinimized()) mainWin.restore();
        mainWin.show();
        mainWin.focus();

        if (process.platform === 'darwin') {
            app.dock?.show();
        }

        mainWin.webContents.send(IPC_CHANNELS.NAVIGATE_TO, 'alerts');
    }

    private applyConfig(config: SensitivityConfig): void {
        this.rateLimitWindowMs = config.notificationWindowMs;
        this.maxNotificationsPerWindow = config.notificationMaxPerWindow;
        this.warningBatchIntervalMs = config.warningBatchIntervalMs;
    }

    private getSensitivityConfig(): SensitivityConfig {
        if (this.sensitivityTuner) {
            return this.sensitivityTuner.getConfig();
        }
        const { SensitivityTuner } = require('./sensitivity-tuner');
        return SensitivityTuner.getConfigForLevel('balanced');
    }

    dispose(): void {
        this.disposed = true;
        this.eventBus.off('threat:detected', this.onThreatDetected);

        if (this.warningTimer) {
            clearTimeout(this.warningTimer);
            this.warningTimer = null;
        }
        this.pendingWarning = null;
        this.notificationHistory = [];
    }
}
