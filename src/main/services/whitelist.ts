import type { IDatabaseService } from './database';
import type { FortisEventBus } from './event-bus';
import type { WhitelistEntry, WhitelistSource } from '@shared/types/whitelist';
import { whitelistEntryMatches } from './db/whitelist-match';
import type { WhitelistMatchEntry, WhitelistQuery } from './db/whitelist-match';

interface WhitelistCacheEntry {
    processName?: string;
    remoteAddress?: string;
    remotePort?: number;
}

class WhitelistService {
    private readonly db: IDatabaseService;
    private readonly eventBus: FortisEventBus;
    private cache: Map<string, WhitelistCacheEntry>;
    private entries: Map<string, WhitelistEntry>;
    private syncSuspended = false;

    constructor(db: IDatabaseService, eventBus: FortisEventBus) {
        this.db = db;
        this.eventBus = eventBus;
        this.cache = new Map();
        this.entries = new Map();
        this.loadFromDatabase();
    }

    private loadFromDatabase(): void {
        try {
            const rows = this.db.getWhitelist();
            this.entries.clear();
            this.cache.clear();

            for (const entry of rows) {
                this.entries.set(entry.id, entry);
                const cacheEntry: WhitelistCacheEntry = {};
                if (entry.processName) cacheEntry.processName = entry.processName;
                if (entry.remoteAddress) cacheEntry.remoteAddress = entry.remoteAddress;
                if (entry.remotePort !== undefined) cacheEntry.remotePort = entry.remotePort;
                this.cache.set(entry.id, cacheEntry);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[Whitelist] Failed to load entries from database: ${message}`);
        }
    }

    add(entry: Omit<WhitelistEntry, 'id' | 'createdAt'>): string {
        const id = this.db.addWhitelistEntry(entry);
        const now = Date.now();

        const fullEntry: WhitelistEntry = {
            id,
            reason: entry.reason,
            source: entry.source,
            createdAt: now,
        };
        if (entry.processName) fullEntry.processName = entry.processName;
        if (entry.remoteAddress) fullEntry.remoteAddress = entry.remoteAddress;
        if (entry.remotePort !== undefined) fullEntry.remotePort = entry.remotePort;

        this.entries.set(id, fullEntry);
        const cacheEntry: WhitelistCacheEntry = {};
        if (entry.processName) cacheEntry.processName = entry.processName;
        if (entry.remoteAddress) cacheEntry.remoteAddress = entry.remoteAddress;
        if (entry.remotePort !== undefined) cacheEntry.remotePort = entry.remotePort;
        this.cache.set(id, cacheEntry);

        this.syncAlertFlags();
        this.eventBus.emit('whitelist:updated', { entry: fullEntry, action: 'added' });

        return id;
    }

    remove(id: string): boolean {
        const entry = this.entries.get(id);
        if (!entry) return false;

        const removed = this.db.removeWhitelistEntry(id);
        if (!removed) return false;

        this.entries.delete(id);
        this.cache.delete(id);

        this.syncAlertFlags();
        this.eventBus.emit('whitelist:updated', { entry, action: 'removed' });

        return true;
    }

    private syncAlertFlags(): void {
        if (this.syncSuspended) return;
        try {
            const matched: string[] = [];
            const unmatched: string[] = [];

            for (const identity of this.db.getAlertIdentities()) {
                const isMatch = this.isWhitelisted(
                    identity.processName,
                    identity.remoteAddress,
                    identity.remotePort,
                );
                (isMatch ? matched : unmatched).push(identity.id);
            }

            this.db.setAlertsWhitelisted(matched, true);
            this.db.setAlertsWhitelisted(unmatched, false);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[Whitelist] Failed to sync alert whitelist flags: ${message}`);
        }
    }

    getAll(): WhitelistEntry[] {
        return Array.from(this.entries.values());
    }

    isWhitelisted(processName?: string, remoteAddress?: string, remotePort?: number): boolean {
        if (!processName && !remoteAddress && remotePort === undefined) return false;

        for (const cached of this.cache.values()) {
            if (this.matchesEntry(cached, processName, remoteAddress, remotePort)) {
                return true;
            }
        }

        return false;
    }

    private matchesEntry(
        cached: WhitelistCacheEntry,
        processName?: string,
        remoteAddress?: string,
        remotePort?: number,
    ): boolean {
        const entry: WhitelistMatchEntry = {};
        if (cached.processName !== undefined) entry.processName = cached.processName;
        if (cached.remoteAddress !== undefined) entry.remoteAddress = cached.remoteAddress;
        if (cached.remotePort !== undefined) entry.remotePort = cached.remotePort;

        const query: WhitelistQuery = {};
        if (processName !== undefined) query.processName = processName;
        if (remoteAddress !== undefined) query.remoteAddress = remoteAddress;
        if (remotePort !== undefined) query.remotePort = remotePort;

        return whitelistEntryMatches(entry, query);
    }

    exportWhitelist(): WhitelistEntry[] {
        return this.getAll();
    }

    importWhitelist(entries: WhitelistEntry[]): { imported: number; skipped: number } {
        let imported = 0;
        let skipped = 0;

        this.syncSuspended = true;
        try {
            ({ imported, skipped } = this.importEntries(entries));
        } finally {
            this.syncSuspended = false;
        }

        if (imported > 0) this.syncAlertFlags();

        return { imported, skipped };
    }

    private importEntries(entries: WhitelistEntry[]): { imported: number; skipped: number } {
        let imported = 0;
        let skipped = 0;

        for (const entry of entries) {
            if (!this.isValidImportEntry(entry)) {
                skipped++;
                continue;
            }

            const alreadyExists = this.isWhitelisted(
                entry.processName,
                entry.remoteAddress,
                entry.remotePort,
            );

            if (alreadyExists) {
                skipped++;
                continue;
            }

            const source: WhitelistSource = entry.source === 'system' ? 'system' : entry.source === 'learning' ? 'learning' : 'user';

            const addEntry: Omit<WhitelistEntry, 'id' | 'createdAt'> = {
                reason: entry.reason || 'Imported from backup',
                source,
            };
            if (entry.processName) addEntry.processName = entry.processName;
            if (entry.remoteAddress) addEntry.remoteAddress = entry.remoteAddress;
            if (entry.remotePort !== undefined) addEntry.remotePort = entry.remotePort;

            this.add(addEntry);

            imported++;
        }

        return { imported, skipped };
    }

    private isValidImportEntry(entry: unknown): entry is WhitelistEntry {
        if (!entry || typeof entry !== 'object') return false;

        const candidate = entry as Record<string, unknown>;

        const hasAtLeastOneField =
            typeof candidate.processName === 'string' ||
            typeof candidate.remoteAddress === 'string' ||
            typeof candidate.remotePort === 'number';

        if (!hasAtLeastOneField) return false;

        if (typeof candidate.reason !== 'string') return false;

        return true;
    }

    getEntryCount(): number {
        return this.entries.size;
    }

    reload(): void {
        this.loadFromDatabase();
    }
}

export { WhitelistService };
