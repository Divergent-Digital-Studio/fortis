import { app } from 'electron';
import type { FortisEventBus } from './event-bus';
import { nextUpdateState, type UpdateEvent } from './update-logic';
import type { UpdateStatus } from '@shared/types/m4';

export interface UpdaterSeam {
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    checkForUpdates(): Promise<unknown>;
    downloadUpdate(): Promise<unknown>;
    quitAndInstall(): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
}

interface UpdateServiceDeps {
    eventBus: FortisEventBus;
    updater: UpdaterSeam;
    isPackaged?: boolean;
}

export class UpdateService {
    private eventBus: FortisEventBus;
    private updater: UpdaterSeam;
    private packaged: boolean;
    private status: UpdateStatus = { kind: 'idle' };

    constructor(deps: UpdateServiceDeps) {
        this.eventBus = deps.eventBus;
        this.updater = deps.updater;
        this.packaged = deps.isPackaged ?? app.isPackaged;
        this.updater.autoDownload = false;
        this.updater.autoInstallOnAppQuit = true;
        this.wireUpdaterEvents();
    }

    private apply(event: UpdateEvent): void {
        this.status = nextUpdateState(this.status, event);
        this.eventBus.emit('update:status', this.status);
    }

    private wireUpdaterEvents(): void {
        this.updater.on('checking-for-update', () => this.apply({ type: 'checking' }));
        this.updater.on('update-available', (info: unknown) => {
            const version = readVersion(info);
            const notes = readNotes(info);
            this.apply(
                notes !== undefined
                    ? { type: 'available', version, notes }
                    : { type: 'available', version },
            );
        });
        this.updater.on('update-not-available', () => this.apply({ type: 'not-available' }));
        this.updater.on('download-progress', (progress: unknown) => {
            this.apply({ type: 'progress', percent: readPercent(progress) });
        });
        this.updater.on('update-downloaded', (info: unknown) => {
            this.apply({ type: 'downloaded', version: readVersion(info) });
        });
        this.updater.on('error', (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[Updater] error:', message);
            this.apply({ type: 'error', message });
        });
    }

    getStatus(): UpdateStatus {
        return this.status;
    }

    start(): void {
        if (!this.packaged) {
            this.apply({ type: 'disabled' });
            return;
        }
        void this.check();
    }

    async check(): Promise<void> {
        if (!this.packaged) {
            this.apply({ type: 'disabled' });
            return;
        }
        try {
            await this.updater.checkForUpdates();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[Updater] check failed:', message);
            this.apply({ type: 'error', message });
        }
    }

    async download(): Promise<void> {
        if (!this.packaged) return;
        try {
            await this.updater.downloadUpdate();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[Updater] download failed:', message);
            this.apply({ type: 'error', message });
        }
    }

    install(): void {
        if (!this.packaged) return;
        this.updater.quitAndInstall();
    }
}

function readVersion(info: unknown): string {
    if (info && typeof info === 'object' && 'version' in info) {
        const v = (info as { version: unknown }).version;
        if (typeof v === 'string') return v;
    }
    return '';
}

function readNotes(info: unknown): string | undefined {
    if (info && typeof info === 'object' && 'releaseNotes' in info) {
        const n = (info as { releaseNotes: unknown }).releaseNotes;
        if (typeof n === 'string') return n;
    }
    return undefined;
}

function readPercent(progress: unknown): number {
    if (progress && typeof progress === 'object' && 'percent' in progress) {
        const p = (progress as { percent: unknown }).percent;
        if (typeof p === 'number') return p;
    }
    return 0;
}
