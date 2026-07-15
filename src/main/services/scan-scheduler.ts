import type { FortisEventBus } from './event-bus';
import { createElectronPowerSource, type PowerSource } from './power-source';

type PowerState = 'ac' | 'battery';
type IdleState = 'active' | 'idle';
type SchedulerStatus = 'running' | 'paused' | 'stopped';

interface AdaptiveConfig {
    acActiveInterval: number;
    batteryInterval: number;
    idleInterval: number;
    idleThresholdSeconds: number;
}

const DEFAULT_ADAPTIVE_CONFIG: AdaptiveConfig = {
    acActiveInterval: 10_000,
    batteryInterval: 30_000,
    idleInterval: 60_000,
    idleThresholdSeconds: 300,
};

const SCAN_WATCHDOG_GRACE_MS = 30_000;

export class ScanScheduler {
    private eventBus: FortisEventBus;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    private status: SchedulerStatus = 'stopped';
    private baseInterval: number;
    private adaptiveEnabled: boolean;
    private adaptiveConfig: AdaptiveConfig;
    private currentInterval: number;
    private nextScanTime: number | null = null;
    private suspended = false;
    private awaitingCompletion = false;
    private overlappingScanCount = 0;
    private readonly powerSource: PowerSource;

    constructor(
        eventBus: FortisEventBus,
        options?: {
            baseInterval?: number;
            adaptiveEnabled?: boolean;
            adaptiveConfig?: Partial<AdaptiveConfig>;
            powerSource?: PowerSource;
        },
    ) {
        this.eventBus = eventBus;
        this.powerSource = options?.powerSource ?? createElectronPowerSource();
        this.baseInterval = options?.baseInterval ?? DEFAULT_ADAPTIVE_CONFIG.acActiveInterval;
        this.adaptiveEnabled = options?.adaptiveEnabled ?? true;
        this.adaptiveConfig = {
            ...DEFAULT_ADAPTIVE_CONFIG,
            ...options?.adaptiveConfig,
        };
        this.currentInterval = this.baseInterval;

        this.handleSuspend = this.handleSuspend.bind(this);
        this.handleResume = this.handleResume.bind(this);
        this.handleOnAc = this.handleOnAc.bind(this);
        this.handleOnBattery = this.handleOnBattery.bind(this);
        this.handleMonitorPause = this.handleMonitorPause.bind(this);
        this.handleMonitorResume = this.handleMonitorResume.bind(this);
        this.handleScanComplete = this.handleScanComplete.bind(this);
        this.handleScanError = this.handleScanError.bind(this);
    }

    start(): void {
        if (this.status === 'running') return;

        this.status = 'running';
        this.suspended = false;
        this.attachPowerListeners();
        this.attachEventBusListeners();
        this.recalculateInterval();
        this.triggerScan();
    }

    stop(): void {
        this.clearTimer();
        this.clearWatchdog();
        this.detachPowerListeners();
        this.detachEventBusListeners();
        this.status = 'stopped';
        this.nextScanTime = null;
        this.awaitingCompletion = false;
    }

    pause(): void {
        if (this.status !== 'running') return;
        this.clearTimer();
        this.clearWatchdog();
        this.status = 'paused';
        this.nextScanTime = null;
        this.awaitingCompletion = false;
    }

    resume(): void {
        if (this.status !== 'paused') return;
        this.status = 'running';
        this.recalculateInterval();
        this.triggerScan();
    }

    setBaseInterval(ms: number): void {
        this.baseInterval = ms;
        this.adaptiveConfig.acActiveInterval = ms;

        if (this.status === 'running') {
            this.recalculateInterval();
            this.reschedule();
        }
    }

    setAdaptiveEnabled(enabled: boolean): void {
        this.adaptiveEnabled = enabled;

        if (this.status === 'running') {
            this.recalculateInterval();
            this.reschedule();
        }
    }

    getStatus(): SchedulerStatus {
        return this.status;
    }

    getNextScanTime(): number | null {
        return this.nextScanTime;
    }

    getCurrentInterval(): number {
        return this.currentInterval;
    }

    getOverlappingScanCount(): number {
        return this.overlappingScanCount;
    }

    private getPowerState(): PowerState {
        try {
            return this.powerSource.isOnBattery() ? 'battery' : 'ac';
        } catch {
            return 'ac';
        }
    }

    private getIdleState(): IdleState {
        try {
            const idleSeconds = this.powerSource.getIdleSeconds();
            return idleSeconds >= this.adaptiveConfig.idleThresholdSeconds ? 'idle' : 'active';
        } catch {
            return 'active';
        }
    }

