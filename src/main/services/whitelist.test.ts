import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhitelistService } from './whitelist';
import type { IDatabaseService, AlertIdentity } from './database';
import type { FortisEventBus } from './event-bus';
import type { WhitelistEntry } from '../../shared/types/whitelist';

interface Harness {
    service: WhitelistService;
    flags: Map<string, boolean>;
    setAlertsWhitelisted: ReturnType<typeof vi.fn>;
}

function makeService(identities: AlertIdentity[], seed: WhitelistEntry[] = []): Harness {
    const rows = [...seed];
    const flags = new Map<string, boolean>(identities.map((i) => [i.id, false]));
    let nextId = 0;

    const setAlertsWhitelisted = vi.fn((ids: string[], whitelisted: boolean) => {
        for (const id of ids) flags.set(id, whitelisted);
    });

    const database = {
        getWhitelist: () => rows,
        addWhitelistEntry: (entry: Omit<WhitelistEntry, 'id' | 'createdAt'>) => {
            const id = `wl${++nextId}`;
            rows.push({ ...entry, id, createdAt: Date.now() });
            return id;
        },
        removeWhitelistEntry: (id: string) => {
            const idx = rows.findIndex((r) => r.id === id);
            if (idx === -1) return false;
            rows.splice(idx, 1);
            return true;
        },
        getAlertIdentities: () => identities,
        setAlertsWhitelisted,
    } as unknown as IDatabaseService;

    const eventBus = { emit: vi.fn() } as unknown as FortisEventBus;

    return { service: new WhitelistService(database, eventBus), flags, setAlertsWhitelisted };
}

const ALERTS: AlertIdentity[] = [
    { id: 'a1', processName: 'curl', remoteAddress: '203.0.113.7', remotePort: 443 },
    { id: 'a2', processName: 'curl', remoteAddress: '203.0.113.8', remotePort: 443 },
    { id: 'a3', processName: 'ssh', remoteAddress: '198.51.100.1', remotePort: 22 },
];

describe('WhitelistService alert flag sync', () => {
    let h: Harness;

    beforeEach(() => {
        h = makeService(ALERTS);
    });

    it('marks every alert matching a newly added process rule, not just one', () => {
        h.service.add({ processName: 'curl', reason: 'trusted', source: 'user' });

        expect(h.flags.get('a1')).toBe(true);
        expect(h.flags.get('a2')).toBe(true);
        expect(h.flags.get('a3')).toBe(false);
    });

    it('clears the flag again when the entry is removed', () => {
        const id = h.service.add({ processName: 'curl', reason: 'trusted', source: 'user' });
        expect(h.flags.get('a1')).toBe(true);

        h.service.remove(id);

        expect(h.flags.get('a1')).toBe(false);
        expect(h.flags.get('a2')).toBe(false);
    });

    it('matches alerts by CIDR range', () => {
        h.service.add({ remoteAddress: '203.0.113.0/24', reason: 'lab', source: 'user' });

        expect(h.flags.get('a1')).toBe(true);
        expect(h.flags.get('a2')).toBe(true);
        expect(h.flags.get('a3')).toBe(false);
    });

    it('syncs once for a whole import, not once per entry', () => {
        const result = h.service.importWhitelist([
            { processName: 'curl', reason: 'a', source: 'user' } as WhitelistEntry,
            { processName: 'ssh', reason: 'b', source: 'user' } as WhitelistEntry,
        ]);

        expect(result.imported).toBe(2);
        expect(h.setAlertsWhitelisted).toHaveBeenCalledTimes(2);
        expect(h.flags.get('a1')).toBe(true);
        expect(h.flags.get('a3')).toBe(true);
    });

    it('does not sync when an import adds nothing', () => {
        h.setAlertsWhitelisted.mockClear();

        const result = h.service.importWhitelist([{ reason: 'no selector', source: 'user' } as WhitelistEntry]);

        expect(result.skipped).toBe(1);
        expect(h.setAlertsWhitelisted).not.toHaveBeenCalled();
    });
});
