import { describe, it, expect } from 'vitest';
import { computeDeltas } from '@main/services/bandwidth/bandwidth-delta';

const sample = (pid: number, name: string, rx: number, tx: number) => ({
    pid,
    processName: name,
    rxBytes: rx,
    txBytes: tx,
});

describe('computeDeltas', () => {
    it('computes per-second rates', () => {
        const prev = [sample(1, 'a', 1000, 500)];
        const next = [sample(1, 'a', 3000, 1500)];
        const out = computeDeltas(prev, next, 2000);
        expect(out[0]).toMatchObject({ pid: 1, processName: 'a', bytesInPerSec: 1000, bytesOutPerSec: 500 });
    });

    it('guards dt<=0', () => {
        expect(computeDeltas([sample(1, 'a', 0, 0)], [sample(1, 'a', 100, 100)], 0)).toEqual([]);
    });

    it('guards counter reset (negative delta -> 0)', () => {
        const out = computeDeltas([sample(1, 'a', 5000, 5000)], [sample(1, 'a', 100, 100)], 1000);
        expect(out[0]?.bytesInPerSec).toBe(0);
        expect(out[0]?.bytesOutPerSec).toBe(0);
    });

    it('ignores pids not in prev', () => {
        const out = computeDeltas([sample(1, 'a', 0, 0)], [sample(1, 'a', 1000, 0), sample(9, 'z', 5000, 0)], 1000);
        expect(out).toHaveLength(1);
        expect(out[0]?.pid).toBe(1);
    });

    it('ignores pids not in next', () => {
        const out = computeDeltas([sample(1, 'a', 0, 0), sample(2, 'b', 0, 0)], [sample(1, 'a', 1000, 0)], 1000);
        expect(out).toHaveLength(1);
        expect(out[0]?.pid).toBe(1);
    });

    it('does not attribute a recycled pid to the process that used to own it', () => {
        const prev = [sample(1, 'old-process', 1000, 1000)];
        const next = [sample(1, 'new-process', 9000, 9000)];
        expect(computeDeltas(prev, next, 1000)).toEqual([]);
    });
});
