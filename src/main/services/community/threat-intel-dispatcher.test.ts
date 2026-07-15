import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThreatIntelDispatcher } from '../threat-intel-dispatcher';
import type { DatabaseService } from '../database';
import type { FortisEventBus } from '../event-bus';
import type { Alert } from '../../../shared/types/alert';

vi.mock('../../utils/anonymizer', () => ({ getSalt: () => 'test-salt' }));

const alert = {
    id: 'a1',
    threatLevel: 'danger',
    timestamp: 1_700_000_123_456,
    processName: 'curl',
    remoteAddress: '203.0.113.7',
    remotePort: 443,
} as unknown as Alert;

function makeDeps(settings: Record<string, unknown>, ok = true) {
    const store = { ...settings };
    const fetchFn = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500 });
    const database = {
        getSetting: (k: string) => store[k],
        setSetting: (k: string, v: unknown) => {
            store[k] = v;
        },
    } as unknown as DatabaseService;
    const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() } as unknown as FortisEventBus;
    return { store, fetchFn, deps: { database, eventBus, fetchFn, backoffMs: 0 } };
}

const base = {
    threatIntelEnabled: true,
    threatIntelVerified: true,
    threatIntelEndpoint: 'https://intel.example.com/submit',
    threatIntelKey: 'k',
    threatIntelSeverityFloor: 'warning',
};

describe('ThreatIntelDispatcher', () => {
    let handler: (p: { alert: Alert }) => void;

    beforeEach(() => {
        handler = () => undefined;
    });

    function capture(deps: ConstructorParameters<typeof ThreatIntelDispatcher>[0]) {
        const d = new ThreatIntelDispatcher(deps);
        (deps.eventBus.on as ReturnType<typeof vi.fn>).mockImplementation((_e: string, h: typeof handler) => {
            handler = h;
        });
        d.start();
        return d;
    }

    it('does not send when enabled but not verified', async () => {
        const { fetchFn, deps } = makeDeps({ ...base, threatIntelVerified: false });
        capture(deps);
        handler({ alert });
        await vi.waitFor(() => expect(fetchFn).not.toHaveBeenCalled());
    });

    it('does not send when verified but not enabled', async () => {
        const { fetchFn, deps } = makeDeps({ ...base, threatIntelEnabled: false });
        capture(deps);
        handler({ alert });
        await vi.waitFor(() => expect(fetchFn).not.toHaveBeenCalled());
    });

    it('does not send alerts below the severity floor', async () => {
        const { fetchFn, deps } = makeDeps({ ...base, threatIntelSeverityFloor: 'critical' });
        capture(deps);
        handler({ alert });
        await vi.waitFor(() => expect(fetchFn).not.toHaveBeenCalled());
    });

    it('sends an anonymized body when enabled, verified and above the floor', async () => {
        const { fetchFn, deps } = makeDeps(base);
        capture(deps);
        handler({ alert });
        await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());
        const [url, init] = fetchFn.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
        expect(url).toBe(base.threatIntelEndpoint);
        expect(init.headers.Authorization).toBe('Bearer k');
        expect(init.body).not.toContain('203.0.113.7');
        expect(init.body).not.toContain('curl');
    });

    it('disabling clears the verified flag so re-enabling cannot silently resume', () => {
        const { store, deps } = makeDeps(base);
        const d = new ThreatIntelDispatcher(deps);
        d.setEnabled(false);
        expect(store.threatIntelVerified).toBe(false);
        d.setEnabled(true);
        expect(d.getState().verified).toBe(false);
    });

    it('changing the endpoint invalidates verification', () => {
        const { store, deps } = makeDeps(base);
        const d = new ThreatIntelDispatcher(deps);
        d.setConfig({ endpoint: 'https://other.example.com', severityFloor: 'danger' });
        expect(store.threatIntelVerified).toBe(false);
        expect(d.getState().configured).toBe(true);
    });

    it('previewBatch honours the severity floor', () => {
        const { deps } = makeDeps({ ...base, threatIntelSeverityFloor: 'critical' });
        const d = new ThreatIntelDispatcher(deps);
        expect(d.previewBatch([alert])).toEqual([]);
        expect(d.previewBatch([{ ...alert, threatLevel: 'critical' } as Alert])).toHaveLength(1);
    });

    it('test() only flips verified on a successful probe', async () => {
        const bad = makeDeps({ ...base, threatIntelVerified: false }, false);
        expect(await new ThreatIntelDispatcher(bad.deps).test(base.threatIntelEndpoint, 'k')).toBe(false);
        expect(bad.store.threatIntelVerified).toBe(false);

        const good = makeDeps({ ...base, threatIntelVerified: false }, true);
        expect(await new ThreatIntelDispatcher(good.deps).test(base.threatIntelEndpoint, 'k')).toBe(true);
        expect(good.store.threatIntelVerified).toBe(true);
    });

    it('test() falls back to the stored key when the field is blank', async () => {
        const { fetchFn, deps } = makeDeps({ ...base, threatIntelVerified: false, threatIntelKey: 'stored-key' });
        await new ThreatIntelDispatcher(deps).test(base.threatIntelEndpoint, '');
        const [, init] = fetchFn.mock.calls[0] as [string, { headers: Record<string, string> }];
        expect(init.headers.Authorization).toBe('Bearer stored-key');
    });

    it('test() prefers an explicitly typed key over the stored one', async () => {
        const { fetchFn, deps } = makeDeps({ ...base, threatIntelVerified: false, threatIntelKey: 'stored-key' });
        await new ThreatIntelDispatcher(deps).test(base.threatIntelEndpoint, 'typed-key');
        const [, init] = fetchFn.mock.calls[0] as [string, { headers: Record<string, string> }];
        expect(init.headers.Authorization).toBe('Bearer typed-key');
    });

    it('test() sends no auth header when neither a typed nor a stored key exists', async () => {
        const { fetchFn, deps } = makeDeps({ ...base, threatIntelVerified: false, threatIntelKey: '' });
        await new ThreatIntelDispatcher(deps).test(base.threatIntelEndpoint, '');
        const [, init] = fetchFn.mock.calls[0] as [string, { headers: Record<string, string> }];
        expect(init.headers.Authorization).toBeUndefined();
    });

    it('test() rejects an empty endpoint without a network call', async () => {
        const { fetchFn, deps } = makeDeps({ ...base, threatIntelVerified: false });
        expect(await new ThreatIntelDispatcher(deps).test('', 'k')).toBe(false);
        expect(fetchFn).not.toHaveBeenCalled();
    });
});
