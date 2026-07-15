import { describe, it, expect } from 'vitest';
import { buildSubmission, buildSubmissionBatch, categoryFor } from './threat-intel-payload';
import type { Alert } from '../../../shared/types/alert';

const alert = {
    id: 'a1',
    dedupKey: 'd1',
    title: 'Suspicious beacon',
    description: 'desc',
    recommendation: 'block',
    threatLevel: 'danger',
    timestamp: 1_700_000_123_456,
    processName: 'curl',
    remoteAddress: '203.0.113.7',
    remotePort: 443,
} as unknown as Alert;

const hashIP = (ip: string): string => `hashed:${ip.length}:${ip.replace(/[^a-z]/g, 'x')}`;

describe('threat-intel-payload', () => {
    it('emits ONLY anonymized fields — never the raw IP or process name', () => {
        const s = buildSubmission(alert, hashIP);
        const json = JSON.stringify(s);
        expect(json).not.toContain('203.0.113.7');
        expect(json).not.toContain('curl');
        expect(s.destHash).toBe(hashIP('203.0.113.7'));
        expect(s.destPort).toBe(443);
        expect(s.threatLevel).toBe('danger');
    });
    it('buckets the timestamp to 5-minute granularity', () => {
        const s = buildSubmission(alert, hashIP);
        expect(s.bucketedAt % (5 * 60 * 1000)).toBe(0);
        expect(s.bucketedAt).toBeLessThanOrEqual(alert.timestamp);
    });
    it('derives a coarse category from the title/level', () => {
        expect(typeof categoryFor(alert)).toBe('string');
        expect(categoryFor(alert).length).toBeGreaterThan(0);
        expect(categoryFor(alert)).toBe('beaconing');
    });
    it('builds a batch and skips alerts without a remote address', () => {
        const noAddr = { ...alert, remoteAddress: undefined } as unknown as Alert;
        const batch = buildSubmissionBatch([alert, noAddr], hashIP);
        expect(batch.length).toBe(1);
    });
});