    private computeAdaptiveInterval(): number {
        if (!this.adaptiveEnabled) {
            return this.baseInterval;
        }

        const idle = this.getIdleState();
        if (idle === 'idle') {
            return this.adaptiveConfig.idleInterval;
        }

        const power = this.getPowerState();
        if (power === 'battery') {
            return this.adaptiveConfig.batteryInterval;
        }

        return this.adaptiveConfig.acActiveInterval;
    }

    private recalculateInterval(): void {
        this.currentInterval = this.computeAdaptiveInterval();
    }

    private triggerScan(): void {
        if (this.status !== 'running') return;

        this.clearTimer();
        this.recalculateInterval();
        this.awaitingCompletion = true;
        this.nextScanTime = null;
        this.armWatchdog();
        this.eventBus.emit('scan:trigger');
    }

    private scheduleNext(): void {
        this.clearTimer();
        this.clearWatchdog();
        this.awaitingCompletion = false;

        if (this.status !== 'running') return;

        this.nextScanTime = Date.now() + this.currentInterval;

        this.timer = setTimeout(() => {
            this.tick();
        }, this.currentInterval);
    }

    private tick(): void {
        if (this.status !== 'running') return;
        this.triggerScan();
    }

    private handleScanComplete(): void {
        this.onScanSettled();
    }

    private handleScanError(): void {
        this.onScanSettled();
    }

    private onScanSettled(): void {
        if (this.status !== 'running') return;
        if (!this.awaitingCompletion) return;

        this.recalculateInterval();
        this.scheduleNext();
    }

    private armWatchdog(): void {
        this.clearWatchdog();

        const graceMs = this.currentInterval + SCAN_WATCHDOG_GRACE_MS;

        this.watchdogTimer = setTimeout(() => {
            if (this.status !== 'running' || !this.awaitingCompletion) return;

            this.overlappingScanCount += 1;
            console.warn(
                `[ScanScheduler] Watchdog fired: scan completion not observed within ${graceMs}ms ` +
                `(overlapping/lost scans: ${this.overlappingScanCount}). Re-arming schedule.`,
            );
            this.recalculateInterval();
            this.scheduleNext();
        }, graceMs);
    }

    private reschedule(): void {
        if (this.status !== 'running') return;
        if (this.awaitingCompletion) return;
        this.scheduleNext();
    }

    private clearTimer(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private clearWatchdog(): void {
        if (this.watchdogTimer !== null) {
            clearTimeout(this.watchdogTimer);
            this.watchdogTimer = null;
        }
    }

    private handleSuspend(): void {
        if (this.status === 'running') {
            this.suspended = true;
            this.clearTimer();
            this.clearWatchdog();
            this.awaitingCompletion = false;
            this.nextScanTime = null;
        }
    }

    private handleResume(): void {
        if (this.suspended && this.status === 'running') {
            this.suspended = false;
            this.recalculateInterval();
            this.triggerScan();
        }
    }

    private handleOnAc(): void {
        if (this.status === 'running' && this.adaptiveEnabled) {
            this.recalculateInterval();
            this.reschedule();
        }
    }

    private handleOnBattery(): void {
        if (this.status === 'running' && this.adaptiveEnabled) {
            this.recalculateInterval();
            this.reschedule();
        }
    }

    private handleMonitorPause(): void {
        this.pause();
    }

    private handleMonitorResume(): void {
        this.resume();
    }

    private attachPowerListeners(): void {
        this.powerSource.on('suspend', this.handleSuspend);
        this.powerSource.on('resume', this.handleResume);
        this.powerSource.on('on-ac', this.handleOnAc);
        this.powerSource.on('on-battery', this.handleOnBattery);
    }

    private detachPowerListeners(): void {
        this.powerSource.off('suspend', this.handleSuspend);
        this.powerSource.off('resume', this.handleResume);
        this.powerSource.off('on-ac', this.handleOnAc);
        this.powerSource.off('on-battery', this.handleOnBattery);
    }

    private attachEventBusListeners(): void {
        this.eventBus.off('monitor:pause', this.handleMonitorPause);
        this.eventBus.off('monitor:resume', this.handleMonitorResume);
        this.eventBus.off('scan:complete', this.handleScanComplete);
        this.eventBus.off('scan:error', this.handleScanError);
        this.eventBus.on('monitor:pause', this.handleMonitorPause);
        this.eventBus.on('monitor:resume', this.handleMonitorResume);
        this.eventBus.on('scan:complete', this.handleScanComplete);
        this.eventBus.on('scan:error', this.handleScanError);
    }

    private detachEventBusListeners(): void {
        this.eventBus.off('monitor:pause', this.handleMonitorPause);
        this.eventBus.off('monitor:resume', this.handleMonitorResume);
        this.eventBus.off('scan:complete', this.handleScanComplete);
        this.eventBus.off('scan:error', this.handleScanError);
    }

    destroy(): void {
        this.stop();
    }
}
