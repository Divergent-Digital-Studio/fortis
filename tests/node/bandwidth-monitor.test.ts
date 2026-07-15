import { describe, it, expect, vi } from 'vitest';
import { BandwidthMonitor, type SampleSource } from '@main/services/bandwidth-monitor';
import type { BandwidthSample } from '@main/services/bandwidth/bandwidth-delta';
import { createBandwidthSource } from '@main/services/bandwidth/bandwidth-source';
import type { FortisEventBus } from '@main/services/event-bus';

function fakeBus(): { bus: FortisEventBus; emits: unknown[] } {
    const emits: unknown[] = [];
    const bus = {
        emit: (_event: string, payload: unknown) => {
            emits.push(payload);
            return true;
        },
    } as unknown as FortisEventBus;
    return { bus, emits };
}

const sample = (pid: number, name: string, rx: number, tx: number): BandwidthSample => ({
    pid,
    processName: name,
    rxBytes: rx,
    txBytes: tx,
});

function supportedSource(sets: Array<BandwidthSample[] | null>): SampleSource {
    let i = 0;
    return { supported: true, sample: () => Promise.resolve(sets[i++] ?? null) };
}

describe('BandwidthMonitor', () => {
    it('produces a ready snapshot with deltas on the second tick', async () => {
        const { bus, emits } = fakeBus();
        const source = supportedSource([[sample(1, 'a', 1000, 0)], [sample(1, 'a', 3000, 0)]]);
        const monitor = new BandwidthMonitor(bus, source);

        const nowSpy = vi.spyOn(Date, 'now');
        nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(3000);

        await monitor['tick']();
        await monitor['tick']();
        nowSpy.mockRestore();

        const current = monitor.getCurrent();
        expect(current.status).toBe('ready');
        expect(current.processes[0]?.pid).toBe(1);
        expect(current.processes[0]?.bytesInPerSec).toBe(1000);
        expect(emits.length).toBe(1);
    });

    it('reports "sampling", never "unsupported", while it waits for a second sample', async () => {
        const { bus } = fakeBus();
        const monitor = new BandwidthMonitor(bus, supportedSource([[sample(1, 'a', 1000, 0)]]));
        expect(monitor.getCurrent().status).toBe('sampling');
        await monitor['tick']();
        expect(monitor.getCurrent().status).toBe('sampling');
    });

    it('reports "unsupported" when the platform has no counter', async () => {
        const { bus } = fakeBus();
        const source: SampleSource = { supported: false, sample: () => Promise.resolve(null) };
        const monitor = new BandwidthMonitor(bus, source);
        await monitor['tick']();
        expect(monitor.getCurrent().status).toBe('unsupported');
    });

    it('holds the last good rates through a transient sampler failure', async () => {
        const { bus } = fakeBus();
        const source = supportedSource([
            [sample(1, 'a', 1000, 0)],
            [sample(1, 'a', 3000, 0)],
            null, // nettop hiccup
        ]);
        const monitor = new BandwidthMonitor(bus, source);
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const nowSpy = vi
            .spyOn(Date, 'now')
            .mockReturnValueOnce(1000)
            .mockReturnValueOnce(3000)
            .mockReturnValueOnce(8000);

        await monitor['tick']();
        await monitor['tick']();
        await monitor['tick']();
        nowSpy.mockRestore();
        spy.mockRestore();

        const current = monitor.getCurrent();
        expect(current.status).toBe('ready');
        expect(current.processes[0]?.bytesInPerSec).toBe(1000);
    });

    it('falls back to "sampling" once the last good sample goes stale', async () => {
        const { bus } = fakeBus();
        const source = supportedSource([[sample(1, 'a', 1000, 0)], [sample(1, 'a', 3000, 0)], null]);
        const monitor = new BandwidthMonitor(bus, source);
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const nowSpy = vi
            .spyOn(Date, 'now')
            .mockReturnValueOnce(1000)
            .mockReturnValueOnce(3000)
            .mockReturnValueOnce(3000 + 20_000);

        await monitor['tick']();
        await monitor['tick']();
        await monitor['tick']();
        nowSpy.mockRestore();
        spy.mockRestore();

        expect(monitor.getCurrent().status).toBe('sampling');
    });

    it('degrades to "sampling" when a supported source throws', async () => {
        const { bus } = fakeBus();
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const source: SampleSource = { supported: true, sample: () => Promise.reject(new Error('boom')) };
        const monitor = new BandwidthMonitor(bus, source);
        await monitor['tick']();
        expect(monitor.getCurrent().status).toBe('sampling');
        spy.mockRestore();
    });

    it('does not re-push an identical snapshot while a supported sampler stays down', async () => {
        const { bus, emits } = fakeBus();
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const source: SampleSource = { supported: true, sample: () => Promise.resolve(null) };
        const monitor = new BandwidthMonitor(bus, source);

        await monitor['tick']();
        await monitor['tick']();
        await monitor['tick']();
        spy.mockRestore();

        expect(monitor.getCurrent().status).toBe('sampling');
        expect(emits).toEqual([]);
    });

    it('drops its baseline on stop so a restart cannot divide by a stale interval', async () => {
        const { bus } = fakeBus();
        const monitor = new BandwidthMonitor(bus, supportedSource([[sample(1, 'a', 1000, 0)]]));
        await monitor['tick']();
        monitor.stop();
        expect(monitor['prev']).toBeNull();
        expect(monitor['prevAt']).toBe(0);
    });
});

describe('createBandwidthSource', () => {
    it('is unsupported on non-darwin platforms and runs no command', async () => {
        for (const platform of ['linux', 'win32'] as const) {
            const source = createBandwidthSource(platform);
            expect(source.supported).toBe(false);
            await expect(source.sample()).resolves.toBeNull();
        }
    });

    it('is supported on darwin', () => {
        expect(createBandwidthSource('darwin').supported).toBe(true);
    });
});
